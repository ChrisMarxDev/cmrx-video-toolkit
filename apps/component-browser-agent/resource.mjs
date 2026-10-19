export const uiUri = 'ui://video-components/browser.html';

export function browserResource(origin) {
  const encodedOrigin = JSON.stringify(origin).replace(/</g, '\\u003c');
  return { uri: uiUri, mimeType: 'text/html;profile=mcp-app',
    _meta: { ui: { prefersBorder: true, csp: { frameDomains: [origin], connectDomains: [origin], resourceDomains: [origin] } } },
    text: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Video components</title><style>body{margin:0;font:14px system-ui}header{padding:12px}iframe{width:100%;height:740px;border:0}p{margin:4px 0}</style></head>
<body><header><p id="status">Preparing component browser…</p><p>Use the browser’s Copy flow reference to share your chosen properties with the agent.</p><button id="fallback" hidden>Open in browser</button></header>
<iframe id="browser" title="Component browser" allow="clipboard-write" hidden></iframe>
<script>
const origin = ${encodedOrigin};
let url;
const send = value => parent.postMessage({jsonrpc:'2.0',...value}, '*');
const status = document.getElementById('status');
const button = document.getElementById('fallback');
const frame = document.getElementById('browser');
button.onclick = () => send({id:'open-link', method:'ui/open-link', params:{url}});
addEventListener('message', event => {
  if (event.source !== parent) return;
  const message = event.data;
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.id === 'init' && message.result) send({method:'ui/notifications/initialized',params:{}});
  if (message.id === 'open-link' && (message.error || message.result?.isError)) status.textContent = 'Open the browserUrl returned by the tool in your browser.';
  if (message.method === 'ui/notifications/tool-result') {
    const result = message.params;
    if (result?.isError) { status.textContent = 'The browser could not start. See the tool error for setup details.'; return; }
    const candidate = result?.structuredContent?.browserUrl;
    try {
      const parsed = new URL(candidate);
      if (parsed.origin !== origin || parsed.pathname !== '/' || parsed.username || parsed.password) return;
      url = parsed.href; frame.src = url; frame.hidden = false; button.hidden = false;
      status.textContent = 'If the preview stays blank, use Open in browser. Inline display requires permission for local frames.';
    } catch {}
  }
  if (message.method === 'ui/resource-teardown') {
    frame.src = 'about:blank';
    if (message.id !== undefined) send({id:message.id,result:{}});
  }
});
send({id:'init',method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'video-components',version:'0.1.0'},appCapabilities:{}}});
</script></body></html>` };
}
