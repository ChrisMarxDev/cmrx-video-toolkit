---
name: video-review
description: Revise a video at the affected workflow stage without losing prior work.
---

# Video Review

## No-terminal user experience

Run setup and launch commands yourself when your host permits it. Never ask a
nontechnical user to open a terminal, paste a command, edit MCP configuration or
manage a background server. Commands in this skill are agent/developer instructions.
Prefer an installed plugin/tool; if setup needs a host restart or a graphical
permission, give the user that single UI action. If you cannot perform setup,
explain the missing capability instead of claiming installation succeeded.

## Source recording review with a human

Before new transcription, follow **Language-aware preparation** in
`.skills/video-transcribe/SKILL.md`; chat language is a hint, while the recording
and explicit user instructions determine recognition settings.

Read `apps/review-agent/README.md`. Use a configured `open_review` MCP tool with
the recording path and workspace (or an existing review.json). The same editor
is an MCP App in supporting hosts and a normal web app through `browserUrl`.
When the user supplies a local video, pass its path to `open_review`. When they
ask to start without a file, call `open_review` with no path. The user chooses
Open video and selects a file directly in the embedded or browser editor. Do not
open another app or tab automatically; browserUrl is a manual fallback.
The file is copied to the local engine, not attached to chat or sent through MCP.
Do not pass workspace/transcript without a path. Both routes wait for human Done.

Do not infer lack of UI support from session data in a tool response. If the
host cannot render MCP Apps, open the returned URL in the user's browser.

Without MCP, run from the toolkit root:

```sh
python3 apps/editor/agent_session.py VIDEO --workspace WORKSPACE --open --wait
```

Omit VIDEO to start the CLI with its file picker instead.

Leave the execution session alive while the human reviews. Use `--model MODEL`
or `WHISPER_MODEL` for new local transcription, or `--transcript JSON` to import
existing recognition. Use caller-owned launch adapters when the workspace has
one. Do not clear previous reviews or overwrite originals to start a session.

The current editor supports keep/cut/comment time ranges with free-text notes.
Report the saved range types, source times and notes after review.

Wait for explicit Done. The UI flushes edits and saves review.json plus a
review-completion.json receipt. The embedded app requests conversation
continuation; the browser CLI returns a final JSON result. MCP/browser fallback
agents may poll `get_review`. If host continuation fails, the saved artifact is
still valid; ask the human to continue the conversation manually.

After completion, call `get_review(sessionId)` or inspect the final CLI result.
For CLI results, verify `artifactSha256` against the bytes at `artifactPath`
before consuming the file. Read annotations, preserve source-time intent and
follow the agreed next stage. A draft, failed job, closed tab or cancelled review
is not approval. Never call finish just to unblock your own workflow. Done does
not itself authorize export/rendering. Existing Export remains available for
the canonical pipeline handoff; cut changes require source/output remapping.

The full integration currently supports local stdio MCP and local browser use;
remote cloud access still needs its own authenticated connection layer. Setup
requirements are listed in `docs/EXTERNAL-REQUIREMENTS.md`.

## Reviewing an existing composition

After rendering a draft, open that MP4 in the same review editor using
`open_review` (or the CLI flow above), with a separate review workspace for that
render revision. Let the user highlight ranges and comment, then wait for Done
and retrieve the saved feedback. Comments refer to times in that rendered video;
use them to revise the original composition, not as source-recording cut ranges.
Render the revision and repeat as needed before final approval and rendering.

Read flow/06-review/README.md. Preserve prior reviewed exports. Visual changes
reuse timing/audio; cut changes rebuild the timeline and resolve cues again. Record
feedback and artifact versions. Validate against the selected workspace direction;
report what was actually inspected, and distinguish review drafts from approval.

## Return edited videos to the human

After each authorized edit/draft render finishes, call `open_review` yourself with
`path` set to that exact rendered video and `workspace` set to a separate revision
folder, for example `reviews/revision-02`. This opens the video directly: do not
ask the user to upload it again, find it in the picker, or paste a path. Use the
same MCP editor for the initial recording and every subsequent draft.

Keep the prior recording review and render immutable. Do not reuse a source
transcript for a cut/rendered video: omit `transcript` for fresh preparation, or
supply one explicitly aligned to that rendered revision. Wait for human Done,
then call `get_review(sessionId)` and apply its notes to that revision of the
composition. Its times are rendered-video times, not original source times;
map through the edit timeline when changing source cuts. Repeat the authorized
edit → draft render → direct review loop until the human approves. Done submits
feedback; it does not independently authorize a render or final publication.
