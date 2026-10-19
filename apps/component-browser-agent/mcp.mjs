import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComponentRuntime } from './runtime.mjs';
import { browserResource, uiUri } from './resource.mjs';

export function createServer(runtime) {
  const server = new McpServer({ name: 'video-components', version: '0.1.0' });
  const safe = fn => async args => {
    try {
      const value = await fn(args);
      return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
    } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  };
  const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  server.registerTool('list_components', {
    description: 'Search the canonical component catalog by name, ID, widget, purpose or exact category. No Flutter build or browser required.',
    inputSchema: { query: z.string().optional(), category: z.string().optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(30) }, annotations,
  }, safe(args => runtime.list(args)));
  server.registerTool('get_component', {
    description: 'Read a real component, controls, variants and source path, with resolved default/preset props. This is catalog data, not a generated constructor or approval to use decorative content.',
    inputSchema: { id: z.string().min(1), variant: z.string().min(1).optional() }, annotations,
  }, safe(args => runtime.get(args)));
  server.registerResource('component-browser', uiUri, { mimeType: 'text/html;profile=mcp-app' }, async () => ({ contents: [browserResource(await runtime.origin())] }));
  server.registerTool('open_component_browser', {
    description: 'Serve the actual Flutter component browser locally, optionally focused on a component/preset. Builds if missing; rebuild=true refreshes changed source. Requires Flutter, Python and FFmpeg for a build. Returns browserUrl and an MCP App for hosts permitting local nested frames. Does not automate or launch a desktop browser. UI edits are shared via Copy flow reference, not automatic agent feedback.',
    inputSchema: { id: z.string().min(1).optional(), variant: z.string().min(1).optional(), rebuild: z.boolean().default(false) },
    annotations: { ...annotations, readOnlyHint: false },
    _meta: { ui: { resourceUri: uiUri }, 'openai/outputTemplate': uiUri },
  }, safe(args => runtime.open(args)));
  return server;
}

export async function main() {
  if (process.argv.length > 2) throw Error('Usage: node mcp.mjs (serves this toolkit checkout only)');
  const runtime = new ComponentRuntime();
  const server = createServer(runtime);
  const transport = new StdioServerTransport();
  let closing;
  const close = () => closing ??= (async () => { await runtime.close(); await server.close(); })();
  await server.connect(transport);
  server.server.onclose = () => void close();
  process.stdin.on('end', () => void close());
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void close());
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
