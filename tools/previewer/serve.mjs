import { PreviewRuntime } from './runtime.mjs';

const [root, project, path] = process.argv.slice(2);
if (!root || !project || !path || process.argv.length !== 5) {
  throw Error('Usage: node tools/previewer/serve.mjs ROOT PROJECT COMPOSITION.dart');
}
const runtime = new PreviewRuntime({ root });
const close = async () => { clearInterval(timer); await runtime.close(); };
const session = await runtime.open({ project, path });
let previous;
const timer = setInterval(() => {
  const state = runtime.get(session.sessionId);
  const json = JSON.stringify(state);
  if (json !== previous) { process.stdout.write(`${json}\n`); previous = json; }
  if (state.status === 'failed') { process.exitCode = 1; void close(); }
}, 250);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, close);
