#!/usr/bin/env node
import { readFile, open } from 'node:fs/promises';
import { createVideoFal, saveAssets } from './index.mjs';

const usage = `video-fal (Node 22+, server/local only)
  submit ENDPOINT INPUT.json JOB.json   Submit once; save a resumable receipt
  status JOB.json                       Check without waiting
  result JOB.json                       Print raw model output
  fetch JOB.json NEW_DIRECTORY          Download completed media + manifest
  cancel JOB.json                       Ask fal to cancel the request
Set FAL_KEY via environment or node --env-file=/private/path/.env.
Generation may incur provider charges. Fetch/status never submit a new job.`;
const [command, ...args] = process.argv.slice(2);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
try {
  if (!command || command === '--help') console.log(usage);
  else {
    const counts = { submit: 3, status: 1, result: 1, fetch: 2, cancel: 1 };
    if (args.length !== counts[command]) throw new Error(usage);
    const client = createVideoFal();
    let output;
    if (command === 'submit') {
      const input = await json(args[1]);
      // Reserve the destination before spending money. Existing receipts are never overwritten.
      const file = await open(args[2], 'wx', 0o600);
      try {
        output = await client.submit(args[0], input);
        await file.writeFile(JSON.stringify(output, null, 2) + '\n');
      } finally { await file.close(); }
    } else {
      const receipt = await json(args[0]);
      output = command === 'fetch'
        ? await saveAssets(receipt, await client.result(receipt), args[1])
        : await client[command](receipt);
    }
    console.log(JSON.stringify(output ?? { cancellationRequested: true }, null, 2));
  }
} catch (error) {
  // Provider bodies can echo input or signed URLs. Keep CLI failures terse.
  const message = error.status ? `fal request failed (HTTP ${error.status}).` : error.message;
  console.error(process.env.FAL_KEY ? message.replaceAll(process.env.FAL_KEY, '[redacted]') : message);
  process.exitCode = 1;
}
