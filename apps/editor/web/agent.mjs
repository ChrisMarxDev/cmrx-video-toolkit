import { browserRequest, embeddedRequest, continuationMessage } from '../../review-agent/bridge.mjs';

export async function createHost(token) {
  if (!globalThis.__VIDEO_REVIEW_MCP__) {
    const request = browserRequest({ token });
    const response = await fetch('/api/session', { headers: { 'X-Review-Token': token } });
    if (!response.ok && response.status !== 404) throw Error('Cannot connect to the review session.');
    return { request, session: response.ok ? await response.json() : null,
      mediaUrl: sha => `/media?token=${encodeURIComponent(token)}&revision=${encodeURIComponent(sha)}` };
  }
  let sequence = 0;
  const pending = new Map();
  const post = message => parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Host did not answer ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    post({ id, method, params });
  });
  let receive;
  const opened = new Promise(resolve => { receive = resolve; });
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.jsonrpc !== '2.0') return;
    const message = event.data;
    if (pending.has(message.id)) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(call.timer);
      message.error ? call.reject(Error(message.error.message)) : call.resolve(message.result);
    } else if (message.method === 'ui/notifications/tool-result' && message.params?.structuredContent?.sessionId) {
      receive(message.params.structuredContent);
    } else if (message.method === 'ui/resource-teardown') {
      document.querySelector('video')?.pause();
      post({ id: message.id, result: {} });
    }
  });
  await rpc('ui/initialize', { appInfo: { name: 'video-review', version: '0.1.0' }, appCapabilities: {}, protocolVersion: '2026-01-26' });
  post({ method: 'ui/notifications/initialized', params: {} });
  let timer;
  const session = await Promise.race([opened, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('The host did not supply a review session. Reopen the review.')), 30000);
  })]).finally(() => clearTimeout(timer));
  new ResizeObserver(() => post({ method: 'ui/notifications/size-changed', params: { height: document.documentElement.scrollHeight } })).observe(document.body);
  return { session, request: embeddedRequest({ sessionId: session.sessionId, callServerTool: params => rpc('tools/call', params) }),
    mediaUrl: () => session.mediaUrl,
    notify: result => rpc('ui/message', { role: 'user', content: [{ type: 'text', text: continuationMessage(result) }] }) };
}
