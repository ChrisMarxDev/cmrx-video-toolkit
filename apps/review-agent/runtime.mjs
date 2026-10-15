import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { realpath, readFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { browserRequest } from './bridge.mjs';

const launcher = fileURLToPath(new URL('../editor/agent_session.py', import.meta.url));

export class ReviewRuntime {
  constructor({ root, python = process.env.PYTHON || 'python3', model = process.env.WHISPER_MODEL } = {}) {
    this.root = resolve(root || process.cwd());
    this.python = python;
    this.model = model;
    this.sessions = new Map();
    this.workspaces = new Set();
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
    const source = await this.scoped(path);
    const target = await this.scoped(workspace || (source.endsWith('review.json') ? dirname(source) : `${source}.review`), { missing: true });
    // Opening an existing review must not bypass the configured source boundary.
    if (source.endsWith('.json')) {
      if (!source.endsWith('/review.json') && !source.endsWith('\\review.json')) throw Error('Only review.json is supported.');
      const document = JSON.parse(await readFile(source, 'utf8'));
      await this.scoped(resolve(dirname(source), document.source.path));
      if (target !== dirname(source)) throw Error('An existing review uses its own workspace.');
    }
    const imported = transcript ? await this.scoped(transcript) : undefined;
    if (this.workspaces.has(target)) throw Error('This workspace already has an active review session.');
    this.workspaces.add(target);
    const args = [launcher, source, '--workspace', target, '--home', resolve(target, '.agent')];
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
      return { ...await request('session'), browserUrl: started.browserUrl, presentation: 'browser',
        message: 'Open browserUrl to review. The embedded redesigned UI is not wired yet. Never mark Done on the user’s behalf.' };
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
    if (!['state', 'session', 'save', 'finish', 'abandon'].includes(operation)) throw Error('Unsupported review operation.');
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
    await Promise.all([...this.sessions.values()].map(({ child }) => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(() => child.kill('SIGKILL'), 7000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGINT');
    })));
    this.sessions.clear();
    this.workspaces.clear();
  }
}
