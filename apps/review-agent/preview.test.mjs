import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './mcp.mjs';
import { previewUri } from '../../tools/previewer/resource.mjs';

test('edit MCP exposes an independent player, status and close contract', async () => {
  const sessionId = 'b740aee0-5b1e-41b6-9a46-754282458a13';
  let state = { sessionId, status: 'starting', browserUrl: null };
  const previewRuntime = {
    open: args => { assert.equal(args.path, 'video.dart'); return state; },
    get: id => { assert.equal(id, sessionId); return state; },
    stop: () => state = { ...state, status: 'closed', browserUrl: null },
    origins: () => state.browserUrl ? [new URL(state.browserUrl).origin] : [],
  };
  const server = createServer({}, { previewRuntime });
  const client = new Client({ name: 'preview-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const tools = (await client.listTools()).tools;
    for (const name of ['open_review', 'get_review', 'open_preview', 'get_preview', 'close_preview']) assert.ok(tools.some(t => t.name === name));
    assert.equal(tools.find(t => t.name === 'show_preview')._meta.ui.resourceUri, previewUri);
    assert.equal((await client.callTool({ name: 'open_preview', arguments: { path: 'video.dart', project: '.' } })).structuredContent.status, 'starting');
    assert.ok((await client.callTool({ name: 'show_preview', arguments: { sessionId } })).isError);
    assert.equal(tools.find(t => t.name === 'get_preview')._meta, undefined);
    state = { ...state, status: 'ready', browserUrl: 'http://127.0.0.1:4321/' };
    assert.equal((await client.callTool({ name: 'get_preview', arguments: { sessionId } })).structuredContent.status, 'ready');
    assert.equal((await client.callTool({ name: 'show_preview', arguments: { sessionId } })).structuredContent.status, 'ready');
    const resource = (await client.readResource({ uri: previewUri })).contents[0];
    assert.deepEqual(resource._meta.ui.csp.frameDomains, ['http://127.0.0.1:4321']);
    assert.ok(!resource.text.includes('transcript'));
    assert.equal((await client.callTool({ name: 'close_preview', arguments: { sessionId } })).structuredContent.status, 'closed');
  } finally { await client.close(); await server.close(); }
});
