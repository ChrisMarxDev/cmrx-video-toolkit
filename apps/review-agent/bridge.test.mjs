import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReviewBridge } from './bridge.mjs';

test('Done flushes once, uses the resulting revision, then notifies', async () => {
  const events = [];
  let revision = 0;
  const bridge = createReviewBridge({
    flush: async () => { events.push('flush'); revision++; },
    getIdentity: () => ({ revision }),
    request: async (operation, data) => { events.push(operation); assert.equal(data.revision, 1); return { status: 'completed' }; },
    notify: async () => { events.push('notify'); },
  });
  const first = bridge.done();
  assert.equal(bridge.done(), first);
  assert.equal((await first).status, 'completed');
  assert.deepEqual(events, ['flush', 'finish', 'notify']);
});

test('save failure prevents finish; notification failure preserves completion', async () => {
  const failed = createReviewBridge({ flush: async () => { throw Error('Conflict'); },
    request: () => assert.fail('Must not finish'), getIdentity: () => ({}) });
  await assert.rejects(failed.done(), /Conflict/);
  const saved = createReviewBridge({ flush: async () => {}, getIdentity: () => ({}),
    request: async () => ({ status: 'completed', artifactPath: '/review.json' }),
    notify: async () => { throw Error('Host unavailable'); } });
  const result = await saved.done();
  assert.equal(result.status, 'completed');
  assert.equal(result.continuation, 'unavailable');
  assert.equal(result.artifactPath, '/review.json');
});
