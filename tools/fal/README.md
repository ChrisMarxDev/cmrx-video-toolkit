# fal generation connector

A small, optional Node package and CLI for turning fal model output into local
video assets. Submit a model-specific JSON input, keep the job receipt, then
fetch completed images, video or audio into your production workspace. The
connector wraps the official `@fal-ai/client`; it does not prescribe a model,
visual style or generation settings. Node 22+ is required only for this tool.

## Keys and setup

Create a key in the [fal dashboard](https://fal.ai/dashboard/keys) and supply
`FAL_KEY` to the local/server process. Use a private environment file outside the
source checkout or your deployment's secret store. `.env.example` lists the name;
the package does not automatically load environment files. Never put the key in
Flutter `--dart-define`, browser JavaScript, URLs, job inputs or committed files.

```sh
npm --prefix tools/fal ci
node tools/fal/src/cli.mjs --help
```

For the examples below, start in the toolkit root and use an existing production
workspace such as `/absolute/video-workspace`. Prepare `input.json` there using
the selected model's current API schema. For a text-to-image endpoint that accepts
`prompt`, a synthetic input could be `{"prompt":"A blue paper cube on a white desk"}`.
Choose the endpoint deliberately: model input, cost and availability vary.

```sh
# Explicitly submitting a job can incur fal charges.
node --env-file=/private/path/fal.env tools/fal/src/cli.mjs submit \
  fal-ai/flux/dev /absolute/video-workspace/input.json /absolute/video-workspace/job.json

node --env-file=/private/path/fal.env tools/fal/src/cli.mjs status \
  /absolute/video-workspace/job.json

# After COMPLETED: the destination must not exist; its parent must exist.
node --env-file=/private/path/fal.env tools/fal/src/cli.mjs fetch \
  /absolute/video-workspace/job.json /absolute/video-workspace/generated-shot
```

`status` returns fal's queue status without polling. `result JOB.json` prints the
raw model result; `cancel JOB.json` requests cancellation (a running job may still
complete and incur charges). `fetch` and `result` never submit another generation.
There are no automatic submission retries. On transport failure the outcome may
be unknown: check the fal dashboard before retrying. A failed submit leaves the
reserved receipt file in place; inspect it instead of blindly rerunning the command.

## Package API and app integration

Import the package from a server process, desktop backend or agent tool:

```js
import { createVideoFal, saveAssets } from './tools/fal/src/index.mjs';

const client = createVideoFal(); // FAL_KEY from the server environment
const receipt = await client.submit(selectedEndpoint, validatedModelInput);
// Persist receipt immediately in the user's workspace before returning its job ID.
const status = await client.status(receipt);
if (status.status === 'COMPLETED') {
  const data = await client.result(receipt);
  const manifest = await saveAssets(receipt, data, newAssetDirectory);
  // Return your application's asset IDs/paths to its UI.
}
```

A consuming app can expose “Generate asset” beside its media import flow: select
model/input, explicitly submit, show pending status, then preview and import the
result. Keep the key on the backend. Bind saved jobs to the current user, validate
model/input and budget, and map an asset ID to a server-owned output path; do not
accept arbitrary download destinations or credentials from browser requests.
The package is the backend integration seam. It does not add a server route or
credentials form to the editor, and GitHub Pages cannot host the secret-bearing
backend. The public component browser remains a static catalog.

`createVideoFal({apiKey})` supports credentials supplied by a backend secret store;
client instances do not mutate the global fal SDK. `client` and `fetchImpl` injection
support offline tests. The SDK is pinned in package-lock.json. This package is
source-distributed (`private: true`), not published to npm.

## Asset handoff

`fetch` writes `asset-001.png` (or the corresponding media extension) and
`manifest.json`. Manifest schema version 1 contains provider, endpoint, request ID,
original input, submission/download timestamps, raw model output and an `assets`
array. Each asset records its output JSON pointer, source URL, relative path,
MIME type, byte count and SHA-256 checksum. Receipts and manifests may contain
private prompts or signed URLs: keep them with production media outside Git.

The downloader finds nested file objects containing `url` and an image/video/audio
`content_type`, deduplicates by URL and ignores ordinary links. Unrecognized MIME
extensions use `.bin`; outputs without typed files remain available through
`result`. It streams each file with a default 1 GiB limit and 120-second timeout.
API calls have a 60-second network timeout. No key is sent to media hosts.
Only HTTPS `fal.media` and its subdomains are accepted by default, with redirects
rejected. A trusted backend can explicitly configure `allowedHosts`, `maxBytes`
and `timeoutMs` in `saveAssets`; do not derive this allowlist from user input.
Downloads never overwrite an existing directory and remove their own partial
output on failure. Abrupt process termination can leave a partial directory;
inspect/remove it manually or choose a new destination.

Review downloaded media, probe its duration/dimensions using the toolkit's media
tools, and use the local paths in your composition's image/video/audio inputs.
Copy/import assets into the composition's declared asset directory where needed.
Generation happens before rendering: a frame builder must never call fal. The
manifest preserves inputs and chosen output; it does not promise reproducible
cloud inference or determine whether generated content is suitable for publication.

## Validation and references

`npm --prefix tools/fal test` runs offline SDK transport, CLI and download tests.
No live key, billable request or user media is required. Live account/model behavior
must be checked separately when a user intentionally generates content.

- [Official JavaScript client](https://github.com/fal-ai/fal-js)
- [Queue client API](https://fal-ai.github.io/fal-js/reference/interfaces/QueueClient.html)
- [Example model API and server-side key guidance](https://fal.ai/models/fal-ai/playground-v25/api)
