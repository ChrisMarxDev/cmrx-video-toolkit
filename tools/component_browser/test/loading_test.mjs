import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../web/loading.js', import.meta.url), 'utf8');
function setup() {
  const elements = Object.fromEntries(['loading', 'loading-status', 'loading-hint', 'loading-retry'].map(id => [id, { textContent: '', hidden: true, classList: { add() {} }, remove() { this.removed = true; }, addEventListener(name, fn) { this[name] = fn; } }]));
  const listeners = {};
  let timer, cleared = false, reloaded = false;
  const window = { addEventListener: (name, fn) => listeners[name] = fn, location: { reload: () => reloaded = true } };
  vm.runInNewContext(source, { window, document: { getElementById: id => elements[id] }, setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => cleared = true });
  return { elements, window, listeners, timeout: () => timer(), cleared: () => cleared, reloaded: () => reloaded };
}
test('slow loading stays recoverable and first frame removes overlay', () => {
  const s = setup();
  s.window.componentLoading.stage('Opening catalog');
  assert.equal(s.elements['loading-status'].textContent, 'Opening catalog');
  s.timeout();
  assert.equal(s.elements['loading-retry'].hidden, false);
  s.listeners['flutter-first-frame']();
  assert.equal(s.elements.loading.removed, true);
  assert.equal(s.cleared(), true);
  s.window.componentLoading.fail();
  assert.equal(s.elements['loading-status'].textContent, 'Opening catalog');
});
test('failure offers retry and later progress cannot overwrite it', () => {
  const s = setup();
  s.window.componentLoading.fail();
  s.window.componentLoading.stage('Opening catalog');
  s.timeout();
  assert.equal(s.elements['loading-status'].textContent, 'The browser couldn’t load.');
  assert.equal(s.elements['loading-retry'].hidden, false);
  assert.equal(s.cleared(), true);
  s.elements['loading-retry'].click();
  assert.equal(s.reloaded(), true);
});
