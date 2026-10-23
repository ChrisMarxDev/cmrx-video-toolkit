# Video Compose

Read flow/05-compose/README.md and components/CATALOG.md. scripts/video.py
compose creates a baseline; never replace an existing authored composition unless
requested. Preload programs/fonts/media, then use frame-derived motion and immutable
props. Keep the audio-bearing clip mounted throughout. Use private design-package
environment settings when generating a branded workspace. Check actual rendered
pixels, not just compilation. Component availability is not editorial permission.

For creating or refining SVG assets, vector explainers or diagrams, use
[component-author](../../component-author/SKILL.md). It owns graphic structure
and geometry; this skill owns placement and timing in the composition. Reuse an
existing graphic when only its timing or placement needs to change.

For framework-specific mechanics, read [fluvie-compose](../../fluvie-compose/SKILL.md).

## Review the composition before encoding

Run [fluvie-validate](../../fluvie-validate/SKILL.md) on changed composition files first.
For compatible Fluvie projects, prefer the minimal Previewer for iteration:
`open_preview(path: <authored dart>, project: <project directory>)` on the existing
edit/review MCP server, followed by `get_preview` until ready and `show_preview` once. Show the player or
local browser URL, collect feedback in chat and edit the original composition.
Source edits reload. Close unused sessions with `close_preview`. Setup and
compatibility are in `tools/previewer/README.md`; do not replace project pins
silently. This saves full intermediate encodes, but media/audio preparation can
still use CPU/storage. Preview does not replace final export QA or encoded-video
review; unsupported native components need an explicitly identified fallback.
