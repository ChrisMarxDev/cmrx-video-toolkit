import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('stdio entrypoint starts a real engine and reports preparation failure without approval', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-stdio-'));
  const client = new Client({ name: 'stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('./mcp.mjs', import.meta.url)), '--root', root], stderr: 'pipe' });
  try {
    await writeFile(join(root, 'broken.mp4'), 'not a video');
    await client.connect(transport);
    const opened = await client.callTool({ name: 'open_review', arguments: { path: 'broken.mp4' } });
    assert.ok(!opened.isError, JSON.stringify(opened));
    let result;
    for (let attempt = 0; attempt < 100; attempt++) {
      result = await client.callTool({ name: 'get_review', arguments: { sessionId: opened.structuredContent.sessionId } });
      if (result.structuredContent?.status === 'failed') break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(result.structuredContent.status, 'failed');
    assert.equal(result.structuredContent.artifactPath, null);
    assert.ok(result.structuredContent.error);
    const cancelled = await client.callTool({ name: 'cancel_review', arguments: { sessionId: opened.structuredContent.sessionId } });
    assert.equal(cancelled.structuredContent.status, 'cancelled');
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});
