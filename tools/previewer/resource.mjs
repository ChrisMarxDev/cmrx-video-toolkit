export const previewUri = 'ui://video-review/previewer-v1.html';

export function previewResource(origins) {
  return { uri: previewUri, mimeType: 'text/html;profile=mcp-app',
    _meta: { ui: { prefersBorder: true, csp: { frameDomains: origins, connectDomains: origins, resourceDomains: origins } } },
    text: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Previewer</title><style>html,body{margin:0;height:100%;background:#111;color:#eee;font:14px system-ui}iframe{display:block;width:100%;height:560px;border:0}iframe[hidden]{display:none}p{padding:20px}</style></head>
<body><p id="status" role="status">Preparing preview…</p><iframe id="player" title="Composition preview" allow="autoplay; fullscreen" allowfullscreen hidden></iframe>
<script>
const origins = ${JSON.stringify(origins).replace(/</g, '\\u003c')};
const frame = document.getElementById('player'), status = document.getElementById('status');
const send = value => parent.postMessage({jsonrpc:'2.0', ...value}, '*');
addEventListener('message', event => {
  if (event.source !== parent || event.data?.jsonrpc !== '2.0') return;
  const message = event.data;
  if (message.id === 'init' && message.result) {
    send({method:'ui/notifications/initialized',params:{}});
    send({method:'ui/notifications/size-changed',params:{height:560}});
  }
  if (message.method === 'ui/notifications/tool-result') {
    const state = message.params?.structuredContent;
    if (!state || state.status !== 'ready') {
      frame.hidden = true; frame.src = 'about:blank'; status.hidden = false;
      status.textContent = state?.status === 'failed' ? 'Preview could not start. See the tool result.' : 'Preparing preview…';
      return;
    }
    try {
      const url = new URL(state.browserUrl);
      if (!origins.includes(url.origin) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) return;
      frame.src = url.href; frame.hidden = false; status.hidden = true;
    } catch {}
  }
  if (message.method === 'ui/resource-teardown') {
    frame.src = 'about:blank';
    if (message.id !== undefined) send({id:message.id,result:{}});
  }
});
send({id:'init',method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'previewer',version:'0.1.0'},appCapabilities:{}}});
</script></body></html>` };
}
