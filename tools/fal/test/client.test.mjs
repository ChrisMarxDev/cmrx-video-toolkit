import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createVideoFal, collectAssets, saveAssets } from '../src/index.mjs';

const receipt = { schemaVersion: 1, provider: 'fal', endpoint: 'fal-ai/test/model', requestId: 'test-id', input: { prompt: 'Synthetic square' } };
const data = { images: [{ url: 'https://v3.fal.media/files/test.png', content_type: 'image/png' }] };
async function workspace(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'video-fal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('missing key and endpoint URLs fail before networking', async () => {
  assert.throws(() => createVideoFal({ apiKey: '' }), /FAL_KEY/);
  const client = createVideoFal({ client: {} });
  await assert.rejects(client.submit('https://example.com', {}), /endpoint ID/);
  await assert.rejects(client.status({}), /receipt/);
});

test('official SDK sends auth only to queue and unwraps results', async () => {
  const requests = [];
  const client = createVideoFal({ apiKey: 'synthetic-key', fetchImpl: async (url, options) => {
    requests.push({ url, ...options });
    const body = options.method === 'POST' ? { request_id: 'test-id' }
      : String(url).endsWith('/status?logs=0') || String(url).includes('/status')
        ? { status: 'COMPLETED', request_id: 'test-id' } : data;
    return Response.json(body);
  } });
  const submitted = await client.submit(receipt.endpoint, receipt.input);
  assert.equal(submitted.requestId, 'test-id');
  assert.deepEqual(submitted.input, receipt.input);
  assert.equal((await client.status(submitted)).status, 'COMPLETED');
  assert.deepEqual(await client.result(submitted), data);
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(new URL(request.url).hostname, 'queue.fal.run');
    assert.equal(request.headers.Authorization, 'Key synthetic-key');
  }
  assert.deepEqual(JSON.parse(requests[0].body), receipt.input);
});

test('failed submission is not automatically retried', async () => {
  let calls = 0;
  const client = createVideoFal({ apiKey: 'synthetic', fetchImpl: async () => {
    calls++;
    return Response.json({ detail: 'unavailable' }, { status: 503 });
  } });
  await assert.rejects(client.submit(receipt.endpoint, {}));
  assert.equal(calls, 1);
});

test('cancellation uses saved job identity', async () => {
  const client = createVideoFal({ client: { queue: { cancel: async (...args) => {
    assert.deepEqual(args, [receipt.endpoint, { requestId: 'test-id' }]);
  } } } });
  await client.cancel(receipt);
});

test('collects nested media, deduplicates, ignores untyped URLs', () => {
  const output = { ...data, video: { url: 'https://fal.media/video.mp4', content_type: 'video/mp4' }, again: data, unrelated: { url: 'https://example.com' } };
  const assets = collectAssets(output);
  assert.equal(assets.length, 2);
  assert.equal(assets[0].pointer, '/images/0');
});

test('downloads without credentials and records hashes and relative paths', async t => {
  const dir = path.join(await workspace(t), 'export');
  const manifest = await saveAssets(receipt, data, dir, { fetchImpl: async (url, options) => {
    assert.equal(options.headers, undefined);
    assert.equal(options.redirect, 'error');
    return new Response('synthetic-media');
  } });
  assert.equal(await readFile(path.join(dir, 'asset-001.png'), 'utf8'), 'synthetic-media');
  assert.equal(manifest.assets[0].sha256, createHash('sha256').update('synthetic-media').digest('hex'));
  assert.equal(manifest.assets[0].bytes, 15);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'manifest.json'))), manifest);
  await assert.rejects(saveAssets(receipt, data, dir), { code: 'EEXIST' });
});

test('oversize, HTTP errors and broken streams leave no partial exports', async t => {
  const parent = await workspace(t);
  const cases = [() => new Response('too big'), () => new Response('', { status: 403 }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('broken')); } }))];
  for (const [i, fetchImpl] of cases.entries()) {
    const dir = path.join(parent, `export-${i}`);
    await assert.rejects(saveAssets(receipt, data, dir, { fetchImpl, maxBytes: 2 }));
    await assert.rejects(readFile(path.join(dir, 'manifest.json')), { code: 'ENOENT' });
    await mkdir(dir); // Directory itself was removed too.
  }
});

test('untrusted hosts, credentials, local URLs and empty results are rejected', async t => {
  const dir = path.join(await workspace(t), 'export');
  for (const url of ['http://fal.media/a', 'https://fal.media.evil.test/a', 'https://127.0.0.1/a', 'https://secret@fal.media/a']) {
    await assert.rejects(saveAssets(receipt, { video: { url, content_type: 'video/mp4' } }, dir), /not trusted/);
  }
  await assert.rejects(saveAssets(receipt, {}, dir), /No typed/);
});

test('CLI help requires no key and invalid command fails', () => {
  const cli = new URL('../src/cli.mjs', import.meta.url);
  const run = (...args) => spawnSync(process.execPath, [cli.pathname, ...args], { encoding: 'utf8', env: { ...process.env, FAL_KEY: '' } });
  assert.equal(run('--help').status, 0);
  assert.match(run('--help').stdout, /submit ENDPOINT/);
  assert.equal(run('unknown').status, 1);
  assert.match(run('status', 'unused.json').stderr, /FAL_KEY/);
});

test('ambiguous network failures are not retried or echoed', async () => {
  let calls = 0;
  const client = createVideoFal({ apiKey: 'synthetic', fetchImpl: async () => {
    calls++;
    throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
  } });
  await assert.rejects(client.submit(receipt.endpoint, {}), /outcome may be unknown/);
  assert.equal(calls, 1);
});
