import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReviewRuntime } from './runtime.mjs';
import { editorResource, uiUri } from './resource.mjs';

export function createServer(runtime, { decorateResource } = {}) {
  const server = new McpServer({ name: 'video-review', version: '0.1.0' });
  const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
  const safe = fn => async args => {
    try { return result(await fn(args)); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  };
  const annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerResource('video-review-editor', uiUri, {}, async () => ({ contents: [
    await editorResource([await runtime.mediaOrigin()], decorateResource),
  ] }));
  server.registerTool('open_review', {
    description: 'Open the shared video review app for a local video or review.json. Omit path to let the user choose a video in the local browser editor; no chat attachment is needed. Ask the human to review and click Done. Hosts supporting MCP Apps display it inline; other hosts can open browserUrl. Do not infer absent UI from receiving session data.',
    inputSchema: { path: z.string().min(1).optional(), workspace: z.string().optional(), transcript: z.string().optional() }, annotations,
    _meta: { ui: { resourceUri: uiUri }, 'openai/outputTemplate': uiUri },
  }, safe(args => runtime.open(args)));
  server.registerTool('get_review', {
    description: 'Read review progress. After explicit Done, returns the canonical review.json, its artifact path and completion receipt. Drafts are not approval.',
    inputSchema: { sessionId: z.string().uuid() }, annotations: { ...annotations, readOnlyHint: true },
  }, safe(({ sessionId }) => runtime.get(sessionId)));
  server.registerTool('cancel_review', {
    description: 'Cancel a review session when the user asks to stop. Preserve saved drafts; never treat cancellation as approval.',
    inputSchema: { sessionId: z.string().uuid() }, annotations,
  }, safe(({ sessionId }) => runtime.request(sessionId, 'abandon', { sessionId })));
  server.registerTool('review_session_request', {
    description: 'UI transport for the review editor. Finish only from the human Done action after the editor flushes its pending saves.',
    inputSchema: { sessionId: z.string().uuid(), operation: z.enum(['state', 'session', 'save', 'finish', 'abandon', 'export', 'retry', 'cancel']), body: z.record(z.string(), z.unknown()).optional() },
    annotations, _meta: { ui: { visibility: ['app'] } },
  }, safe(({ sessionId, operation, body }) => runtime.request(sessionId, operation, body)));
  return server;
}

export async function main(options = {}) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--root') throw Error('Usage: node mcp.mjs --root /absolute/project');
  const runtime = new ReviewRuntime({ root: args[1] });
  const server = createServer(runtime, options);
  const transport = new StdioServerTransport();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
    await server.close();
  };
  transport.onclose = close;
  process.stdin.on('end', close);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void close());
  await server.connect(transport);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
