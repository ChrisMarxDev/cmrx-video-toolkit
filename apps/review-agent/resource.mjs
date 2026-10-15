import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const uiUri = 'ui://video-review/editor-v1.html';

export async function editorResource(origins, decorate = value => value) {
  const root = new URL('../editor/web/', import.meta.url);
  const [html, css, js] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('style.css', root), 'utf8'),
    build({ entryPoints: [fileURLToPath(new URL('app.js', root))], bundle: true, write: false,
      format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' }),
  ]);
  // No nested iframe: exactly the browser editor's DOM/CSS and bundled modules.
  const text = await decorate(html.replace(/<link\s+rel="stylesheet"\s+href="\/style.css"\s*\/>/,
    () => `<style>${css}</style>`).replace(/<script type="module" src="\/app.js"><\/script>/,
    () => `<script>globalThis.__VIDEO_REVIEW_MCP__=true;</script><script type="module">${js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`));
  return { uri: uiUri, mimeType: 'text/html;profile=mcp-app', text,
    _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [...new Set(origins)], connectDomains: [] } },
      'openai/widgetDescription': 'Review the video and transcript, annotate source-time ranges, then click Done to save locally and continue.' } };
}
