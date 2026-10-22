import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ReviewRuntime } from './runtime.mjs';
import { createServer } from './mcp.mjs';

for (const chooseLater of [false, true, 'library']) test(`real MCP → Python → FFmpeg → approved artifact (choose later: ${chooseLater})`, { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-agent-'));
  const runtime = new ReviewRuntime({ root });
  const server = createServer(runtime);
  const client = new Client({ name: 'review-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const tool = (name, args) => client.callTool({ name, arguments: args });
  try {
    const clip = join(root, 'clip.mp4');
    const made = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=12',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1', '-c:v', 'libx264', '-c:a', 'aac', clip]);
    assert.equal(made.status, 0, String(made.stderr));
    await writeFile(join(root, 'transcript.json'), JSON.stringify({ transcription: [] }));
    if (chooseLater === 'library') {
      const prepared = spawnSync('python3', ['apps/editor/review.py', clip, '--workspace', join(root, 'videos/lesson_1'), '--transcript', join(root, 'transcript.json')], { cwd: new URL('../..', import.meta.url) });
      assert.equal(prepared.status, 0, String(prepared.stderr));
      const artifact = join(root, 'videos/lesson_1/review.json');
      const saved = JSON.parse(await readFile(artifact));
      saved.marks = [{ id: 'existing', kind: 'comment', text: 'Preserve this note', source_start: 0, source_end: .5 }];
      await writeFile(artifact, JSON.stringify(saved));
    }
    await server.connect(a);
    await client.connect(b);
    const listed = await client.listTools();
    const resourceUri = listed.tools.find(tool => tool.name === 'open_review')._meta.ui.resourceUri;
    // Hosts can prefetch/cache the resource before a session starts. Its media
    // origin remains stable across every Python child in this service.
    const resource = (await client.readResource({ uri: resourceUri })).contents[0];
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.match(resource.text, /__VIDEO_REVIEW_MCP__=true/);
    assert.match(resource.text, /review-done/);
    assert.ok(!resource.text.includes('src="/app.js"'));
    await assert.rejects(runtime.scoped('../outside.mp4'), /ENOENT|outside/);
    await symlink(tmpdir(), join(root, 'escape'), 'junction');
    await assert.rejects(runtime.scoped('escape/external.review', { missing: true }), /outside/);
    const opened = await tool('open_review', chooseLater ? {} : { path: clip, transcript: 'transcript.json' });
    assert.ok(!opened.isError, JSON.stringify(opened));
    const { sessionId, browserUrl, mediaUrl, apiUrl } = opened.structuredContent;
    assert.deepEqual(resource._meta.ui.csp.resourceDomains, [new URL(mediaUrl).origin]);
    assert.equal((await fetch(browserUrl)).status, 200);
    assert.deepEqual(resource._meta.ui.csp.connectDomains, [new URL(apiUrl).origin]);
    assert.ok(!resource.text.includes('ui/open-link'));
    const direct = async (operation, body) => {
      const response = await fetch(`${apiUrl}/api/${operation}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'null' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      return value;
    };
    assert.equal((await fetch(`${apiUrl}/api/state`, { method: 'OPTIONS', headers: { Origin: 'null' } })).status, 204);
    assert.equal((await fetch(`${apiUrl}wrong/api/state`)).status, 404);
    assert.equal((await fetch(`${apiUrl}/api/shutdown`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${apiUrl}/api/finish`)).status, 405);
    if (chooseLater === 'library') {
      const { videos } = await direct('videos');
      assert.equal(videos.length, 1);
      assert.equal(videos[0].prepared, true);
      assert.equal(videos[0].path, undefined);
      await direct('select', { id: videos[0].id });
    } else if (chooseLater) {
      assert.equal(opened.structuredContent.status, 'waiting');
      assert.equal(opened.structuredContent.artifactPath, null);
      const session = runtime.session(sessionId);
      await assert.rejects(runtime.request(sessionId, 'finish', { sessionId }), /prepared/);
      assert.equal((await tool('open_review', { transcript: 'transcript.json' })).isError, true);
      const response = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST', headers: { 'X-Review-Token': session.started.token,
          'X-Filename': 'chosen.mp4', 'Content-Type': 'application/octet-stream' },
        body: await readFile(clip),
      });
      assert.equal(response.status, 200);
      const selected = await response.json();
      assert.equal(await runtime.scoped(selected.path), selected.path);
      await direct('open', { ...selected, transcript: join(root, 'transcript.json') });
    } else {
      assert.equal((await tool('open_review', { path: clip })).isError, true);
    }
    let status;
    const deadline = Date.now() + 20000;
    do {
      status = (await tool('get_review', { sessionId })).structuredContent;
      if (status.status !== 'preparing') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    assert.equal(status.status, 'reviewing', JSON.stringify(status));
    const session = runtime.session(sessionId);
    const media = await fetch(mediaUrl, { headers: { Range: 'bytes=0-31' } });
    assert.equal(media.status, 206);
    assert.equal((await media.arrayBuffer()).byteLength, 32);
    assert.equal((await fetch(mediaUrl + 'wrong')).status, 404);
    for (const path of ['/app.js', '/agent.mjs', '/review-agent/bridge.mjs']) {
      assert.equal((await fetch(session.started.origin + path)).status, 200);
    }
    // All editing below bypasses host tools: it must work with no active agent turn.
    const state = await direct('state');
    const doc = state.document;
    if (chooseLater === 'library') assert.equal(doc.marks[0].text, 'Preserve this note');
    const saved = await direct('save', { revision: doc.revision, source_sha256: doc.source.sha256,
      marks: [{ id: 'note', kind: 'comment', text: 'Keep this moment', source_start: 0, source_end: .5 }], objects: [] });
    await assert.rejects(runtime.request(sessionId, 'finish', { sessionId, revision: doc.revision, sourceSha256: doc.source.sha256 }), /changed/);
    await direct('finish', { sessionId, revision: saved.revision, sourceSha256: doc.source.sha256 });
    const completed = (await tool('get_review', { sessionId })).structuredContent;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.review.marks[0].text, 'Keep this moment');
    assert.equal(completed.review.format, 'video-review');
    const { review: approvedReview, ...receipt } = completed;
    assert.deepEqual(JSON.parse(await readFile(completed.receiptPath)), receipt);
    await writeFile(completed.artifactPath, '{}');
    assert.equal((await tool('get_review', { sessionId })).isError, true);
  } finally {
    await client.close();
    await server.close();
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});
