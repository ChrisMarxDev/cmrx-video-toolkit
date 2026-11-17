import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
test('monitoring initializes after selecting the existing application profile', () => {
  for (const software of [false, true]) {
  let name = 'Electron', observed, hardwareDisabled = false;
  const app = { setName(value) { name = value; }, disableHardwareAcceleration() { hardwareDisabled = true; } };
  const source = fs.readFileSync(new URL('../src/desktop.cjs', import.meta.url), 'utf8');
  vm.runInNewContext(source.slice(0, source.indexOf('if (!app.requestSingleInstanceLock())')), {
    __dirname: '/test/app', process: { env: software ? { CMRX_SOFTWARE_PREVIEW: '1' } : {} },
    require(id) {
      if (id === 'electron') return { app };
      if (id === './monitoring.cjs') { observed = { name, hardwareDisabled }; return {}; }
      return createRequire(import.meta.url)(id);
    },
  });
  assert.deepEqual(observed, { name: 'CMRX Chat Editor', hardwareDisabled: software });
  }
});
const { cleanEvent } = createRequire(import.meta.url)('../src/monitoring-policy.cjs');
test('monitoring allowlist removes project data, secrets, request tokens and host paths', () => {
  const event = cleanEvent({ event_id: 'id', user: { email: 'private@example.test' },
    request: { url: 'http://localhost/?token=secret' }, extra: { chat: 'private conversation' },
    breadcrumbs: [{ message: 'private conversation' }], contexts: { device: { name: 'personal-host' } },
    tags: { component: 'renderer', project: 'private-project' },
    exception: { values: [{ type: 'Error', value: 'Failed on /home/private/secret.mp4',
      stacktrace: { frames: [{ filename: '/home/private/code/apps/desktop/src/chat.js?token=secret', lineno: 4, vars: { token: 'secret' }, abs_path: '/home/private' }] } }] } });
  const serialized = JSON.stringify(event);
  for (const secret of ['private', 'secret', 'conversation', 'personal-host', '/home/']) assert.ok(!serialized.includes(secret), secret);
  assert.equal(event.exception.values[0].stacktrace.frames[0].filename, 'app:///apps/desktop/src/chat.js');
  assert.equal(event.tags.component, 'renderer');
  assert.equal(cleanEvent({exception:{values:[{type:'Error', value:'CMRX Sentry verification main 123'}]}}).exception.values[0].value, 'CMRX Sentry verification main 123');
});
