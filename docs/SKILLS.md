# Skills over shared tools

`$edit-video` is the main entry point. It loads only the stage reference needed
for the current work and reuses valid existing artifacts. The toolkit is one
bundle; individual skill files are not independent software installations.

## Responsibilities

- Core process: edit-video owns ingestion, transcription, editing, storyboarding,
  composition integration, review coordination and delivery checks.
- Standalone processes: video-style defines identity; video-review operates the
  existing editor and its MCP/browser handoff. Done is feedback, not publication.
- Animation tuning: animation-workshop carries a small Flutter shell inside the
  skill; copy it to a disposable workspace, adapt a few widgets and copy settings
  back to the agent. It needs Flutter but no toolkit service.
- Components: component-select finds/configures; component-author implements and
  registers; component-shaders, component-3d and component-dithering load only for
  their specialist implementation/integration knowledge.
- Effects: effect-background-remove transforms footage into a person alpha asset.
- Framework: fluvie-compose and fluvie-render supply installed-version mechanics;
  fluvie-validate checks static errors and warnings before preview/export;
  fluvie-generative-ai covers optional media/spec generation and cached reuse.

## Shared software

Selection uses components/components.json, the component browser and its MCP
adapter. Authoring uses the same Flutter component library. Review uses apps/editor
and apps/review-agent. Editing/export uses scripts/video.py and Fluvie/FFmpeg.
Background removal uses video_tools; optional external generation uses tools/fal
or the installed Fluvie AI native resolver. Skills do not duplicate these tools.
The animation-workshop shell is a self-contained disposable template, not a second
shared runtime application.

An existing valid selection or generated asset can be consumed directly. Requiring
an output does not mean rerunning the skill that originally produced it. Preserve
source/output time mappings and versioned handoffs in docs/contracts.md.

## Migration

- video-flow → edit-video.
- video-ingest, video-transcribe, video-edit, video-storyboard, video-compose,
  video-render → edit-video/references/{ingest,transcribe,edit,storyboard,compose,render}.md.
- video-components → component-select; implementation/registration → component-author.
- component-authoring → component-author.
- video-shaders → component-shaders; flutter-scene → component-3d;
  video-dithering → component-dithering.

Former names are removed rather than left as duplicate discoverable skills.
Refresh host discovery after updating. $edit-video is callable through the skill
host, not a new CLI binary. All skill links resolve within this toolkit checkout.

Fluvie guidance is adapted from a pinned upstream skill and generative-media docs;
see each Fluvie skill's provenance and MIT notice. No framework upgrade or provider
request is performed by installing skills. Native Scene/web platform limits remain.
The optional [Previewer](../tools/previewer/README.md) plays composed Fluvie videos;
the [Validator](../tools/validator/README.md) checks authored code before playback/export.

## Distribution boundary

Only user-facing video capabilities ship here. Toolkit development and repository
maintenance skills live in the outer Studio repository. Vercel's skills CLI can
install this collection directly from ChrisMarxDev/cmrx-video-toolkit; see the root
README for listing/install commands and the separate toolkit-runtime requirement.
