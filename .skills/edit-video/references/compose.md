# Video Compose

Read the recorded style selection and per-video overrides first. If missing or
unresolved, follow [style selection](../../video-style/SKILL.md#resolve-the-style-before-creative-decisions)
before making creative decisions. Do not infer a style from the available components.

Read flow/05-compose/README.md and components/CATALOG.md. scripts/video.py
prepare-clips creates reusable per-range media and generated source_clips.dart;
compose scaffolds one Fluvie scene per clip. Use stable clip IDs to address footage
and keep custom visuals outside the generated data file. Author scenes from this handoff;
never replace an existing authored composition unless requested. Preload programs/fonts/media, then use frame-derived motion and immutable
props. Keep audio ownership explicit across scenes, with no duplicated narration. Use private design-package
environment settings when generating a branded workspace. Check actual rendered
pixels, not just compilation. Component availability is not editorial permission.

For creating or refining SVG assets, vector explainers or diagrams, use
[component-author](../../component-author/SKILL.md). It owns graphic structure
and geometry; this skill owns placement and timing in the composition. Reuse an
existing graphic when only its timing or placement needs to change.

For framework-specific mechanics, read [fluvie-compose](../../fluvie-compose/SKILL.md).

## Review the composition before encoding

Run [fluvie-validate](../../fluvie-validate/SKILL.md) on changed composition files first.
Author a shared Fluvie composition for preview and export. Default to the actual
live Previewer for iteration before any full encode:
`open_preview(path: <authored dart>, project: <project directory>)` on the existing
edit/review MCP server, followed by `get_preview` until ready and `show_preview` once. Show the player or
local browser URL, collect feedback in chat and edit the original composition.
Source edits reload. Close unused sessions with `close_preview`. Setup and
compatibility are in `tools/previewer/README.md`; do not replace project pins
silently. This saves full intermediate encodes, but media/audio preparation can
still use CPU/storage. Preview does not replace final export QA or encoded-video
review. If setup fails, surface and repair the failure; never silently substitute
an MP4. Unsupported native components require an agreed fallback. Encode only
after preview review and explicit export approval, or an explicit export request.

## Construct the scene sequence

Use the imported timeline to give each scene explicit retained source ranges,
output start/duration and local visual cues. Build its footage, graphics, captions,
sound and transitions together. Assemble all scenes in one Fluvie Video using the
installed API; keep scene-local and whole-video time distinct. A single source
clip can supply multiple trimmed scene ranges when deliberately authored. Preserve
speech handles at boundaries and check joins in live preview. Revisions change
the relevant scene code and timeline, then reload the same composition. Preview
and final export use the same authored scene sequence, not separate reconstructions.
