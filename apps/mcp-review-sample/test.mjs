import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startSample } from './server.mjs';

test('MCP resource, seekable media, validated save, and restart persistence', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'review-mcp-'));
  const directory = join(temporary, '.local');
  let instance, client;
  try {
    instance = await startSample({ port: 0, directory, key: 'test-capability' });
    assert.equal((await fetch(instance.mcpUrl, { headers: { Accept: 'text/event-stream' } })).status, 405);
    client = new Client({ name: 'review-protocol-test', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(instance.mcpUrl)));
    const { tools } = await client.listTools();
    const open = tools.find(t => t.name === 'open_review_sample');
    assert.equal(open._meta.ui.resourceUri, 'ui://video-review-sample/v1.html');
    const { contents } = await client.readResource({ uri: open._meta.ui.resourceUri });
    assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.match(contents[0].text, /ui\/initialize/);
    assert.deepEqual(contents[0]._meta.ui.csp.resourceDomains, [instance.localUrl]);
    const opened = await client.callTool({ name: 'open_review_sample', arguments: {} });
    const doc = opened.structuredContent;
    assert.equal(doc.status, 'draft');
    assert.equal((await fetch(`${instance.localUrl}/sample.mp4`)).status, 404);
    const range = await fetch(doc.videoUrl, { headers: { Range: 'bytes=0-31' } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 32);
    const args = { sessionId: doc.sessionId, text: 'Add a title', start: 1, end: 3,
      playback: { played: false, seeked: false, currentTime: 0, error: 'Protocol test; no browser playback claimed' } };
    const invalid = await client.callTool({ name: 'finish_review_sample', arguments: { ...args, end: 0 } });
    assert.equal(invalid.isError, true);
    assert.equal(JSON.parse(await readFile(doc.artifactPath)).status, 'draft');
    const traversal = await client.callTool({ name: 'get_review_sample', arguments: { sessionId: '../private' } });
    assert.equal(traversal.isError, true);
    const saved = await client.callTool({ name: 'finish_review_sample', arguments: args });
    assert.equal(saved.structuredContent.status, 'completed');
    assert.equal(JSON.parse(await readFile(doc.artifactPath)).annotation.text, 'Add a title');
    await client.close(); await instance.close();
    instance = await startSample({ port: 0, directory });
    client = new Client({ name: 'review-protocol-test', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(instance.mcpUrl)));
    const recovered = await client.callTool({ name: 'get_review_sample', arguments: { sessionId: doc.sessionId } });
    assert.equal(recovered.structuredContent.status, 'completed');
    assert.equal(recovered.structuredContent.annotation.source_start, 1);
  } finally {
    await client?.close(); await instance?.close(); await rm(temporary, { recursive: true, force: true });
  }
});
