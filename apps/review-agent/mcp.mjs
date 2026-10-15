import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReviewRuntime } from './runtime.mjs';

export function createServer(runtime) {
  const server = new McpServer({ name: 'video-review', version: '0.1.0' });
  const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
  const safe = fn => async args => {
    try { return result(await fn(args)); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  };
  const annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool('open_review', {
    description: 'Prepare one local video or reopen review.json, and return its normal browser editor URL. Ask the human to review. Do not infer UI support from a tool response. This integration currently uses browser presentation.',
    inputSchema: { path: z.string().min(1), workspace: z.string().optional(), transcript: z.string().optional() }, annotations,
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
    inputSchema: { sessionId: z.string().uuid(), operation: z.enum(['state', 'session', 'save', 'finish', 'abandon']), body: z.record(z.string(), z.unknown()).optional() },
    annotations, _meta: { ui: { visibility: ['app'] } },
  }, safe(({ sessionId, operation, body }) => runtime.request(sessionId, operation, body)));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--root') throw Error('Usage: node mcp.mjs --root /absolute/project');
  const runtime = new ReviewRuntime({ root: args[1] });
  const server = createServer(runtime);
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
