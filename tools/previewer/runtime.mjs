import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

export function previewUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('Fluvie must return a loopback HTTP preview URL.');
  }
  return url.href;
}

// No rendering, copying compositions, or browser launch. Fluvie owns the Flutter
// app, source watching, asset bridge, bounded frame decoding and audio playback.
export class PreviewRuntime {
  constructor({ root = process.cwd(), command = process.env.FLUVIE_PREVIEW_BIN || 'fluvie',
    prefixArgs = [], timeoutMs = 300000, maxSessions = 3 } = {}) {
    Object.assign(this, { root: resolve(root), command, prefixArgs, timeoutMs, maxSessions });
    this.sessions = new Map();
    this.closed = false;
  }

  async scoped(path) {
    const root = await realpath(this.root);
    const actual = await realpath(resolve(root, path));
    const rel = relative(root, actual);
    if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
      throw Error('Preview inputs must be inside the configured root.');
    }
    return actual;
  }

  open(args) {
    const next = (this.opening ?? Promise.resolve()).catch(() => {}).then(() => this.openOne(args));
    this.opening = next;
    return next;
  }

  async openOne({ path, project, entry = 'build' }) {
    if (this.closed) throw Error('Previewer is closed.');
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry)) throw Error('Invalid Dart entry function.');
    const source = await this.scoped(path);
    const projectDir = await this.scoped(project);
    if (extname(source) !== '.dart' || !(await stat(source)).isFile()) throw Error('Select a Dart composition file.');
    await this.scoped(join(projectDir, 'pubspec.yaml'));
    const rel = relative(projectDir, source);
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw Error('Composition must belong to the selected Flutter project.');
    for (const session of this.sessions.values()) {
      if (session.path === source && session.project === projectDir && session.entry === entry &&
          ['starting', 'ready'].includes(session.status)) return this.get(session.id);
      if (session.project === projectDir && ['starting', 'ready'].includes(session.status)) {
        throw Error('Close this project’s existing preview before selecting another composition or entry.');
      }
    }
    if ([...this.sessions.values()].filter(s => ['starting', 'ready'].includes(s.status)).length >= this.maxSessions) {
      throw Error('Close an existing preview before opening another.');
    }
    if (this.closed) throw Error('Previewer is closed.');
    const id = randomUUID();
    const session = { id, path: source, project: projectDir, entry, status: 'starting', browserUrl: null, error: null, reloads: 0 };
    this.sessions.set(id, session);
    const child = spawn(this.command, [...this.prefixArgs, 'preview', source, '--project', projectDir,
      '--entry', entry, '--device', 'web-server', '--json', '--toolchain', 'system', '--no-download'],
    { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', shell: false });
    session.child = child;
    session.exited = new Promise(resolve => child.once('close', resolve));
    let diagnostics = '';
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-6000); });
    const fail = message => {
      if (['closed', 'failed'].includes(session.status)) return;
      session.status = 'failed'; session.browserUrl = null;
      session.error = `${message} Requires Fluvie's JSON web preview API; see tools/previewer/README.md.\n${diagnostics}`.trim();
      clearTimeout(session.timer);
      void this.stopProcess(session).catch(error => {
        session.error += `\nPreview cleanup failed: ${error.message}`;
      });
    };
    child.once('error', error => fail(error.message));
    child.once('close', code => {
      clearTimeout(session.timer);
      if (!['closed', 'failed'].includes(session.status)) fail(`Fluvie preview exited (${code}).`);
    });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (!['starting', 'ready'].includes(session.status)) return;
      let event;
      try { event = JSON.parse(line); } catch { diagnostics = (diagnostics + '\n' + line).slice(-6000); return; }
      if (event.schemaVersion !== 1) return;
      if (event.event === 'ready') {
        try {
          if (event.device !== 'web-server') throw Error('Expected web-server preview.');
          session.browserUrl = previewUrl(event.url);
          session.status = 'ready'; clearTimeout(session.timer);
        } catch (error) { fail(error.message); }
      } else if (event.event === 'reloaded') session.reloads++;
    });
    session.timer = setTimeout(() => fail('Preview startup timed out.'), this.timeoutMs);
    session.timer.unref();
    return this.get(id);
  }

  get(id) {
    const s = this.sessions.get(id);
    if (!s) throw Error('Unknown preview session.');
    return { sessionId: s.id, status: s.status, path: s.path, project: s.project,
      browserUrl: s.browserUrl, error: s.error, reloads: s.reloads };
  }

  async stopProcess(s) {
    if (s.stopping) return s.stopping;
    s.stopping = (async () => {
      const child = s.child;
      if (!child?.pid) return;
      const signal = value => {
        try {
          if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          else process.kill(-child.pid, value);
        } catch (error) { if (error.code !== 'ESRCH') throw error; }
      };
      signal('SIGTERM');
      const timer = setTimeout(() => signal('SIGKILL'), 2000);
      await s.exited;
      clearTimeout(timer);
      // The launcher can exit before its Flutter descendants do.
      if (process.platform !== 'win32') signal('SIGKILL');
    })();
    return s.stopping;
  }

  async stop(id) {
    const s = this.sessions.get(id);
    if (!s) throw Error('Unknown preview session.');
    s.status = 'closed'; s.browserUrl = null; clearTimeout(s.timer);
    await this.stopProcess(s);
    return this.get(id);
  }

  origins() {
    return [...new Set([...this.sessions.values()].filter(s => s.status === 'ready').map(s => new URL(s.browserUrl).origin))];
  }

  async close() {
    this.closed = true;
    await this.opening?.catch(() => {});
    await Promise.all([...this.sessions.keys()].map(id => this.stop(id)));
  }
}
