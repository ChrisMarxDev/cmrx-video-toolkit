// Development-only public connection for ChatGPT. Serves synthetic media only.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSample } from './server.mjs';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '.local');
await mkdir(directory, { recursive: true });
const port = Number(process.env.PORT || 4877);
const key = randomBytes(24).toString('hex');
const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
let instance, stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  tunnel.kill();
  await instance?.close();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await stop(); process.exit(0); });
try {
  const publicUrl = await new Promise((yes, no) => {
    let output = '';
    const timeout = setTimeout(() => no(Error('Tunnel startup timed out.')), 30000);
    const fail = error => { clearTimeout(timeout); no(error); };
    tunnel.once('error', fail);
    tunnel.once('exit', code => fail(Error(`Tunnel exited (${code}).`)));
    const chunk = data => {
      output = (output + data.toString()).slice(-20000);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) { clearTimeout(timeout); yes(match[0]); }
    };
    tunnel.stdout.on('data', chunk); tunnel.stderr.on('data', chunk);
  });
  instance = await startSample({ port, directory, publicUrl, key });
  const connection = { publicMcpUrl: instance.mcpUrl, localMcpUrl: `${instance.localUrl}/${key}/mcp`,
    artifacts: directory, pid: process.pid, tunnelPid: tunnel.pid };
  await writeFile(resolve(directory, 'connection.json'), JSON.stringify(connection, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(connection, null, 2));
  console.log('ChatGPT: add publicMcpUrl as a development MCP app, authentication None.');
  console.log(`Codex: codex mcp add video-review-sample --url ${connection.localMcpUrl}`);
  console.log('Keep this process running. Ctrl+C stops both the sample and tunnel.');
  tunnel.once('exit', async () => { if (!stopping) { await stop(); process.exit(1); } });
} catch (error) {
  console.error(error.message, '\nInstall cloudflared or use npm start for local-only MCP.');
  await stop(); process.exit(1);
}
