import { createFalClient } from '@fal-ai/client';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import path from 'node:path';

function endpoint(value) {
  if (typeof value !== 'string' || !/^[\w-]+\/[\w-]+(?:\/[\w-]+)*$/.test(value)) {
    throw new Error('Use a fal endpoint ID, not a URL.');
  }
  return value;
}
function job(value) {
  if (value?.schemaVersion !== 1 || value.provider !== 'fal' ||
      typeof value.requestId !== 'string' || !/^[\w-]+$/.test(value.requestId)) {
    throw new Error('Invalid fal job receipt.');
  }
  endpoint(value.endpoint);
  return value;
}

/** Server/local use only. No global SDK configuration or implicit generation. */
export function createVideoFal({ apiKey = process.env.FAL_KEY, client, fetchImpl = fetch } = {}) {
  if (!client && !apiKey?.trim()) throw new Error('Set FAL_KEY in the server environment.');
  const sdk = client ?? createFalClient({
    credentials: apiKey,
    retry: { maxRetries: 0 }, // Never silently repeat a potentially billable submission.
    fetch: async (url, options) => {
      // Queue methods override SDK retry config. Normalize transport/HTTP failures
      // here so a billable submit cannot be retried by those internal policies.
      let response;
      try {
        response = await fetchImpl(url, {
          ...options, signal: options?.signal ?? AbortSignal.timeout(60_000),
        });
      } catch {
        throw new Error('fal transport failed; request outcome may be unknown. Check your fal dashboard before resubmitting.');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`fal request failed (HTTP ${response.status}).`);
      }
      return response;
    },
  });
  return {
    async submit(model, input) {
      endpoint(model);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be a JSON object.');
      const response = await sdk.queue.submit(model, { input });
      return job({ schemaVersion: 1, provider: 'fal', endpoint: model,
        requestId: response.request_id, input, submittedAt: new Date().toISOString() });
    },
    async status(receipt) {
      job(receipt);
      return sdk.queue.status(receipt.endpoint, { requestId: receipt.requestId, logs: false });
    },
    async cancel(receipt) {
      job(receipt);
      return sdk.queue.cancel(receipt.endpoint, { requestId: receipt.requestId });
    },
    async result(receipt) {
      job(receipt);
      const response = await sdk.queue.result(receipt.endpoint, { requestId: receipt.requestId });
      return response.data;
    },
  };
}

/** Discover typed file objects in arbitrary model output; ignore ordinary URLs. */
export function collectAssets(data) {
  const assets = new Map();
  function visit(value, pointer = '') {
    if (!value || typeof value !== 'object') return;
    if (typeof value.url === 'string' && typeof value.content_type === 'string' &&
        /^(image|video|audio)\//.test(value.content_type)) {
      if (!assets.has(value.url)) assets.set(value.url, { url: value.url, contentType: value.content_type, pointer });
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
    }
  }
  visit(data);
  return [...assets.values()];
}

const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
  'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a' };

/** Save into a NEW directory, with bounded streaming and no credentials on CDN requests. */
export async function saveAssets(receipt, data, directory, {
  fetchImpl = fetch, maxBytes = 1024 ** 3, timeoutMs = 120_000,
  allowedHosts = ['fal.media'],
} = {}) {
  job(receipt);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive integer.');
  const assets = collectAssets(data);
  if (!assets.length) throw new Error('No typed image/video/audio files found; inspect the raw result.');
  for (const asset of assets) {
    const url = new URL(asset.url);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
        !allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new Error('Asset host is not trusted; configure allowedHosts explicitly.');
    }
  }
  // No recursive mkdir: caller chooses an existing workspace parent. Never overwrite a prior export.
  await mkdir(directory);
  try {
    const saved = [];
    for (const [index, asset] of assets.entries()) {
      const response = await fetchImpl(asset.url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok || !response.body) throw new Error(`Asset download failed (HTTP ${response.status}).`);
      const filename = `asset-${String(index + 1).padStart(3, '0')}${extensions[asset.contentType] ?? '.bin'}`;
      const hash = createHash('sha256');
      let bytes = 0;
      const meter = new Transform({ transform(chunk, encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes) return callback(new Error('Asset exceeds maxBytes.'));
        hash.update(chunk);
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter,
        createWriteStream(path.join(directory, filename), { flags: 'wx' }));
      saved.push({ ...asset, path: filename, bytes, sha256: hash.digest('hex') });
    }
    const manifest = { ...receipt, downloadedAt: new Date().toISOString(), assets: saved, result: data };
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return manifest;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
