import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import vm from 'node:vm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ComponentRuntime } from './runtime.mjs';
import { createServer } from './mcp.mjs';
import { browserResource, uiUri } from './resource.mjs';

async function fixture(t, { built = true, run } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'components-mcp-'));
  await mkdir(join(root, 'components'));
  const catalog = await new ComponentRuntime().catalog();
  await writeFile(join(root, 'components/components.json'), JSON.stringify(catalog));
  const web = join(root, 'tools/component_browser/build/web');
  await mkdir(web, { recursive: true });
  if (built) await writeFile(join(web, 'index.html'), '<html>synthetic workbench</html>');
  const runtime = new ComponentRuntime({ root, run });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  return { runtime, web, root };
}

function raw(url, path, headers = {}, method = 'GET') {
  return new Promise((done, fail) => {
    const req = request(new URL(url), { path, headers, method }, res => {
      let text = ''; res.on('data', b => text += b); res.on('end', () => done({ status: res.statusCode, headers: res.headers, text }));
    }); req.on('error', fail); req.end();
  });
}

test('real catalog search and resolved preset values need no Flutter', async () => {
  const runtime = new ComponentRuntime({ run: () => { throw Error('must not build'); } });
  const found = await runtime.list({ query: 'caption', limit: 1 });
  assert.equal(found.components[0].id, 'video.caption');
  const detail = await runtime.get({ id: 'video.block', variant: 'active' });
  assert.equal(detail.selection.props.active, true);
  assert.equal(detail.selection.props.text, 'Context');
  assert.equal(detail.component.source, 'components/lib/src/components.dart');
  const page = await runtime.list({ limit: 1 });
  assert.equal(page.nextOffset, 1);
  assert.equal((await runtime.list({ category: 'does not exist' })).total, 0);
  await assert.rejects(runtime.get({ id: 'nope' }), /Unknown component/);
  await assert.rejects(runtime.get({ id: 'video.block', variant: 'nope' }), /Unknown variant/);
});

test('open validates selection, shares listener, serves only public web files and supports ranges', async t => {
  const { runtime, web, root } = await fixture(t);
  await writeFile(join(web, 'clip.mp4'), '0123456789');
  await writeFile(join(root, 'private.txt'), 'secret');
  await symlink(join(root, 'private.txt'), join(web, 'escape.txt'));
  await assert.rejects(runtime.open({ variant: 'active' }), /requires/);
  const [a, b] = await Promise.all([runtime.open({ id: 'video.block', variant: 'active' }), runtime.open()]);
  assert.equal(new URL(a.browserUrl).origin, new URL(b.browserUrl).origin);
  assert.equal(new URL(a.browserUrl).hash, '#/video.block?variant=active');
  assert.equal((await fetch(a.browserUrl)).status, 200);
  const origin = new URL(a.browserUrl).origin;
  assert.equal((await raw(origin, '/', { Host: 'attacker.test' })).status, 403);
  assert.equal((await raw(origin, '/', {}, 'POST')).status, 405);
  assert.equal((await raw(origin, '/escape.txt')).status, 403);
  assert.equal((await raw(origin, '/..%2f..%2fprivate.txt')).text.includes('secret'), false);
  assert.equal((await raw(origin, '/missing')).status, 404);
  assert.equal((await raw(origin, '/%broken')).status, 400);
  const range = await raw(origin, '/clip.mp4', { Range: 'bytes=2-5' });
  assert.equal(range.status, 206); assert.equal(range.text, '2345');
  assert.equal(range.headers['content-range'], 'bytes 2-5/10');
  assert.equal((await raw(origin, '/clip.mp4', { Range: 'bytes=-3' })).text, '789');
  assert.equal((await raw(origin, '/clip.mp4', { Range: 'bytes=999-' })).status, 416);
  assert.equal((await raw(origin, '/clip.mp4', {}, 'HEAD')).text, '');
  await runtime.close();
  await assert.rejects(fetch(origin));
  await assert.rejects(runtime.open(), /closed/);
});

test('one cold build for concurrent opens, explicit rebuild, and retry after build failure', async t => {
  let calls = [];
  const { runtime, web } = await fixture(t, { built: false, run: async (command, args) => {
    calls.push([command, args]);
    if (args[0] === 'build') await writeFile(join(web, 'index.html'), 'built');
  } });
  await Promise.all([runtime.open(), runtime.open()]);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2][1], ['build', 'web', '--no-web-resources-cdn']);
  await runtime.open(); assert.equal(calls.length, 3);
  await runtime.open({ rebuild: true }); assert.equal(calls.length, 6);
  runtime.run = async () => { throw Error('Flutter missing'); };
  await assert.rejects(runtime.open({ rebuild: true }), /Flutter missing/);
  runtime.run = async () => {};
  await runtime.open({ rebuild: true });
});

test('MCP client discovers tools, reads catalog/resource and gets actionable tool errors', async t => {
  const { runtime } = await fixture(t);
  const server = createServer(runtime);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(t => t.name).sort(), ['get_component', 'list_components', 'open_component_browser']);
  assert.equal(tools.find(t => t.name === 'open_component_browser')._meta.ui.resourceUri, uiUri);
  const search = await client.callTool({ name: 'list_components', arguments: { query: 'caption' } });
  assert.ok(search.structuredContent.components.some(c => c.id === 'video.caption'));
  const error = await client.callTool({ name: 'get_component', arguments: { id: 'missing' } });
  assert.equal(error.isError, true);
  const invalid = await client.callTool({ name: 'list_components', arguments: { limit: 0 } });
  assert.equal(invalid.isError, true);
  // Hosts can prefetch the resource before the open tool completes.
  const resource = (await client.readResource({ uri: uiUri })).contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  const result = await client.callTool({ name: 'open_component_browser', arguments: { id: 'video.block' } });
  assert.equal(resource._meta.ui.csp.frameDomains[0], new URL(result.structuredContent.browserUrl).origin);
  runtime.run = async () => { throw Error('install Flutter'); };
  const failure = await client.callTool({ name: 'open_component_browser', arguments: { rebuild: true } });
  assert.equal(failure.isError, true); assert.match(failure.content[0].text, /install Flutter/);
});

test('embedded wrapper trusts only parent results on the fixed local origin', () => {
  const origin = 'http://127.0.0.1:12345';
  const resource = browserResource(origin);
  const elements = Object.fromEntries(['status', 'fallback', 'browser'].map(id => [id, { hidden: true }]));
  const messages = []; let listener;
  const parent = { postMessage: msg => messages.push(msg) };
  vm.runInNewContext(resource.text.match(/<script>([\s\S]*)<\/script>/)[1], {
    parent, URL, document: { getElementById: id => elements[id] }, addEventListener: (_, fn) => { listener = fn; },
  });
  assert.equal(messages[0].method, 'ui/initialize');
  const send = (data, source = parent) => listener({ source, data: { jsonrpc: '2.0', ...data } });
  send({ id: 'init', result: {} });
  assert.equal(messages.at(-1).method, 'ui/notifications/initialized');
  const result = url => ({ method: 'ui/notifications/tool-result', params: { structuredContent: { browserUrl: url } } });
  send(result(`${origin}/#/video.block`), {}); assert.equal(elements.browser.src, undefined);
  send(result('https://attacker.test/')); assert.equal(elements.browser.src, undefined);
  send(result(`${origin}/#/video.block`)); assert.equal(elements.browser.src, `${origin}/#/video.block`);
  elements.fallback.onclick(); assert.equal(messages.at(-1).method, 'ui/open-link');
  send({ id: 'bye', method: 'ui/resource-teardown' }); assert.equal(elements.browser.src, 'about:blank');
  assert.equal(messages.at(-1).id, 'bye');
});

test('actual stdio entrypoint returns catalog and shuts down its HTTP server on disconnect', async () => {
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const { fileURLToPath } = await import('node:url');
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('./mcp.mjs', import.meta.url))], stderr: 'pipe' });
  const client = new Client({ name: 'stdio-test', version: '1' });
  let origin;
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'get_component', arguments: { id: 'video.caption' } });
    assert.equal(result.structuredContent.component.widget, 'VideoCaption');
    const resource = await client.readResource({ uri: uiUri });
    origin = resource.contents[0]._meta.ui.csp.frameDomains[0];
    // A resource prefetch starts HTTP but never triggers a Flutter build.
    const response = await fetch(origin);
    assert.ok([200, 404].includes(response.status));
  } finally { await client.close(); }
  await assert.rejects(fetch(origin));
});

test('missing build executable gives a diagnostic instead of hanging', async t => {
  const { runtime } = await fixture(t);
  await assert.rejects(runtime.runCommand('/definitely-not-a-toolkit-executable', [], runtime.root), /Cannot run.*README/);
});
