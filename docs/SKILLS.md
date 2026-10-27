# Skills & tools glossary

`$edit-video` is the main entry point. It loads only the stage reference needed
for the current work and reuses valid existing artifacts. The toolkit is one
bundle; individual skill files are not independent software installations.

## Browse the collection

Browse the collection when you need one particular capability. A **skill** guides
an agent; a **workflow stage** is a reference inside `edit-video`; a **tool** or
**library** provides the software those instructions use. Most skills share the
toolkit runtime. Installing a skill alone does not install its dependencies.

### Core editing, style and review

| Entry | Type | When it’s useful |
| --- | --- | --- |
| [edit-video](../.skills/edit-video/SKILL.md) | Core skill | Create or revise a video, coordinating the workflow from source material to reviewed export. |
| [video-style](../.skills/video-style/SKILL.md) | Skill | Define or refine your colors, typography, framing, motion and editorial rules. |
| [video-review](../.skills/video-review/SKILL.md) | Skill | Review cuts and visuals, collect timed feedback and return it to the agent. |
| [vertical-video](../.skills/vertical-video/SKILL.md) | Skill | Check portrait format, export compatibility and platform UI safe areas without editorial changes. |

### Editing subskills / workflow stages

These are progressively loaded parts of `edit-video`, not separately installed or
invoked skills. The agent enters at the stage your project needs.

| Stage | When it’s useful |
| --- | --- |
| [Ingest](../.skills/edit-video/references/ingest.md) | Bring source media into a working project and inspect it. |
| [Transcribe](../.skills/edit-video/references/transcribe.md) | Generate or correct the transcript used for editing. |
| [Edit](../.skills/edit-video/references/edit.md) | Choose takes and cuts while preserving source-to-output timing. |
| [Storyboard](../.skills/edit-video/references/storyboard.md) | Decide what the viewer should see alongside the narration. |
| [Compose](../.skills/edit-video/references/compose.md) | Assemble footage, captions, graphics and sound into editable scenes. |
| [Render & delivery](../.skills/edit-video/references/render.md) | Export the approved composition and check the resulting media. |

### Components & animation

| Skill | When it’s useful |
| --- | --- |
| [component-select](../.skills/component-select/SKILL.md) | Find an existing component and choose its variant and properties. |
| [component-author](../.skills/component-author/SKILL.md) | Create a graphic or register a reusable component. |
| [animation-workshop](../.skills/animation-workshop/SKILL.md) | Tune a few widgets in a disposable Flutter playground, then copy the settings back. |
| [component-shaders](../.skills/component-shaders/SKILL.md) | Build deterministic shader effects for video. |
| [component-dithering](../.skills/component-dithering/SKILL.md) | Add ordered texture to components or backgrounds. |
| [component-3d](../.skills/component-3d/SKILL.md) | Render geometry through native Flutter Scene capture. |

### Specialist workflows

| Skill | When it’s useful |
| --- | --- |
| [effect-background-remove](../.skills/effect-background-remove/SKILL.md) | Turn existing footage of a person into an alpha cutout for composition. |
| [effect-behind-subject](../.skills/effect-behind-subject/SKILL.md) | Layer text, images or Flutter content behind a person while keeping the scene editable. |
| [meshy-scene](../.skills/meshy-scene/SKILL.md) | Prepare Meshy models, rigs and motion clips for an isolated Flutter Scene workflow. |
| [fluvie-generative-ai](../.skills/fluvie-generative-ai/SKILL.md) | Generate media or a prompt-authored composition when generation is requested. |

### Framework support

| Skill | When it’s useful |
| --- | --- |
| [fluvie-compose](../.skills/fluvie-compose/SKILL.md) | Work with Fluvie’s scene, timing, media and widget APIs. |
| [fluvie-validate](../.skills/fluvie-validate/SKILL.md) | Check authored compositions for analyzer errors and lint warnings. |
| [fluvie-render](../.skills/fluvie-render/SKILL.md) | Preview, export or diagnose a Fluvie composition. |

### Supporting tools & libraries

| Entry | Type | When it’s useful |
| --- | --- | --- |
| [Review / transcript editor](../apps/editor/) | Tool | Inspect source material, mark keep/cut ranges and add timed visual notes. |
| [Review agent adapter](../apps/review-agent/) | MCP adapter | Open review from an agent host and return feedback. |
| [Component browser](../tools/component_browser/) | Tool | Inspect real Flutter widgets, properties, variants and motion. |
| [Component agent adapter](../apps/component-browser-agent/) | MCP adapter | Discover components and open the browser from an agent host. |
| [Video components](../components/) | Flutter library | Reuse widgets, shaders, media and motion with your own styling. |
| [Live previewer](../tools/previewer/) | Tool | Play an authored composition before encoding a full video. |
| [Composition validator](../tools/validator/) | Tool | Run static composition checks before preview or export. |
| [Pipeline](../scripts/) / [media tools](../video_tools/) | CLI tools | Prepare clips, map timelines, transform media and check outputs. |
| [Dither tool](../tools/dither/) | Tool | Explore image/field dithering and export PNGs. |
| [fal connector](../tools/fal/) | Optional connector | Generate media through fal.ai and download it with provenance. |

The animation workshop carries its own disposable template; it still needs Flutter
and the dependencies of the widgets you bring. Other specialist workflows have
their own requirements and platform limits. See the [skill map](../README.md#skills--tools-glossary)
for loading rules and the [requirements inventory](EXTERNAL-REQUIREMENTS.md)
for setup by capability.

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
