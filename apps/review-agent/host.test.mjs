import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../editor/web/agent.mjs';

test('embedded editor uploads and edits without host tool calls or link opening', async () => {
  const saved = new Map();
  const install = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  const messages = [], requests = [], sizes = [];
  let listener;
  const session = { sessionId: 'fixture', apiUrl: 'http://127.0.0.1:1234/session/fixture/secret', mediaUrl: 'http://127.0.0.1:1234/media/fixture/secret' };
  const parent = { postMessage(message) {
    messages.push(message.method);
    if (message.method === 'ui/notifications/size-changed') sizes.push(message.params.height);
    // Simulate a host that supports initialization but rejects tools/call when idle.
    if (message.method === 'ui/initialize') queueMicrotask(() => listener({ source: parent, data: { jsonrpc: '2.0', id: message.id, result: {} } }));
    if (message.method === 'ui/notifications/initialized') queueMicrotask(() => listener({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: session } } }));
    assert.notEqual(message.method, 'tools/call');
    assert.notEqual(message.method, 'ui/open-link');
  } };
  install('__VIDEO_REVIEW_MCP__', true);
  install('parent', parent);
  install('addEventListener', (name, callback) => { if (name === 'message') listener = callback; });
  install('document', { body: { classList: { add() {}, toggle() {} }, scrollHeight: 1400 }, getElementById() { return null; }, documentElement: { scrollHeight: 1400 } });
  install('ResizeObserver', class { observe() {} });
  install('fetch', async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ok: true }) }; });
  try {
    const host = await createHost('');
    await host.request('state');
    await host.request('save', { revision: 1 });
    const file = { name: 'test.mp4' };
    await host.upload(file);
    assert.deepEqual(requests.map(r => r.url), ['state', 'save', 'upload'].map(op => `${session.apiUrl}/api/${op}`));
    assert.equal(requests[2].options.body, file);
    assert.equal(host.openBrowser, undefined);
    assert.deepEqual(sizes, [700], 'Long content must not grow the embedded window');
    assert.deepEqual(messages, ['ui/initialize', 'ui/notifications/initialized', 'ui/notifications/size-changed']);
  } finally {
    for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});
