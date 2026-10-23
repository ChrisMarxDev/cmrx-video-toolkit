import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PreviewRuntime, previewUrl } from './runtime.mjs';
import { previewResource } from './resource.mjs';

async function fixture(t, body, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'previewer-test-'));
  await writeFile(join(root, 'pubspec.yaml'), 'name: synthetic');
  await writeFile(join(root, 'video.dart'), '// synthetic');
  const script = join(root, 'fake.mjs');
  await writeFile(script, body);
  const runtime = new PreviewRuntime({ root, command: process.execPath, prefixArgs: [script], ...options });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  return { root, runtime, open: () => runtime.open({ path: 'video.dart', project: '.' }) };
}
async function until(runtime, id, state) {
  for (let i = 0; i < 150; i++) {
    const result = runtime.get(id);
    if (result.status === state) return result;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(JSON.stringify(runtime.get(id)));
}

test('starts web preview, reuses session, tracks reloads, stops process without changing source', async t => {
  const { runtime, open } = await fixture(t, `
    import assert from 'node:assert/strict';
    assert.ok(process.argv.includes('--no-download'));
    assert.ok(process.argv.includes('web-server'));
    assert.ok(!process.argv.includes('render'));
    console.log(JSON.stringify({schemaVersion:1,event:'ready',device:'web-server',url:'http://127.0.0.1:9876/'}));
    console.log(JSON.stringify({schemaVersion:1,event:'reloaded'}));
    setInterval(()=>{},1000);
  `);
  const initial = await open();
  assert.equal(initial.status, 'starting');
  const ready = await until(runtime, initial.sessionId, 'ready');
  assert.equal(ready.reloads, 1);
  assert.equal((await open()).sessionId, initial.sessionId);
  assert.deepEqual(runtime.origins(), ['http://127.0.0.1:9876']);
  assert.equal((await runtime.stop(initial.sessionId)).status, 'closed');
  assert.deepEqual(runtime.origins(), []);
});

test('old CLI and missing executable fail with actionable diagnostics', async t => {
  const { runtime, open } = await fixture(t, "console.error('Unknown option --json'); process.exit(64)");
  const first = await open();
  assert.match((await until(runtime, first.sessionId, 'failed')).error, /Unknown option --json/);
  const missing = await fixture(t, '', { command: '/nonexistent/fluvie' });
  const second = await missing.open();
  assert.match((await until(missing.runtime, second.sessionId, 'failed')).error, /ENOENT/);
});

test('startup timeout terminates hung child', async t => {
  const { runtime, open } = await fixture(t, 'setInterval(()=>{},1000)', { timeoutMs: 50 });
  const state = await open();
  assert.match((await until(runtime, state.sessionId, 'failed')).error, /timed out/);
});

test('rejects out-of-root and symlink inputs before execution', async t => {
  const { root, runtime } = await fixture(t, '');
  await symlink(tmpdir(), join(root, 'outside'));
  await assert.rejects(runtime.open({ path: 'video.dart', project: 'outside' }), /configured root/);
  await assert.rejects(runtime.open({ path: 'video.dart', project: '.', entry: 'build();' }), /entry/);
});

test('rejects nonlocal ready URLs and confines resource CSP', async t => {
  for (const url of ['https://example.com/', 'http://127.0.0.1:123/a', 'http://u:p@localhost:12/', 'file:///tmp/a']) {
    assert.throws(() => previewUrl(url));
  }
  const { runtime, open } = await fixture(t, `console.log(JSON.stringify({schemaVersion:1,event:'ready',device:'web-server',url:'https://example.com/'})); setInterval(()=>{},1000)`);
  const first = await open();
  await until(runtime, first.sessionId, 'failed');
  const resource = previewResource(['http://localhost:1234']);
  assert.deepEqual(resource._meta.ui.csp.frameDomains, ['http://localhost:1234']);
  assert.ok(!resource.text.includes('tools/call'));
  assert.ok(!resource.text.includes('ui/open-link'));
});

test('serializes concurrent opens and prevents upstream cache collisions', async t => {
  const { root, runtime, open } = await fixture(t, 'setInterval(()=>{},1000)');
  const [a, b] = await Promise.all([open(), open()]);
  assert.equal(a.sessionId, b.sessionId);
  await writeFile(join(root, 'other.dart'), '// other synthetic composition');
  await assert.rejects(runtime.open({ path: 'other.dart', project: '.' }), /existing preview/);
  await runtime.close();
  await assert.rejects(open(), /closed/);
});

test('startup failure retains diagnostics when process cleanup is denied', async t => {
  const { runtime, open } = await fixture(t, "process.exit(1)");
  const stop = runtime.stopProcess;
  runtime.stopProcess = async () => { throw Error('cleanup denied'); };
  try {
    const initial = await open();
    const failed = await until(runtime, initial.sessionId, 'failed');
    assert.match(failed.error, /Preview cleanup failed: cleanup denied/);
  } finally { runtime.stopProcess = stop; }
});
