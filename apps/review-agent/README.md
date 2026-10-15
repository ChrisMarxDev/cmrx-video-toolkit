# Review agent integration

Shared agent/session plumbing for the existing browser editor. This is an
integration foundation, not a packaged release or a replacement editor.

The browser app remains the primary UI. MCP Apps will adapt that same UI and
use the same Python engine and canonical `review.json`. No second annotation
format, rendering engine or editor is introduced.

## Available now

- `../editor/agent_session.py`: ordinary loopback browser editor plus explicit
  session status, finish and cancellation endpoints. It accepts a recording or
  existing review.json with the existing preparation/transcription options.
- `mcp.mjs`: local stdio MCP tools to launch a review, read progress/results and
  cancel. Each active workspace owns one Python engine. A configured project
  root scopes tool-selected source, transcript and workspace paths.
- `bridge.mjs`: presentation-independent Done contract and browser/MCP transport
  adapters. Finish follows a successful flush; failed saves never become approval.
- Completion writes `review-completion.json` beside the unchanged-format
  `review.json`, identifying session, source, revision and exact artifact hash.
  Later mutation of the approved artifact is detected by `get_review`.

## Integration status / redesign handoff

**The redesigned UI still needs to import the bridge and connect Done.** Until
then the browser can review/autosave normally, but has no agent Done control.
Do not advertise `--wait` as a complete end-user workflow yet. The MCP server
currently returns a browser URL and does not register an embedded UI resource.
The synthetic `../mcp-review-sample` remains the host feasibility demonstration.

No existing `web/index.html`, `web/app.js`, `web/style.css`, `server.py`, or private
branding adapter was edited for this foundation. The integration seams are:

```js
import { createReviewBridge, browserRequest } from './bridge.mjs';

const integration = createReviewBridge({
  request: browserRequest({ token }),
  flush, // await all pending edits; reject on conflict or failed save
  getIdentity: () => ({
    sessionId,
    revision: doc.revision,
    sourceSha256: doc.source.sha256,
  }),
});
// Read sessionId from GET /api/session at startup.
// Connect the user's Done control to await integration.done().
// Disable editing during Done and once it succeeds; pause playback.
```

The editor integration must serve/bundle this module; the current static editor
handler does not yet serve it. Commit any active popover text into the document
before `flush`, stop accepting new edits during completion, and retain the exact
revision returned by saving. Do not mark complete on close/unload or job cancel.

For embedding, use `embeddedRequest({ sessionId, callServerTool })` with the host
SDK; supply `notify` using the host's send-message API and `continuationMessage`.
If notification fails, the result still says completed and exposes the failure
separately. The UI should tell the user to continue manually. In browser mode the
waiting process or agent polls status; no chat host is needed.

Still to implement after the redesign: shared UI bootstrap/resource bundling,
media URL resolution for the sandbox, host initialization and UI resizing, Done
controls, branded-launcher integration, cross-host acceptance, and packaged
installation/startup. Remote connection/authentication is deliberately not
provided here: do not tunnel this local service to private recordings. Local
stdio needs no tunnel. App-only tool visibility is a host hint, not authorization.

## Development commands

Prerequisites remain Python 3.10+, FFmpeg and (for new transcription) whisper.cpp
and a model; the MCP adapter additionally needs Node 22+. An existing transcript
or prepared review avoids rerunning recognition. This does not yet bundle tools.

From this directory:

```sh
npm ci
node mcp.mjs --root /absolute/project
```

For a local MCP client, configure that command and arguments as a stdio server.
For Codex, for example:

```sh
codex mcp add video-review -- node /absolute/toolkit/apps/review-agent/mcp.mjs --root /absolute/project
```

Ask the agent to call `open_review` with a recording path and optional workspace
or transcript. It returns `browserUrl`, `sessionId` and preparation status.
`get_review` returns draft progress until explicit completion, then the canonical
review and its paths. `cancel_review` preserves drafts. Never invoke finish on
the human's behalf merely to unblock a waiting command.

Without MCP, the shared engine can be launched directly:

```sh
python3 ../editor/agent_session.py /absolute/recording.mp4 --workspace /absolute/project/review
```

It prints JSON lines: a startup record with the local browser URL, then a final
result on termination. `--wait` exits after explicit finish/cancel (intended for
integration once Done is wired). Exit 0 means completed, 130 means cancelled.
The startup token grants local access: do not commit startup output or logs.
Closing the browser never implies completion. A session is scoped to one source;
restart the service for another session in the same workspace. Service shutdown
stops child engines; saved drafts and completion receipts remain on disk. Session
IDs are valid only for that running service, while artifact paths remain durable.

## HTTP contract

All endpoints retain the editor's loopback Host/Origin checks and launch token.

| Endpoint | Meaning |
| --- | --- |
| `GET /api/session` | sessionId, status, artifactPath, revision, sourceSha256, error |
| `POST /api/finish` | exact sessionId, revision, sourceSha256; approve saved review |
| `POST /api/abandon` | sessionId; cancel review, preserve saved draft |
| Existing `/api/state`, `/api/save`, `/media` | unchanged editor operations |

Finish is idempotent for the same identity. Busy/failed preparation, stale
revision, wrong source/session and externally changed files are rejected.
Completion never exports, renders or invokes Flutter. The agent must follow the
user's agreed next step after retrieving the artifact. The root path check is
not an OS sandbox: this is a trusted local agent integration.

## Validation

```sh
npm test
python3 -m unittest discover -s ../editor/tests -p 'test_*.py'
```

Tests use synthetic media with real FFmpeg, the MCP SDK and a real Python child
engine. They cover seeking byte ranges, canonical saves, stale finish rejection,
receipts, cancellation, token/Origin checks, post-approval changes and child
cleanup. Bridge tests cover flush ordering, concurrent Done clicks and host
notification failure. No browser/host UI automation is claimed by these tests.
