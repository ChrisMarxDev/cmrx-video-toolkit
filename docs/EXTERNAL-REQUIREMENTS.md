# External requirements inventory

Baseline: 2026-10-15; README summary updated 2026-10-19.
This is the inventory of what must be present on a user's
computer for the current source-distributed toolkit, not a request to install
everything. Choose the workflow first. The product goal is to systematically
reduce user-managed prerequisites while preserving local files and browser use.
No dependency removal or bundled installer is claimed by this inventory.

## README summary and decision status

The [README dependency table](../README.md#current-dependencies) summarizes the
current requirements. This inventory owns exact workflow/package details; keep
both updated when requirements change.

Local app/component builds require Flutter. Node is currently required by the MCP
adapters, optional fal generation, JavaScript tests and docs tooling, not by Flutter itself. Avoiding Node
is an open consideration, not an agreed migration. No Python-to-Dart port, Dart
MCP replacement, tooling rewrite or prebuilt-distribution roadmap has been chosen.
Reduction candidates elsewhere in this inventory are possibilities, not commitments.

## Minimum by workflow

| Workflow | External requirements |
| --- | --- |
| Manual browser review of prepared media | Python 3.10+, FFmpeg/ffprobe, modern desktop browser |
| Review with new local transcription | Above + whisper.cpp CLI + compatible Whisper model |
| Agent launches browser and waits for Done | Same as browser review + the user's existing agent/terminal; no Node/MCP required |
| Local MCP tools / embedded MCP App | Review requirements + Node.js 22+, npm dependencies, local MCP-capable host; inline display needs MCP Apps support |
| Component catalog MCP / optional embedded browser | Node 22+ and adapter npm packages for catalog tools; Flutter/Python/FFmpeg for a cold browser build; MCP Apps and local frames for inline display |
| Basic media inspection, cuts, reframing, sound analysis | Python + FFmpeg/ffprobe |
| Standalone dither studio | Browser only; open the already-built tools/dither/index.html locally |
| Viewing an already-built component browser | Browser plus a static host; the current MCP static host uses Node. No Flutter SDK for viewing; prebuilt release distribution is not yet implemented. |
| Flutter composition / building the component browser | Python + FFmpeg where media preparation is needed + Flutter SDK (includes Dart) + project Pub packages |
| Fluvie preview/final render | Composition requirements + `fluvie` CLI on PATH and runtime/capture support for the selected platform |
| Optional fal media generation | Node 22+, npm packages in tools/fal, network access, fal account/credits and server-side FAL_KEY |
| Optional person/background cutout | Media tools + Python venv/pip + NumPy + ONNX Runtime + RVM model |
| Optional native Flutter Scene capture | Flutter/Dart + native macOS build toolchain + Metal/Impeller-capable environment + Scene packages/assets |

A normal browser does not execute FFmpeg, Whisper or Flutter itself. Those tools
run on the local engine's computer. Using a chat UI does not eliminate them.
No model API key or cloud speech subscription is required for local review.

## User-installed tools and downloaded assets

| Requirement | Needed for / current constraint | Current provisioning | Reduction tracking |
| --- | --- | --- | --- |
| Python | Editor and pipeline; editor supports 3.10+ | Installed interpreter (`python3`, Windows `py -3`); not bundled | Candidate for packaged engine |
| FFmpeg and ffprobe | Probe, audio extraction, browser preview, cuts, exports, rendering/media tools; build needs the used H.264/AAC encoders and filters | System executables on PATH; both typically supplied by FFmpeg | Candidate for managed/bundled binaries; review distribution licensing |
| whisper.cpp `whisper-cli` | New local speech recognition only; override with `WHISPER_CLI` | Separate system/package installation; optional macOS setup script | Candidate for managed optional recognizer |
| Whisper model | Recognition only; e.g. compatible `ggml-base.bin`; path via `WHISPER_MODEL`/launcher | Automatically resolved/downloaded by the editor, kept outside Git; verified multilingual base fallback | Implemented first-use download/cache for the model; recognizer installation remains separate |
| Browser | Ordinary review, browser fallback, web component catalog and dither UI | User's existing modern desktop browser; Chromium has been exercised | Preserve normal browser support; no separate browser required for end users |
| Node.js | Local MCP adapter, docs development and JavaScript tests; adapter >=22, docs >=22.12 | System runtime; not needed by Python-only browser launch | Candidate for bundled adapter runtime |
| npm | Restore locked MCP/docs packages | Normally included with Node; `npm ci` in the relevant directory | Candidate for prebuilt distribution so users never invoke it |
| MCP/agent host | Agent workflow only; local stdio support for current full adapter, MCP Apps support for inline UI | User's Claude/Codex/other agent; browser fallback works without inline UI | Keep host-independent CLI/browser path; do not require one vendor |
| Flutter SDK, including Dart | Flutter compositions/components/catalog and render paths; current packages require Dart >=3.12,<4 | Separate SDK, `flutter`/`dart` on PATH; no separate Dart install needed | Rendering-only requirement; investigate managed engine distribution later |
| Fluvie CLI | `scripts/video.py preview` and `render` invoke `fluvie` | Separate CLI activation/installation; must resolve on PATH | Do not confuse CLI presence with a project's `fluvie` package dependency |
| Native platform build/capture tools | Only when selected Flutter desktop/native capture path requires them | Platform-specific SDK/compiler setup, validated with `flutter doctor`; native Scene path currently documented for macOS/Xcode | Keep separate from browser review baseline; broader native platform validation remains conditional |
| Git | Source clone, updates, submodules and repository workflow | System executable; archive/prebuilt distribution could avoid it for users | Candidate to remove from end-user installation path |

Versions above are repository constraints, not claims that every newer version
or every platform has passed acceptance. Flutter/Dart test versions are recorded
in the main README; SDK compatibility can change independently of review UI.
`scripts/doctor.py` currently reports executable presence for part of this list;
it is not a complete feature-aware installer or compatibility verifier.

## Feature-specific packages (installed by dependency managers)

These are not separate global installation steps, but remain external software
and contribute to the footprint. Full transitive dependencies belong in lockfiles.

| Package / asset | Feature and source of truth |
| --- | --- |
| `@modelcontextprotocol/sdk`, `zod`, `esbuild` (including its platform binary) | Full MCP adapter and shared-UI bundling; `apps/review-agent/package.json` and package-lock.json |
| `@modelcontextprotocol/sdk`, `zod` | Component browser MCP adapter; `apps/component-browser-agent/package.json` and package-lock.json; no bundler or transcription dependencies |
| `@fal-ai/client` | Optional generation connector; `tools/fal/package.json` and package-lock.json. Requires `FAL_KEY` only in the local/server process; generated media remains outside Git. |
| `express` plus MCP SDK and Zod | Synthetic MCP feasibility sample only; `apps/mcp-review-sample/package.json`; not required by full stdio adapter |
| Flutter Pub dependencies, including `fluvie: 0.3.1` | Composition/component packages; pubspec.yaml and lockfiles; `flutter pub get` restores them |
| `flutter_scene: 0.24.3`, `vector_math`, Scene initialization assets | Optional native GPU scene path; `.skills/component-3d/references/native-capture.md` |
| `numpy==2.2.6`, `onnxruntime==1.23.2` | Optional person matting, isolated Python environment; `video_tools/requirements.txt` |
| RVM MobileNetV3 FP32 ONNX model | Optional matting; setup script downloads and checks SHA-256; `video_tools/setup.sh` and README record provenance/license |
| Astro, Starlight and their dependencies | Documentation site development/build only; `docs/package.json` and package-lock.json |
| `esbuild@0.25.12` via npx | Rebuilding the standalone dither studio after editing its JavaScript; `tools/dither/README.md`; not needed to use the committed app bundle |

## Optional setup, development and experiment tools

| Requirement | When it is needed; not part of normal review |
| --- | --- |
| Bash | Existing `.sh` setup/environment helpers; direct Python/Node entrypoints avoid those helpers |
| curl | Existing model-download setup scripts |
| Homebrew | Optional macOS editor setup script installs FFmpeg/whisper.cpp through it; not a cross-platform runtime prerequisite |
| Make | Convenience targets and full source test suite; equivalent underlying commands can run directly |
| Python venv and pip | Optional matting environment; core editor uses Python standard library |
| espeak-ng | Narrated synthetic validation fixtures in `apps/editor/tool/full_flow.py` |
| Playwright and a supported Chromium installation | Optional browser automation tests; not end-user browser requirements; host permission may be required |
| cloudflared | Only `apps/mcp-review-sample`'s development `share` command; not needed for local MCP or browser mode |
| Remote connection/tunnel service and authentication | A future/full cloud-host connection needs this or a hosted engine; the full adapter does not yet implement it, so no production provider is mandatory today |
| Network access | Initial SDK/package/model downloads and optional cloud agents/tunnels; prepared local media processing does not inherently require cloud services |

An embedded host must permit media from the configured engine/relay origin.
Account/plan availability and host permissions are external service conditions,
not PC dependencies. Disk space for original recordings, preview/audio caches,
models and raw render frames is also required; the renderer checks raw-frame
space. This inventory does not prescribe a universal RAM/disk minimum.

## Maintenance and reduction policy

1. Update this file whenever a feature adds, removes, bundles or changes an
   external requirement. Link the actual entrypoint/manifest; classify runtime,
   optional feature, development and experimental requirements separately.
2. Keep the minimum browser-review path explicit. Do not make optional Flutter,
   matting, hosted-service or testing dependencies appear universally required.
3. Track reductions against this baseline. Mark a requirement bundled/managed or
   removed only after a working distribution and clean-machine validation exist.
4. Aim for a single user-facing launch and minimal manual installation. For now,
   this document records the list and candidates; it does not authorize replacing
   dependencies, changing licensing or deploying remote infrastructure.

Private workspace orchestration may additionally use `kw` and its skill, brand
assets or private adapters. Those are not requirements for the standalone public
video toolkit and must not be bundled into it accidentally.

Authoritative implementation references: [editor setup](../apps/editor/README.md),
[agent integration](../apps/review-agent/README.md), [pipeline](../scripts/video.py),
[media tools](../video_tools/README.md), [component manifest](../components/pubspec.yaml),
[development](DEVELOPMENT.md), and the manifests/setup scripts named above.

### Local desktop test plugin setup

`apps/review-agent/install-local.py` is agent-operated setup for an existing
checkout, not an end-user terminal step or bundled installer. It additionally
uses the Codex CLI to register a local marketplace/plugin. Runtime requirements
remain Python, Node, FFmpeg and a supported local desktop host; transcription
still needs whisper.cpp and its model. No tunnel is added. System dependencies
are not yet bundled. A user must never be told to run these setup commands.

## Live composition previewer (optional)

`tools/previewer` uses Node 22+, Flutter, system FFmpeg/FFprobe and the compatible
Fluvie JSON web-preview API. It is served through the existing review MCP server;
there is no extra MCP registration or npm dependency for the standalone manager.
Some published 0.3.1 installations lack that newer API despite the same version
label. See [setup and compatibility](../tools/previewer/README.md). Source project
pins remain explicit; this does not upgrade the toolkit component package.
Flutter build caches and temporary audio preparation remain; no full video is
encoded just to preview. Browser/native component support must be checked.
