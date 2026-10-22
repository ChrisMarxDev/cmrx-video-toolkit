import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { realpath, readFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { browserRequest } from './bridge.mjs';

const launcher = fileURLToPath(new URL('../editor/agent_session.py', import.meta.url));

export class ReviewRuntime {
  constructor({ root, python = process.env.PYTHON || 'python3', model = process.env.WHISPER_MODEL,
    engine = process.env.REVIEW_ENGINE || launcher } = {}) {
    this.root = resolve(root || process.cwd());
    this.python = python;
    this.model = model;
    this.engine = engine;
    this.sessions = new Map();
    this.workspaces = new Set();
  }

  async mediaOrigin() {
    if (!this.mediaReady) this.mediaReady = new Promise((resolve, reject) => {
      this.mediaServer = createServer((req, res) => {
        const origin = `127.0.0.1:${this.mediaServer.address().port}`;
        if (req.headers.host !== origin) {
          res.writeHead(403).end(); return;
        }
        const [, prefix, id, capability, api, operation] = new URL(req.url, `http://${origin}`).pathname.split('/');
        const session = this.sessions.get(id);
        if (!['media', 'session'].includes(prefix) || !session || capability !== session.started.token) {
          res.writeHead(404).end(); return;
        }
        // Capability-scoped local HTTP transport keeps the editor usable while
        // its agent turn is idle. No host tools/call or ui/open-link is involved.
        if (prefix === 'session') {
          const reads = ['state', 'session', 'videos'];
          const writes = ['select', 'open', 'upload', 'save', 'finish', 'abandon', 'export', 'retry', 'cancel'];
          if (api !== 'api' || ![...reads, ...writes].includes(operation)) {
            res.writeHead(404).end(); return;
          }
          const cors = { 'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Filename, X-Review-Token',
            'Cache-Control': 'no-store' };
          if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
          if (!(reads.includes(operation) ? req.method === 'GET' : req.method === 'POST')) {
            res.writeHead(405, cors).end(); return;
          }
          const headers = { 'X-Review-Token': session.started.token };
          for (const name of ['content-type', 'content-length', 'x-filename']) {
            if (req.headers[name]) headers[name] = req.headers[name];
          }
          const upstream = httpRequest(`${session.started.origin}/api/${operation}`, { method: req.method, headers }, response => {
            res.writeHead(response.statusCode, { ...response.headers, ...cors });
            response.pipe(res);
          });
          upstream.on('error', () => {
            if (!res.headersSent) res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'The local review service stopped. Your saved review remains on disk.' }));
          });
          req.on('aborted', () => upstream.destroy());
          res.on('close', () => upstream.destroy());
          req.pipe(upstream);
          return;
        }
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
        const headers = { 'X-Review-Token': session.started.token };
        if (req.headers.range) headers.Range = req.headers.range;
        const upstream = httpRequest(`${session.started.origin}/media`, { method: 'GET', headers }, response => {
          res.writeHead(response.statusCode, response.headers);
          if (req.method === 'HEAD') { response.destroy(); res.end(); }
          else response.pipe(res);
        });
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        res.on('close', () => upstream.destroy());
        upstream.end();
      });
      this.mediaServer.once('error', reject);
      this.mediaServer.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${this.mediaServer.address().port}`));
    });
    return this.mediaReady;
  }

  async scoped(path, { missing = false } = {}) {
    const root = await realpath(this.root);
    const requested = resolve(root, path);
    let actual;
    try { actual = await realpath(requested); }
    catch (error) {
      if (!missing || error.code !== 'ENOENT') throw error;
      // Resolve every existing ancestor, including symlinks, before allowing a
      // not-yet-created workspace. Source files always have to exist.
      actual = resolve(await this.scoped(dirname(requested), { missing: true }), relative(dirname(requested), requested));
    }
    const child = relative(root, actual);
    if (child === '..' || child.startsWith('../') || child.startsWith('..\\') || isAbsolute(child))
      throw Error('Path is outside the configured review root.');
    return actual;
  }

  async open({ path, workspace, transcript } = {}) {
    if (!path && (workspace || transcript)) throw Error('Choose a video path before supplying workspace or transcript.');
    const source = path ? await this.scoped(path) : undefined;
    const target = await this.scoped(workspace || (source ? (source.endsWith('review.json') ? dirname(source) : `${source}.review`) : `.video-reviews/${randomUUID()}`), { missing: true });
    // Opening an existing review must not bypass the configured source boundary.
    if (source?.endsWith('.json')) {
      if (!source.endsWith('/review.json') && !source.endsWith('\\review.json')) throw Error('Only review.json is supported.');
      const document = JSON.parse(await readFile(source, 'utf8'));
      await this.scoped(resolve(dirname(source), document.source.path));
      if (target !== dirname(source)) throw Error('An existing review uses its own workspace.');
    }
    const imported = transcript ? await this.scoped(transcript) : undefined;
    if (this.workspaces.has(target)) throw Error('This workspace already has an active review session.');
    this.workspaces.add(target);
    const args = source ? [this.engine, source, '--workspace', target] : [this.engine, '--home', target];
    args.push('--library-root', this.root);
    if (this.model) args.push('--model', this.model);
    if (imported) args.push('--transcript', imported);
    const child = spawn(this.python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    // Do not let subprocess output corrupt MCP stdio or print launch tokens.
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    try {
      const started = await new Promise((yes, no) => {
        const timer = setTimeout(() => no(Error('Review engine startup timed out.')), 15000);
        const settle = (fn, value) => { clearTimeout(timer); fn(value); };
        child.once('error', error => settle(no, error));
        child.once('exit', () => settle(no, Error('Review engine stopped before startup.')));
        lines.on('line', line => {
          try { const value = JSON.parse(line); if (value.event === 'started') settle(yes, value); }
          catch { /* Only structured startup output is used. */ }
        });
      });
      const request = browserRequest({ origin: started.origin, token: started.token });
      this.sessions.set(started.sessionId, { child, request, started, target });
      child.once('exit', () => { this.workspaces.delete(target); });
      return { ...await request('session'), browserUrl: started.browserUrl,
        mediaUrl: `${await this.mediaOrigin()}/media/${started.sessionId}/${started.token}`,
        apiUrl: `${await this.mediaOrigin()}/session/${started.sessionId}/${started.token}`,
        message: (source ? 'The supplied video is opening directly. Ask the user to review and click Done.' : 'The review is open. Ask the user to select a video, review and click Done.') + ' Do not automatically open another app or tab. browserUrl is a manual fallback. Never mark Done on the user’s behalf.' };
    } catch (error) {
      child.kill('SIGINT');
      this.workspaces.delete(target);
      throw error;
    }
  }

  session(id) {
    const session = this.sessions.get(id);
    if (!session) throw Error('Unknown review session in this running agent service.');
    if (session.child.exitCode !== null || session.child.signalCode !== null) throw Error('Review engine stopped; saved files remain on disk.');
    return session;
  }

  async request(id, operation, body) {
    if (!['state', 'session', 'save', 'finish', 'abandon', 'export', 'retry', 'cancel'].includes(operation)) throw Error('Unsupported review operation.');
    if (['state', 'session'].includes(operation) && body !== undefined) throw Error('Read operations do not accept a body.');
    if (!['state', 'session'].includes(operation) && (!body || typeof body !== 'object')) throw Error('A request body is required.');
    return this.session(id).request(operation, body);
  }

  async get(id) {
    const session = this.session(id);
    const result = await session.request('session');
    if (result.status !== 'completed') return result;
    const raw = await readFile(result.artifactPath);
    if (createHash('sha256').update(raw).digest('hex') !== result.artifactSha256)
      throw Error('The review changed on disk after Done. Request a new review before consuming it.');
    return { ...result, review: JSON.parse(raw) };
  }

  async close() {
    await Promise.all([...this.sessions.values()].map(({ child, request, started }) => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(() => child.kill('SIGKILL'), 7000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      // HTTP shutdown lets Python cancel subprocess jobs on Windows as well as
      // POSIX, before a hard process termination is necessary.
      request('shutdown', { sessionId: started.sessionId }).catch(() => child.kill('SIGINT'));
    })));
    this.sessions.clear();
    this.workspaces.clear();
    if (this.mediaServer) {
      this.mediaServer.closeAllConnections();
      await new Promise(resolve => this.mediaServer.close(resolve));
      this.mediaServer = undefined;
      this.mediaReady = undefined;
    }
  }
}
