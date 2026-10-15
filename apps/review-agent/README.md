# Browser and MCP App review

One editor, two presentations: a normal local browser app and an embedded MCP
App. Both use the existing Python engine and canonical `review.json`. The MCP
resource bundles the browser's HTML, CSS and JavaScript; there is no second UI.

## Run from an agent

The local integration currently needs Python 3.10+, FFmpeg, Node 22+ and npm.
New transcription additionally needs whisper.cpp and a model. A prepared review
or supplied transcript avoids rerunning recognition. See the complete
[external requirements inventory](../../docs/EXTERNAL-REQUIREMENTS.md).

Install the adapter's locked dependencies once:

```sh
npm --prefix apps/review-agent ci
```

Register this stdio command with your local MCP client:

```sh
node /absolute/toolkit/apps/review-agent/mcp.mjs --root /absolute/project
```

For example, in Codex:

```sh
codex mcp add video-review -- node /absolute/toolkit/apps/review-agent/mcp.mjs --root /absolute/project
```

In a fresh agent session, ask:

> Call open_review for my recording. Show its MCP App if supported; otherwise
> open its browserUrl. Wait for me to click Done, then call get_review and read
> my saved instructions. Do not render yet.

`open_review` accepts `path`, optional `workspace`, and optional `transcript`.
The configured root scopes source/transcript/workspace selection, including
existing symlinks. Models use `WHISPER_MODEL`; `WHISPER_CLI` selects the recognizer.
This is a trusted local integration, not an OS sandbox.

The host may render the UI while the model only receives session data. Never
interpret that data as proof that the host cannot show the app. `browserUrl` is
always available as fallback. Embedded playback uses a scoped loopback media
relay, with one stable origin for the service so cached resource CSP remains
valid across sessions.

**Remote ChatGPT/Claude cloud connections are not wired in this adapter yet.**
The local host must support stdio MCP, and embedded display additionally requires
MCP Apps support and access to loopback media. The synthetic sibling
`../mcp-review-sample` demonstrates the separate remote/tunnel approach. Do not
expose this full local service through that sample's unauthenticated tunnel.
Production remote authentication, connection packaging and real-host acceptance
of this full editor are still outstanding.

## Browser fallback without MCP

From the toolkit root:

```sh
python3 apps/editor/agent_session.py /absolute/recording.mp4 --workspace /absolute/project/review --open --wait
```

That single command opens the normal browser, waits for explicit Done, prints the
completion result as JSON and exits. Without `--open`, the startup JSON provides
the URL to open manually. Without `--wait`, the server remains available until
stopped. For manual review without agent completion, the existing
`python3 apps/editor/server.py` entrypoint remains supported and needs no Node.
Windows can use `py -3` in place of `python3`.

The agent should keep the process running in its execution session and wait/poll
for the final `event: "result"` line. Exit 0 means completed; 130 means cancelled.
Preparation failures appear in the UI/status and allow Retry; they are not Done.
Browser closure never implies approval. Ctrl+C cancels and preserves saved drafts.
Launch tokens grant local access: do not commit startup output or logs.

## Completion and handoff

Done commits the active comment, flushes pending saves, checks the exact session,
source and revision, and writes `review-completion.json` beside `review.json`.
The receipt includes the exact artifact SHA-256. Editing is locked once complete.
`get_review` returns progress while reviewing; after Done it returns the canonical
review and receipt paths, with the review contents. It detects file changes after
approval. It never silently treats a draft or cancellation as approved.

Embedded Done sends a standard `ui/message` request to continue the conversation.
If the host declines or times out, the save remains completed and the UI tells the
user to ask the agent to read the session. Browser Done wakes the waiting CLI;
MCP agents using the browser fallback can poll `get_review` instead.

Completion does not export, render or invoke Flutter. Continue only the workflow
the user requested. Existing Export still produces the pipeline handoff, with
source/output timing preserved. Session IDs belong to the running service;
artifacts and receipts survive shutdown. One live session owns a workspace;
restart the service to start another session in that same workspace.

## Interfaces and adapters

| Interface | Purpose |
| --- | --- |
| `open_review` | Prepare/reopen one recording, return session and browser fallback, attach MCP UI |
| `get_review` | Read progress or verify/read the approved artifact |
| `cancel_review` | Cancel explicitly, preserve draft |
| `review_session_request` | UI-only transport for state/save/finish/export/retry/cancel |
| `GET /api/session` | Session status, artifact path, revision and source identity |
| `POST /api/finish` | Finish saved revision with sessionId, revision, sourceSha256 |
| `POST /api/abandon` | Cancel session by sessionId |

The existing HTTP token and loopback Host/Origin checks remain. App-only tool
visibility is a host hint, not an authorization boundary. The media relay serves
only session preview video, supports byte ranges, and exposes no file browser.

`bridge.mjs` owns flush-before-Done and notification error handling.
`../editor/web/agent.mjs` chooses HTTP or the MCP Apps postMessage bridge.
`resource.mjs` bundles the existing editor, without nesting it in another iframe.
`createServer(runtime, { decorateResource })` accepts caller-owned HTML decoration;
`REVIEW_ENGINE` can select a Python launcher with the same CLI and session API.
This supports private branding without copying it into the public toolkit.

## Validation

```sh
npm --prefix apps/review-agent test
python3 -m unittest discover -s apps/editor/tests -p 'test_*.py'
node --test apps/editor/tests/model.test.mjs
```

Tests use synthetic media, real FFmpeg, the MCP SDK and a real Python child engine.
They cover resource bundling/CSP, media ranges, canonical saves, stale revisions,
completion receipts, cancellation, authentication, external file changes and
cleanup. Bridge tests cover failed saves, concurrent Done and notification failure.
Browser and simulated embedded-host checks are distinct from actual host acceptance.

## Agent-managed desktop test installation

Nontechnical users must not run terminal commands. The following setup is for an
agent operating an existing developer checkout. It installs a local desktop
plugin containing the review skill and an automatically launched stdio server:

```sh
python3 apps/review-agent/install-local.py --root /absolute/video/project
```

The agent runs this command. `--entry /absolute/adapter/mcp.mjs` selects a
caller-owned UI adapter. The helper checks Node 22+, npm, Codex, FFmpeg and ffprobe,
installs locked Node dependencies if absent, and captures the Python executable
and PATH so GUI launches do not depend on an interactive shell. It creates a
managed local marketplace and installs/enables `video-review@video-review-local`.
Existing unrelated plugins are preserved. Rerun after moving the checkout or
changing the skill. It provides portable and legacy Codex plugin manifests because
older clients do not discover root mcp.json automatically.

The user's steps are: restart ChatGPT desktop, open a fresh local/Work or Codex
session, and ask Video Review to review a recording. After editing, click Done;
the agent retrieves the approved artifact. A host permission prompt may still
need a click. The skill and tools are loaded together; the old synthetic sample
is not the full editor.

This setup requires a supported local desktop executor. ChatGPT web does not read
local Codex plugin configuration. It does not install system runtimes, distribute
a standalone package, or establish a remote connection. Missing prerequisites
are reported to the operating agent, which must provision them or offer graphical
installation rather than delegate shell commands to the user. Clean-machine
installation remains a separate acceptance requirement.

References: [plugin packaging](https://developers.openai.com/plugins/build/plugins)
and [local MCP plugins](https://developers.openai.com/plugins/deploy/desktop-only).
