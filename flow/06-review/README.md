# Review

Start with the actual live Fluvie composition preview after validation. Follow
`.skills/edit-video/references/compose.md`; source edits reload in the player.
Repair preview failures instead of silently encoding a substitute. Export requires
an explicit request or approval after preview feedback.

After an authorized export, open the rendered draft MP4 in the existing review editor so the user can highlight
sections and leave comments. Follow `.skills/video-review/SKILL.md` for opening a
separate review workspace per render revision, waiting for Done, and retrieving
feedback. Apply that feedback to the composition and return to live preview;
comment times belong to the reviewed draft, not the original recording.

Use live preview for visual feedback and a draft MP4 to verify actual encoded audio and video. Keep review/feedback.md with pending/resolved items. After new cuts, regenerate the rough cut and reconcile storyboard and Dart cues before updating their revision manifests. `video.py qa` probes duration and extracts three frames; inspect and listen manually too.

Commands run from the toolkit root; `video.py` means `python3 scripts/video.py`.

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
preview → approved export → direct review loop until the human approves. Done submits
feedback; it does not independently authorize a render or final publication.
