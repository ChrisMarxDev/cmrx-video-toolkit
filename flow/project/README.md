# Toolkit project contracts

The desktop app is a UI and development environment for the toolkit. Flutter and
arbitrary code authoring remain first-class. Interactive timeline support is an
optional presentation capability, never the toolkit's expressiveness limit.
Transcripts, audio levels and sampled frames explain source time together; this
is not a transcript-first editor. No transcript is required to create/edit a video.

These modules are reusable outside Electron:

- `time.mjs`: exact JSON-safe rational time and source/timeline conversions.
- `resolve.mjs`: derived placement, component properties and anchor warnings.
- `source-index.mjs`: source cue identities, revisions and bounded evidence windows.
- `components.mjs`: project-authored schemas for dynamically coded components.
- `checkpoints.mjs`: source/document checkpoints, rollback and interrupted-restore recovery.
- `interchange.mjs`: a documented OTIO JSON subset with explicit loss reporting.

`index.mjs` is browser-safe; storage is a separate Node module. The editor bundles
both contracts for the desktop service. HTTP/MCP/agent mutations still go through
Workspace's revision-checked acceptance; these modules introduce no second store.

## Exact time

```js
import {fromFrames,time,add,seconds,resolveProject} from './index.mjs';
const source=add(fromFrames('300','30000/1001'),time(1,48000));
// {value: integer-string, rate: positive integer-string}; JSON-safe, exact arithmetic.
```

Accepted edits migrate v1 clips additively to `timing: {start,in,duration}`. Numeric
seconds remain derived compatibility fields for existing UI/Flutter consumers.
The `clip-time` operation accepts exact values. Existing numeric operations rebuild
their projection at acceptance. External files with conflicting exact/numeric values
reject; update both consistently, or intentionally remove timing metadata to import
legacy seconds. Legacy documents/history remain readable. Sequence FPS retains the
existing integer 1–60 contract; exact source arithmetic also supports fractional
rates/sample positions. This does not add speed ramps or sample-exact audio mixing.

`resolveProject(authoringDocument)` returns `{project,warnings,duration,capabilities}`.
Its project is an execution/view projection. **Never replace authoring state with
this result**: missing anchors may hide instances only in the projection. Both
render engines and the app use resolved placements/properties. Source time means
the full-resolution normalized render input, not unconverted HDR/VFR recording PTS.

## Multimodal source evidence

`GET /api/source-window?id=ASSET&start=590&duration=30` returns a source window
(maximum 120 seconds): `frames` with sprite positions/timestamps, a static JPEG
sheet, peak-amplitude bins, overlapping timed cues, media identity and transcript
revision. The desktop agent uses `project_action` with `action: source-window`;
its result contains actual image content alongside structured evidence.

The Sources dock combines the frame strip, enlarged still, audio map and timed
text. Select a source interval and Insert range; browsing unused footage never
changes the timeline. Clicking a frame seeks a matching timeline occurrence when
one exists; otherwise the source still remains inspectable. Transcript navigation
and timed-text import remain available in the adjacent tab. Cue timings are not
invented word alignments.

Transcript replacement increments `transcriptRevision` and assigns new cue IDs.
`transcript` operation `reconcile: true` explicitly reuses IDs only for identical
text/time cues. Up to ten preceding transcript snapshots are retained. Cuts/moves
never change source cues. Cached previews are disposable, stat-keyed and bounded
for source queries/long-source timeline excerpts.

Import source… registers media without adding a clip or changing canvas settings.
Recordings that would exceed the interactive ten-minute sequence automatically
use asset-only import. Source assets may be up to 24 hours; insert short ranges
with `add {assetId,in,duration,start,track}`. These are UI resource bounds, not
limits on arbitrary toolkit rendering/registered output.

## Optional content anchors

```js
{type:'anchor',id:'label',anchor:{
  type:'semantic',assetId:'recording',cueId:'recording:r1:c4',
  clipId:'occurrence',offset:{value:'-1',rate:'30'}
}}
```

Source anchors use `type: source` and `sourceTime`; fixed timeline anchors use
`type: timeline,time`. Omit/remove an anchor for ordinary fixed graphics. An
occurrence is required when source content is repeated. Missing/trimmed targets,
old cue revisions and ambiguity hide the graphic and emit a warning; they never
silently retarget it. Explicit clip occurrences follow splits; anchored graphics
resolve through ripple cuts rather than independently rippling their source point.
Dragging changes an anchored instance's offset. Fixed graphics retain ordinary cuts.

## Dynamically authored Flutter components

There is no hardcoded element catalog. The agent writes any Dart implementation
and can optionally declare controls for its instances:

```js
{type:'component',definition:{
  id:'new-orbit',schemaVersion:1,source:'lib/new_orbit.dart',
  properties:{radius:{type:'number',min:10,max:200},color:{type:'color'}},
  defaults:{radius:80,color:'#ffffff'}
}}
{type:'add-graphics',id:'orbit-1',componentId:'new-orbit',duration:3,track:1}
{type:'component-props',id:'orbit-1',props:{radius:120}}
```

The Dart file exports `Widget buildGraphics(double clipTime,
Map<String,dynamic> manifest)` and reads `manifest['graphicsClip']['props']`.
The resolver merges defaults/instance properties and binds the declared source.
Controls support string, number/range, boolean, hex color and enum. Unknown/invalid
properties reject atomically. The Sources dock displays controls for a selected
instance. Raw Dart clips with only `props.source` remain fully supported.

## Checkpoints and interchange

Use the player's … menu → Project history & interchange. Checkpoints capture the
authoring document and project-owned `lib`, shaders, tools, skills, tests, assets,
project instructions/memory/script/design and pubspec. Original/render media and video/audio assets are
referenced by content identity, not duplicated or removed by source restoration. Provider profiles, chat sessions,
caches and shared libraries are excluded. Source snapshots have a 512 MB bound;
keep large recordings under `media/`. Symlinks/path escapes reject.

Review changes before restoring. A revision guard protects the document; changed
or missing media refuses restoration. Current code/document are saved first.
Restoration writes sources then accepts the document through Workspace; exceptions
roll sources back. A durable journal recovers interrupted restores on app startup.
Use checkpoints to undo a source+document restore; ordinary timeline Undo only
restores document history. External processes must still coordinate file edits;
this is not cross-process CAS or collaborative merge.

OTIO export writes `exports/interchange-r…/project.otio`, a native document and
source sidecar. Media references are relative to the **project**, via `../../`;
keep the export in its project or relink media after moving it. The subset carries
footage ranges, gaps and layers. Overlaps become additional tracks. Arbitrary Dart,
canvas effects and audio gain/mute are reported as losses and retained natively;
use the encoded export for exact visual/audio interchange. Import replaces footage
cuts using already registered project media, retaining native graphics/source.
Unsupported OTIO items reject rather than silently disappear. This is not a full
NLE interchange adapter. Format reference: [OTIO serialized schema](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-serialized-schema-only-fields.html).

## Rendered toolkit output

When arbitrary source/effects cannot be manipulated in the timeline, generate a
video with `workspace_exec` and call `project_action output-register` with its
project-owned `assets/` or `media/` path and revision. Registration captures sources,
probes/decodes the output and normalizes incompatible video containers/codecs for
browser review, preserving the authored input. It persists an immutable job before
selecting it in the accepted document. Rendering has no interactive clip requirement.

The existing player switches to the full output, with seek, sound, speed, timed
comments and export. Structural timeline editing is unavailable in that view;
Project history offers Return to interactive timeline. Changes to source/document
mark the registered output outdated; export refuses to present it as current.
No second player or chat video links are introduced. Renderer/source capabilities
remain available to the agent even when interactive controls are unavailable.

## Commands and checks

From the toolkit root:

```sh
make project-inspect PROJECT=/path/to/project
make project-checkpoint PROJECT=/path/to/open/project LABEL='Before redesign'
make project-interchange PROJECT=/path/to/open/project
make project-core-check
make -C apps/desktop toolkit-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright/index.mjs
make -C apps/desktop toolkit-render-check EDITOR_SOURCE_PROJECT=/path/to/imported/project
make -C apps/desktop toolkit-native-check EDITOR_PLAYWRIGHT=/path/to/playwright EDITOR_ELECTRON=/path/to/electron
```

Write commands require the running app and use its authenticated local service;
inspection also works offline. Never print/store the service capability in agent
instructions or Git. Browser acceptance uses fixtures; render acceptance runs actual
Flutter over imported footage and verifies pixels, audio, anchoring and code restore.
