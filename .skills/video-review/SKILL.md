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

Read `apps/review-agent/README.md`. Use a configured `open_review` MCP tool with
the recording path and workspace (or an existing review.json). The same editor
is an MCP App in supporting hosts and a normal web app through `browserUrl`.
Do not infer lack of UI support from session data in a tool response. If the
host cannot render MCP Apps, open the returned URL in the user's browser.

Without MCP, run from the toolkit root:

```sh
python3 apps/editor/agent_session.py VIDEO --workspace WORKSPACE --open --wait
```

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

Read flow/06-review/README.md. Preserve prior reviewed exports. Visual changes
reuse timing/audio; cut changes rebuild the timeline and resolve cues again. Record
feedback and artifact versions. Validate against the selected workspace direction;
report what was actually inspected, and distinguish review drafts from approval.
