# Local editor project contract

The data contract is the primary product of this experiment. The preview,
timeline, comments UI and agent CLI are clients of the same authored document.
`project.json` is portable data; it must not depend on React state or a running
agent. The machine-readable structural contract is [project.schema.json](project.schema.json).
`src/model.ts` additionally validates relationships and implements edit semantics.

## Document boundaries

- **Project:** canvas, source assets, clip instances and comments. Persisted in
  `project.json`; every accepted UI/API/file change produces a new revision.
- **UI context:** selected clip, playhead, panels and unsubmitted comment text.
  Selection/playhead reported by clients is advisory; it is not authored project data.
- **Derived data:** resolved comment positions, extension geometry and render jobs.
  Render jobs hold immutable project snapshots and input revisions in `.editor/jobs/`.
- **Recovery:** `.editor/state.json` and `.editor/revisions/` retain accepted state
  and undo history. Copying only the project does not carry undo history or media.

## Current v1 entities

`schemaVersion: 1` identifies the format. `revision` is a monotonic accepted-state
counter, not a schema version. Undo/redo also increment it. `name`, `width`,
`height` and `fps` define the composition.

`assets[]` describes source media: stable `id`, display `name`, workspace-relative
`media/` path, source `duration` and whether it has audio. An imported asset is
currently a proxy with original-path provenance, not an original-quality render
source. Asset bytes are assumed immutable; content hashes are not yet enforced.

`clips[]` describes timeline instances: stable `id`, `kind`, display `name`, optional
`assetId`, timeline `start`, source `in`, `duration`, numeric `track`, rectangle
`x/y/width/height`, `muted`, optional linear audio `volume` (0–16, default 1),
and extension-owned `props`. Gain applies to both browser playback and exports;
muting still silences the clip regardless of gain. Multiple clips can use the
same asset. Ordering is track, start, then ID; overlapping audio mixes.
The timeline may pack overlapping cards into multiple display rows within one
track. Those rows are derived, zoom-dependent UI geometry and are never persisted
as track IDs or used to change render ordering. Unknown
kinds/data survive mutations; unsupported kinds block rendering.

Desktop graphics clips use `kind: graphics` and a project-defined `componentId`
or `props.source`, a Dart
module path under `lib/` with no dot-prefixed path segments. They need no asset.
Each module exports `Widget buildGraphics(double clipTime, Map<String, dynamic>
manifest)`. The desktop capture stack applies the same timing formula below,
rectangle, track order and disabled-layer flags in preview and export. These
graphics form a plane above footage; they do not interleave beneath media clips.
The standalone FFmpeg renderer does not support Dart graphics clips.

V1 numeric time fields are **seconds**, with integer `fps`. Accepted edits add
exact rational `timing` and derive the seconds projection. UI gestures snap to frames;
raw/API edits may contain off-grid values. Active intervals are half-open:
`[start, start + duration)`. For ordinary-speed media:

```
sourceTime = clip.in + timelineTime - clip.start
timelineTime = clip.start + sourceTime - clip.in
```

No speed mapping is implied. Graphic `in` uses the component's local clock;
current cards hold on left trim, while video trims advance the source offset.

## Comments are authored data

`comments[]` is optional for backward compatibility; absence means no comments.
Existing `notes` remains opaque agent-owned data and is not repurposed. Each comment
has a unique stable `id`, nonblank `body`, `status` (`open` or `resolved`),
`createdRevision`, and one explicit `anchor`:

```json
{
  "id": "comment-example",
  "body": "Shorten this pause",
  "status": "open",
  "createdRevision": 4,
  "anchor": {
    "type": "clip",
    "clipId": "opening",
    "sourceTime": 2.5,
    "sourceAssetId": "take-a"
  }
}
```

A clip anchor references **one clip instance and a source/local moment**, not every
use of that source. For media clips, comment creation records `sourceAssetId` as provenance.
It has no persisted timeline position. `locateComment` derives
that position from the current clip. A timeline anchor instead has the form
`{"type":"timeline","time":4.5}` and keeps that absolute edited-output time.

These are point comments; ranges, replies, authorship, assignment and attachments
are not implemented. `createdRevision` records the revision that created a comment,
not its current location or a claim about an authenticated author.
Optional `reopenedRevision` records the latest resolved → open transition.
The desktop chat includes this in its sent-feedback key so reopening an unchanged
note queues it for the next turn again.

### Required behavior under edits

- **Move/reorder:** a clip comment follows its clip; a timeline comment stays fixed.
- **Trim:** the source moment stays unchanged. If it leaves the visible source
  interval, the comment remains in the document with derived `trimmed-out` state.
  Extending the clip can make it visible again.
- **Split:** the left half retains the clip ID; the right half receives a new ID.
  Comments at/after the split source time are rebound to the right half in the same
  transaction. A comment exactly at the boundary belongs to the right half.
- **Delete:** clip comments remain with their original reference and derive
  `missing-clip`. Never silently delete feedback alongside footage.
- **Shorten timeline:** timeline comments beyond its end remain and derive
  `outside-timeline`; comments do not extend video duration.
- **Resolve/reopen:** changes status only. Text and anchors survive. Both states are
  visible in the comment list; only open, currently visible comments get markers.
- **Undo/redo:** restores the entire authored state, including comments and split
  rebinding. Undoing comment creation removes that comment, just like other edits.
- **Raw file replacement:** the writer owns semantic migrations. If it renames or
  replaces clip IDs without rebinding comments, references remain missing. It must
  not assume the service infers splits from unrelated JSON snapshots.

Changing `assetId` under an existing clip ID marks comments with differing
`sourceAssetId` as `source-changed`, instead of attaching feedback to different
footage silently. Raw writers should include that optional field for media anchors.
Comments without it follow the clip identity alone. Content changes at the same
asset path still need future immutable source fingerprints.

## Mutation and concurrency contract

All mutations supply an expected `revision`; mismatches return HTTP 409. The service
reconciles pending external file changes before accepting API writes. UI and agent
use the same commands and broadcast state; no second comment store exists.

- `POST /api/comment`: `{revision, body, anchor}` creates a server-assigned ID and
  `createdRevision = revision + 1`. Creation requires a currently visible target.
- `POST /api/comment-update`: `{revision, id, patch: {body?, status?}}` updates only
  text/status. Changing anchors/IDs requires an explicit whole-project replacement.
- Existing `/api/clip`, `/api/split`, `/api/delete`, `/api/project`, `/api/undo` and
  `/api/redo` operate on this same document. Split owns comment rebinding.
- `GET /api/context` includes the accepted project with comments for the agent.
  No derived comment-position cache is written into the project.

CLI examples (read current revision using `npm run agent -- context` first):

```
npm run agent -- comment REVISION /absolute/path/comment.json
npm run agent -- comment-status REVISION COMMENT_ID resolved
```

The comment file contains `body` and `anchor` only. `replace REVISION FILE` supports
explicit bulk edits while preserving fields the caller does not own. API patch
operations preserve unknown fields, including comment/anchor metadata. Raw file
editing remains a single-writer convenience, not cross-process compare-and-swap.

## Validation and compatibility

The JSON Schema describes structural types and bounds and intentionally allows
additional fields. Runtime validation additionally checks globally unique entity
IDs, source references and trim bounds, canvas containment, timeline duration and
a minimum clip duration of one project frame. Existing missing comment references
are valid authored data; they derive a visible orphan label rather than breaking
project loading. Invalid files retain the last accepted state and block mutations.

Limits: 100 assets/clips each, 1000 comments, 10000 characters per comment, 10-minute
timeline, 8 tracks, 3840×2160 canvas and integer 1–60 fps. There is no silent data
migration on startup. Adding optional comments is backward compatible with prior
v1 projects. Consumers without this extension must retain unknown comments; they
cannot be assumed to implement comment-aware split behavior.

## Next schema decisions, deliberately not hidden in v1

The original brief calls for integer project frames and rational source timing.
V1 now supports additive exact JSON-rational clip timing with a shared resolver;
legacy numeric edits are projected at acceptance and inconsistent external fields
reject. The existing integer sequence FPS remains; fractional source/sample
arithmetic does not imply arbitrary sequence FPS, VFR PTS remapping or retiming.
Stable track entities, full VFR PTS mappings, component implementation version
interchange and comment ranges/threads remain future work. Explicit original/render
representations, disposable proxies and content fingerprints are implemented;
project-authored component schemas do not imply portable arbitrary effects.

## Derived timeline media

Thumbnails and waveform peaks are source-derived cache artifacts under
`.editor/media-previews/`, never project fields or undo operations. A clip displays
its `[in, in + duration)` source range; moving it changes only its timeline position.
Muted clips retain a dimmed source waveform. The authenticated preview endpoint
returns a bounded JPEG sprite, source sampling interval/count, peak rate and peaks;
these are approximate navigation aids, not frame/sample-accurate authored data.

## Evidence

Model tests cover source-following anchors, fixed timeline anchors, trimming,
split boundaries, missing clips, unknown-field preservation and invalid input.
Service tests cover revision conflicts, comment restart persistence and undo.
Browser acceptance covers posting both anchor kinds, live second-client updates,
marker seeking after a move, split/delete/undo, resolve/reopen and page reload.

## Source transcripts

Optional `assets[].transcript` stores up to 5000 ordered segments as
`{start, end, text}`. Times are seconds on the original asset's source clock,
with `0 <= start < end <= asset.duration`. Text must be nonempty (max 10000 chars).
Unknown segment fields are preserved. No transcript is generated automatically.
SRT/VTT or JSON (`[{start,end,text}]` or `{segments:[...]}`) can be imported into
one source from the Transcript tab; imports replace that source's transcript.

`POST /api/transcript` accepts `{revision, assetId, transcript}` and uses the same
revision checks, validation and undo history as clip/comment edits. An empty array
clears a source transcript. The whole project/API/file watcher contract also
validates these fields. Existing projects without transcripts remain valid.

The tab derives timeline rows by intersecting each source cue with every clip's
retained `[in, in + duration)` range and mapping the overlap to timeline time.
Moves, trims, repeated uses and splits never rewrite source cues. Partially retained
cues display the full original text: segment timing cannot determine word-level
cuts. Overlapping clips can yield simultaneous rows. Click seeks to the visible
cue start and selects its clip. Active highlighting is local UI state.

## Layer overrides

Optional `layers` is keyed by authored track number (`"0"` through `"7"`). Each
entry may have `muted: boolean` (silence audio) and `disabled: boolean` (omit video
and audio). Missing flags default to false. Clip `muted` is independent: effective
audio mute is clip mute OR layer mute OR layer disabled. Re-enabling/unmuting a
layer never changes clip flags. Moving a clip changes which layer overrides apply.

Layer settings survive empty tracks; timeline duration and comment/transcript
positions remain unchanged. Unknown fields inside a layer entry are preserved.
`POST /api/layer` accepts `{revision, track, patch: {muted?, disabled?}}` and uses
normal revision checks, undo history and SSE persistence. Preview and FFmpeg
export honor both flags. These are authored project settings, not a local solo
monitor mix; exports reflect the current enabled layers.

## Section take preferences

Optional `takeSections` groups alternatives independently: `{id, label, assetId,
takes: [{id, label, sourceStart, sourceEnd}], preferredTakeId?}`. Times are seconds
on the referenced asset, not timeline positions. Every alternative keeps its own
positive duration; ranges must fit the asset. Section IDs are unique; take IDs
are unique within a section. A preferred ID must belong to that section. Unknown
fields survive edits. Sections may use different assets; alternatives within a
section currently share one asset.

`POST /api/take-choice` accepts `{revision, sectionId, takeId}` with ordinary
revision checks, persistence, SSE and undo. It saves an advisory preference only;
it does not replace clips, ripple later sections or alter exports. The compact
preview control auditions an alternative only when its full source range exists
on an enabled video clip. Moving that clip changes the audition timeline range.
A trimmed/deleted take remains selectable as a preference but cannot be auditioned.
Flattened review videos can carry ranges on the rendered asset; those ranges are
not interchangeable with original recording timestamps.

Canvas dimensions must be even, at least 64 pixels per side, with a maximum
long edge of 3840 and short edge of 2160. Both landscape 3840×2160 and portrait
2160×3840 are accepted; a 3840×3840 square is not. Source media is not resized
by validation.

Review position is UI state: `.editor/view.json` retains the last accepted
`/api/selection` `{clipId,time}` across service restarts, without changing the
project revision or undo history. The browser restores it once on connection,
clamps it to the current timeline and remains paused. Parent desktop tab switches
may send same-origin `cmrx-pause` to stop review playback without moving the cut.


## Toolkit development environment extensions

See [shared project contracts](../../flow/project/README.md). The app is a UI for
arbitrary toolkit/Flutter authoring, not a transcript-first editor or capability
ceiling. `components` defines project-authored source/property schemas; instance
`componentId`/`props` generate controls without a fixed element catalog. Optional
anchors are resolved as a projection; missing/ambiguous targets hide with warnings,
while authoring clips remain in the accepted document. `timing` contains exact
`{value,rate}` integer strings for start/in/duration; seconds are compatibility fields.

Source assets may be up to 24h, independently of the interactive 10-minute sequence.
Source windows combine timed cues/revisions, levels and sampled frames. Media time
is the normalized full-resolution input's clock. Checkpoints capture document/code,
separately from document-only Undo. `previewMode: rendered` and verified
`renderedOutput` select arbitrary toolkit output in the same player without
requiring interactive clips. The agent can continue source authoring; structured
editing remains available in the interactive projection. OTIO carries a documented
footage subset and native/source sidecars with loss reporting.
