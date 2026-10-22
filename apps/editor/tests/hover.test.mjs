import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the browser controller with event targets and a deterministic frame
// scheduler: no browser or media decoder is needed for its seek/restore contract.
test('hover restores playback, click commits, and touch/drag never hover-seek', async () => {
  const source = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
  const handlers = new Map();
  const target = name => ({ hidden: true, style: {}, classList: { add() {}, remove() {} },
    addEventListener(type, fn) { handlers.set(`${name}:${type}`, fn); },
    contains(el) { return el === this; },
    getBoundingClientRect() { return { left: 100, width: 400 }; } });
  const surface = target('surface'), document = target('document'), window = target('window');
  document.querySelector = () => surface;
  const nodes = { timeline: target('timeline'), 'timeline-origin': target('origin') };
  let frame;
  const video = { currentTime: 2, paused: false, pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); } };
  const context = vm.createContext({ document, window, video, $: id => nodes[id],
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = null; },
    clamp: (n, a, b) => Math.min(b, Math.max(a, n)), error: msg => { throw Error(msg); },
    previewTime: time => { video.currentTime = time; } });
  vm.runInContext('let hoverPreview = null, hoverFrame = null, busy = false, dragging = false; const doc = { source: { duration: 10 } };' +
    source.slice(source.indexOf('const timelineSurface ='), source.indexOf('function renderRuler()')), context);
  const move = extra => { handlers.get('surface:pointermove')({ clientX: 300, buttons: 0, pointerType: 'mouse', ...extra }); if (frame) { const run = frame; frame = null; run(); } };
  move();
  assert.equal(video.currentTime, 5);
  assert.equal(video.paused, true);
  assert.equal(nodes['timeline-origin'].hidden, false);
  handlers.get('surface:pointerleave')();
  assert.equal(video.currentTime, 2);
  assert.equal(video.paused, false);
  video.pause();
  move();
  handlers.get('surface:pointerdown')({ clientX: 340, button: 0 });
  handlers.get('surface:pointerleave')();
  assert.equal(video.currentTime, 6);
  assert.equal(video.paused, true);
  move({ pointerType: 'touch' });
  assert.equal(video.currentTime, 6);
  vm.runInContext('dragging = true', context);
  move();
  assert.equal(video.currentTime, 6);
  vm.runInContext('dragging = false', context);
  move();
  handlers.get('window:blur')();
  assert.equal(video.currentTime, 6);
  // Leaving before a queued frame runs must cancel it.
  handlers.get('surface:pointermove')({ clientX: 400, buttons: 0, pointerType: 'mouse' });
  handlers.get('surface:pointerleave')();
  assert.equal(frame, null);
  assert.equal(video.currentTime, 6);
});
