import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const uiUri = 'ui://video-review-sample/v1.html';
const duration = 8;
const idSchema = z.string().uuid();
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const writable = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export async function startSample({ port = 4877, directory = resolve(here, '.local'), publicUrl, key = '' } = {}) {
  await mkdir(directory, { recursive: true });
  const media = resolve(directory, 'sample.mp4');
  try { await access(media); } catch {
    const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i',
      'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', String(duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', media]);
    if (made.status !== 0) throw Error(`Synthetic fixture needs FFmpeg: ${made.error?.message || made.stderr}`);
  }
  const prefix = key ? `/${encodeURIComponent(key)}` : '';
  const app = express();
  app.disable('x-powered-by');
  let origin;
  const artifact = id => resolve(directory, `${idSchema.parse(id)}.json`);
  const load = async id => JSON.parse(await readFile(artifact(id), 'utf8'));
  const persist = async doc => {
    const target = artifact(doc.sessionId), temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(doc, null, 2) + '\n');
    await rename(temporary, target);
  };
  const result = doc => ({ content: [{ type: 'text', text: JSON.stringify(doc) }], structuredContent: doc });
  const safe = fn => async args => {
    try { return await fn(args); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.code === 'ENOENT' ? 'Unknown review session.' : error.message }] }; }
  };
  function makeMcp() {
    const server = new McpServer({ name: 'video-review-sample', version: '0.1.0' });
    server.registerResource('review-view', uiUri, {}, async () => ({ contents: [{
      uri: uiUri, mimeType: 'text/html;profile=mcp-app', text: await readFile(resolve(here, 'view.html'), 'utf8'),
      _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [origin], connectDomains: [] } },
        'openai/widgetDescription': 'Synthetic video review: play, seek, annotate, then Done writes a local artifact.' },
    }] }));
    server.registerTool('open_review_sample', {
      description: 'Open the tiny interactive video review sample. Ask the user to play, seek, add an annotation and click Done. Do not complete it on their behalf.',
      inputSchema: {}, annotations: writable,
      _meta: { ui: { resourceUri: uiUri }, 'openai/outputTemplate': uiUri },
    }, safe(async () => {
      const sessionId = randomUUID();
      const doc = { sessionId, status: 'draft', videoUrl: `${origin}${prefix}/sample.mp4`, duration,
        artifactPath: artifact(sessionId), annotation: null };
      await persist(doc);
      return result(doc);
    }));
    server.registerTool('finish_review_sample', {
      description: 'Save the user-approved annotation and complete this synthetic review. Only call on explicit user confirmation, normally from the Done button.',
      inputSchema: { sessionId: idSchema, text: z.string().trim().min(1).max(1000),
        start: z.number().min(0).max(duration), end: z.number().min(0).max(duration),
        playback: z.object({ played: z.boolean(), seeked: z.boolean(), currentTime: z.number().min(0).max(duration + 1), error: z.string().max(300) }) },
      annotations: { ...writable, idempotentHint: true },
    }, safe(async ({ sessionId, text, start, end, playback }) => {
      if (end <= start) throw Error('End must be after start.');
      const doc = await load(sessionId);
      const completed = { ...doc, status: 'completed', annotation: { text, source_start: start, source_end: end }, playback };
      await persist(completed);
      return result(completed);
    }));
    server.registerTool('get_review_sample', {
      description: 'Read the saved local review by sessionId. Use after the user clicks Done to continue with the artifact.',
      inputSchema: { sessionId: idSchema }, annotations: readOnly,
    }, safe(async ({ sessionId }) => result(await load(sessionId))));
    return server;
  }
  app.get(`${prefix}/health`, (_req, res) => res.json({ ready: true, syntheticOnly: true }));
  // The one allowlisted fixture lives in an ignored .local directory.
  app.get(`${prefix}/sample.mp4`, (_req, res) => res.sendFile(media, { dotfiles: 'allow' }));
  app.all(`${prefix}/mcp`, async (req, res) => {
    // This probe uses JSON request/response only; do not leave an idle SSE
    // stream open through a development tunnel.
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').json({ error: 'Use POST for this stateless MCP endpoint.' });
    // Stateless transport: all review state is on disk, not tied to a connection.
    const server = makeMcp();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res); }
    catch (error) { console.error(error); if (!res.headersSent) res.status(500).end('MCP request failed'); }
  });
  const listener = await new Promise((yes, no) => {
    const listener = app.listen(port, '127.0.0.1', () => yes(listener));
    listener.on('error', no);
  });
  const localUrl = `http://127.0.0.1:${listener.address().port}`;
  origin = publicUrl ? new URL(publicUrl).origin : localUrl;
  return { localUrl, mcpUrl: `${origin}${prefix}/mcp`, directory,
    close: () => new Promise((yes, no) => listener.close(error => error ? no(error) : yes())) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const instance = await startSample({ port: Number(process.env.PORT || 4877),
    directory: process.env.REVIEW_SAMPLE_DIR ? resolve(process.env.REVIEW_SAMPLE_DIR) : undefined,
    publicUrl: process.env.PUBLIC_URL, key: process.env.SAMPLE_KEY || '' });
  console.log(JSON.stringify({ mcpUrl: instance.mcpUrl, artifacts: instance.directory, syntheticOnly: true }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await instance.close(); process.exit(0); });
}
