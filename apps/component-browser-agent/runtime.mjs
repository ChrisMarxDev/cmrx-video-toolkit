import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, extname } from 'node:path';

const toolkitRoot = fileURLToPath(new URL('../../', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const within = (root, path) => { const p = relative(root, path); return !p.startsWith('..') && !isAbsolute(p); };

export class ComponentRuntime {
  constructor({ root = toolkitRoot, run } = {}) {
    this.root = resolve(root);
    this.browser = resolve(this.root, 'tools/component_browser');
    this.web = resolve(this.browser, 'build/web');
    this.run = run ?? this.runCommand.bind(this);
    this.controller = new AbortController();
  }
  async catalog() {
    return JSON.parse(await readFile(resolve(this.root, 'components/components.json'), 'utf8'));
  }
  async list({ query = '', category, offset = 0, limit = 30 } = {}) {
    const catalog = await this.catalog();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const entries = catalog.components.filter(c => (!category || c.category === category) &&
      words.every(w => [c.id, c.name, c.widget, c.description, c.category].join(' ').toLowerCase().includes(w)));
    return { identity: catalog.identity, categories: [...new Set(catalog.components.map(c => c.category))],
      total: entries.length, nextOffset: offset + limit < entries.length ? offset + limit : null,
      components: entries.slice(offset, offset + limit).map(({ id, name, widget, category, description, variants }) =>
        ({ id, name, widget, category, description, variants: variants.map(v => v.id) })) };
  }
  async get({ id, variant } = {}) {
    const catalog = await this.catalog();
    const component = catalog.components.find(c => c.id === id);
    if (!component) throw Error(`Unknown component: ${id}. Use list_components.`);
    const preset = component.variants.find(v => v.id === (variant ?? component.variants[0]?.id));
    if (!preset) throw Error(`Unknown variant for ${id}: ${variant}`);
    const props = Object.fromEntries(Object.entries(component.parameters ?? {}).map(([key, value]) => [key, value.default]));
    return { identity: catalog.identity, importPath: catalog.importPath, component,
      selection: { component: id, variant: preset.id, props: { ...props, ...preset.props } },
      note: 'Catalog defaults describe the preview. Supply caller-owned styling and resolve production timing separately. Copy code in the browser for a constructor example.' };
  }
  runCommand(command, args, cwd) {
    return new Promise((resolveRun, reject) => {
      let tail = '';
      const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], signal: this.controller.signal });
      const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60 * 1000);
      const collect = data => { tail = (tail + data.toString()).slice(-6000); };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', error => { clearTimeout(timer); reject(Error(`Cannot run ${command}: ${error.message}. See apps/component-browser-agent/README.md.`)); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolveRun();
        else reject(Error(`${command} failed (${code}): ${tail}`));
      });
    });
  }
  async ensureBuild(rebuild) {
    if (this.closed) throw Error('Component browser is closed.');
    if (this.building) return this.building;
    this.building = (async () => {
      if (!rebuild) {
        try { await stat(resolve(this.web, 'index.html')); return; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      await this.run(process.env.PYTHON || 'python3', ['scripts/demo_media.py'], this.browser);
      await this.run(process.env.FLUTTER || 'flutter', ['pub', 'get'], this.browser);
      await this.run(process.env.FLUTTER || 'flutter', ['build', 'web', '--no-web-resources-cdn'], this.browser);
      await stat(resolve(this.web, 'index.html'));
    })().finally(() => { this.building = undefined; });
    return this.building;
  }
  async origin() {
    if (this.closed) throw Error('Component browser is closed.');
    if (!this.starting) this.starting = (async () => {
      this.http = createServer((req, res) => { void this.serve(req, res); });
      await new Promise((done, fail) => {
        this.http.once('error', fail);
        this.http.listen(0, '127.0.0.1', () => { this.http.removeListener('error', fail); done(); });
      });
      return `http://127.0.0.1:${this.http.address().port}`;
    })().catch(error => { this.starting = undefined; throw error; });
    return this.starting;
  }
  async serve(req, res) {
    try {
      const host = `127.0.0.1:${this.http.address().port}`;
      if (req.headers.host !== host) { res.writeHead(403).end(); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
      if (pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(400).end(); return; }
      const root = await realpath(this.web);
      const file = await realpath(resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`));
      if (!within(root, file)) { res.writeHead(403).end(); return; }
      const info = await stat(file);
      if (!info.isFile()) { res.writeHead(404).end(); return; }
      let start = 0, end = info.size - 1, status = 200;
      const headers = { 'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
        if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length'] = info.size ? end - start + 1 : 0;
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || !info.size) { res.end(); return; }
      await pipeline(createReadStream(file, { start, end }), res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 400).end();
      else res.destroy();
    }
  }
  async open({ id, variant, rebuild = false } = {}) {
    if (variant && !id) throw Error('A variant requires a component id.');
    const detail = id ? await this.get({ id, variant }) : undefined;
    await this.ensureBuild(rebuild);
    const origin = await this.origin();
    const route = detail ? `/${encodeURIComponent(id)}?variant=${encodeURIComponent(detail.selection.variant)}` : '/';
    return { browserUrl: `${origin}/#${route}`, selection: detail?.selection ?? null,
      note: 'Shows the actual Flutter workbench in compatible MCP Apps hosts. Use browserUrl if local frames are blocked. UI changes are not sent back automatically; copy the flow reference for the agent.' };
  }
  async close() {
    this.closed = true;
    this.controller.abort();
    await this.building?.catch(() => {});
    await this.starting?.catch(() => {});
    if (this.http?.listening) {
      await new Promise(done => { this.http.close(done); this.http.closeAllConnections(); });
    }
  }
}
