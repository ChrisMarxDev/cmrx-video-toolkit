import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReviewRuntime } from './runtime.mjs';
import { editorResource, uiUri } from './resource.mjs';
import { PreviewRuntime } from '../../tools/previewer/runtime.mjs';
import { previewResource, previewUri } from '../../tools/previewer/resource.mjs';

export function createServer(runtime, { decorateResource, previewRuntime,
  resourceFactory = editorResource, resourceUri = uiUri, requirePath = false } = {}) {
  const server = new McpServer({ name: 'video-review', version: '0.1.0' });
  const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
  const safe = fn => async args => {
    try { return result(await fn(args)); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  };
  const annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerResource('video-review-editor', resourceUri, { mimeType: 'text/html;profile=mcp-app' }, async () => ({ contents: [
    await resourceFactory([await runtime.mediaOrigin()], decorateResource),
  ] }));
  server.registerTool('open_review', {
    description: requirePath
      ? 'Open a supplied local recording, rendered video or review.json in the review surface. Path is required. Ask the human to review and click Send feedback. Read the completed review with get_review, then edit clear feedback or ask about ambiguity. Hosts supporting MCP Apps display it inline; browserUrl is a manual fallback. Do not infer absent UI from receiving session data. This route does not load live compositions.'
      : 'Open a local recording, edited/rendered video, or review.json directly in the review app. After an authorized draft render, call this with the exact output path and a separate workspace per revision so the human can comment; no re-upload or picker is needed. Feedback times belong to that opened video. Omit path to let the user choose a video in the local browser editor; no chat attachment is needed. Ask the human to review and click Done. Hosts supporting MCP Apps display it inline; other hosts can open browserUrl. Do not infer absent UI from receiving session data.',
    inputSchema: { path: requirePath ? z.string().min(1) : z.string().min(1).optional(), workspace: z.string().optional(), transcript: z.string().optional() }, annotations,
    _meta: { ui: { resourceUri }, 'openai/outputTemplate': resourceUri },
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
  if (previewRuntime) {
    server.registerResource('composition-previewer', previewUri, { mimeType: 'text/html;profile=mcp-app' },
      async () => ({ contents: [previewResource(previewRuntime.origins())] }));
    server.registerTool('open_preview', {
      description: 'Start or reuse a live authored Fluvie composition preview without encoding a video. Runs trusted Dart source inside the configured root. Requires the JSON web preview API. Returns starting immediately; poll get_preview until ready, then call show_preview once or present browserUrl. Source edits reload automatically. No editing, notes, export or approval in this player.',
      inputSchema: { path: z.string().min(1).optional(), project: z.string().min(1), entry: z.string().optional() }, annotations,
    }, safe(args => previewRuntime.open(args)));
    server.registerTool('get_preview', {
      description: 'Read preview startup/reload status without opening a UI panel. Poll while starting; once ready call show_preview. A ready server is not proof of visual correctness.',
      inputSchema: { sessionId: z.string().uuid() }, annotations: { ...annotations, readOnlyHint: true },
    }, safe(({ sessionId }) => previewRuntime.get(sessionId)));
    server.registerTool('show_preview', {
      description: 'Show a ready composition in the minimal player once. Local iframe support is required; browserUrl is the fallback. Playback and seeking need no further host tool calls.',
      inputSchema: { sessionId: z.string().uuid() }, annotations: { ...annotations, readOnlyHint: true },
      _meta: { ui: { resourceUri: previewUri }, 'openai/outputTemplate': previewUri },
    }, safe(({ sessionId }) => {
      const state = previewRuntime.get(sessionId);
      if (state.status !== 'ready') throw Error('Preview is not ready; use get_preview to check startup.');
      return state;
    }));
    server.registerTool('close_preview', {
      description: 'Stop a live preview and its Flutter processes. Preserve authored files; no export or review approval.',
      inputSchema: { sessionId: z.string().uuid() }, annotations,
    }, safe(({ sessionId }) => previewRuntime.stop(sessionId)));
  }
  return server;
}

export async function main(options = {}) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--root') throw Error('Usage: node mcp.mjs --root /absolute/project');
  const runtime = new ReviewRuntime({ root: args[1] });
  const previewRuntime = new PreviewRuntime({ root: args[1] });
  const server = createServer(runtime, { ...options, previewRuntime });
  const transport = new StdioServerTransport();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await previewRuntime.close();
    await runtime.close();
    await server.close();
  };
  transport.onclose = close;
  process.stdin.on('end', close);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void close());
  await server.connect(transport);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
