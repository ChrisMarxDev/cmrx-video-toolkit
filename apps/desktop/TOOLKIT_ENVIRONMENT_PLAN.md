# Toolkit development environment: implementation and acceptance

## Product imperative

The app is a UI and development environment for the video toolkit. Flutter remains
our programmable graphics/animation engine. Transcripts, audio-level maps and
sampled frames explain source intervals together; transcript-first editing is not
the product direction. Chat, visual inspection and precise small edits stay central.

Components are authored dynamically as code. Optional property schemas are authored
alongside that code and generate controls; the app must never hardcode a catalog of
video elements or restrict the agent to predefined graphics.

Toolkit capabilities are not bounded by editor interactivity. When arbitrary
agent-authored video cannot be represented interactively, support verified rendered
output in the same review player, with clear freshness/interaction capabilities.
Never discard toolkit functionality to fit the editor's current model.

## Shared implementation boundaries

Reusable project logic lives in `flow/project/`, independently of Electron/React.
The app, agent tools and standalone project CLI consume the same contracts. Existing
project v1 files remain supported; new exact timing metadata is additive, validated,
and its seconds fields are compatibility projections rather than a second authority.
Keep one document acceptance owner and preserve revision checks, locks and undo.

## 1. Exact time and shared resolution

- Exact rational arithmetic uses integer strings and integer timebases, supporting
  fractional frame rates and sample positions without JSON BigInt problems.
- Canonical clip timing is persisted with derived seconds for existing consumers.
  Trusted edit operations rebuild projections; inconsistent external documents fail
  with actionable diagnostics rather than choosing a silent authority.
- One resolver handles clip/source/local conversions and optional content anchors;
  all preview/render/inspection consumers receive its resolved result.
- Stable source cue IDs/revisions support source inspection and optional anchoring,
  without requiring transcripts to edit or create a video.

Acceptance: exact mixed-rate arithmetic and round-trip serialization; legacy load,
frame-boundary trim/split/ripple/undo; projection consistency; browser and render
source-clock agreement. No silent timing shift in an existing real project.

## 2. Multimodal source inspection

- Query a source interval independently of timeline occurrences and combine timed
  text, cached waveform levels and sampled-frame references in one response.
- Provide an asset-first viewer with a source range, level map, frame strip and
  timed cues; navigation selects evidence, not transcript deletion as the main UI.
- Source index records identify media/transcript revisions. Re-imported text never
  silently reuses identities for unrelated content; reconciliation is explicit.

Acceptance: seek a range that was removed from the edit, correlate cues/levels/
frames to source time, return bounded results for long sources, preserve index
identity through clip move/split/delete, reject stale/missing references.

## 3. Asset-only import and optional anchors

- Register long recordings without inserting their entire duration on the timeline.
  Timeline insertion remains explicit, accepts a selected source range and is one
  undoable document operation. Import UI exposes this choice with minimal copy.
- Optional graphics anchors can target a source cue or source interval plus an
  explicit clip occurrence. Resolve missing/ambiguous anchors to hidden content and
  a review warning; do not attach to unrelated media. Fixed placements still work.

Acceptance: import a >10-minute source into an empty project without extending the
sequence; insert only a short range, inspect unused portions, save/reopen. Anchored
Flutter graphics follow moves/cuts, and removed/ambiguous targets produce warnings.

## 4. Dynamic Flutter component controls

- Project-owned definitions refer to arbitrary Dart source and an authored versioned
  property schema. Instances retain independent properties and timing.
- Generate controls for declared property types, defaults and ranges; validate both
  human and agent edits. Undeclared/custom code remains supported, with source access.
- Pass resolved properties to Flutter through the manifest; changing values changes
  the rendered output without rewriting the component implementation.

Acceptance: create a previously unknown component in a test project, discover its
schema, change text/number/color/boolean controls in the app, undo, render and verify
pixels/properties. Invalid values reject atomically; raw-code components still render.

## 5. Project checkpoints

- Checkpoints bind a document snapshot, authored source, component definitions and
  media identities. They are separate from per-document undo and render jobs.
- Preview checkpoint differences before restoring; protect against stale restores.
  Restore code plus document with rollback on failure, preserving current work first.
- Shared libraries, provider sessions, credentials and toolchain caches are excluded.

Acceptance: change clips and Dart, restore both, render the restored result; detect
changed/missing media and stale revisions; simulate a write failure and prove current
project/source survive; check traversal/symlink boundaries and restart durability.

## 6. Interchange and noninteractive output

- Export a documented OTIO subset for footage/audio timing and baked media references.
  Preserve the native project/source alongside it and enumerate unsupported features;
  never claim arbitrary Dart effects remain editable in another application.
- Register agent-generated output from project assets after probing/validation,
  preserve provenance, and show it in the existing single player. Render-only mode
  does not pretend to provide timeline controls for unsupported capabilities.
- Edits that invalidate a registered output mark it stale. Toolkit rendering and
  source authoring remain available even when interactive controls are unavailable.

Acceptance: export a cut timeline, inspect clip ranges/media references and warnings;
round-trip the supported subset. Register an arbitrary generated video absent from
normal clips, review/export it, detect staleness, and verify one visible review player.

## Integration acceptance

Run focused unit/service checks per stage, browser checks for new controls and
workflow states, existing editor/desktop suites, and real Flutter + phone-footage
acceptance. Test a whole-project checkpoint and a dynamically authored component
through the same tool interface agents use. Keep fixture and native/installed/Mac
claims separate. Update public architecture/skills and Studio knowledge, then push
toolkit commits before Studio's pointer. No release is implied by source pushes.

## Implementation status — 2026-11-14

All six slices above are implemented. Shared modules: `flow/project/`; desktop
adapter: `src/project-services.mjs`; one source/property dock and a secondary
checkpoint/interchange dialog. Normalized inputs remain distinct from recordings.
The interactive canvas/sequence bounds remain documented; arbitrary registered
output does not require clips or fit those bounds. No runtime dependency was added.

Verification: editor/core tests, desktop services, browser workflow and actual
Flutter over imported phone footage. The real render test changes properties and
Dart, follows a cue through a split, restores both source/document and checks
rendered colors/audio again. Checkpoint tests exercise rollback, missing media,
revision conflict, symlink refusal and interrupted-restore recovery. Source tests
use a real 601-second recording fixture and only insert four seconds. Browser
acceptance checks one rendered player, controls, source insertion and history UI.
Linux checkout verification does not establish a new signed installer or Mac test.
See the owning Make targets and `flow/project/README.md` for reproduction and limits.

The actual Linux Electron shell also passes checkpoint naming with a DOM form,
Enter-to-save, review/restore and the safety checkpoint. Generated instance dispatch
is analyzer-clean; fully hidden instances cannot fall back to legacy graphics.
Video/audio assets remain immutable references during checkpoint restore.
