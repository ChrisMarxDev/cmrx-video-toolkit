# Check tooling before editing

Run this check when starting work or when the requested capabilities change.
Installing skills with `npx skills add` supplies guidance and resources, not the
shared toolkit applications or system dependencies. Setup is agent-operated using
existing scripts/package managers; no new toolkit CLI or universal installer exists.

## Locate and reuse

Distinguish the consuming video workspace, installed skill directory, and toolkit
source checkout. An installed skill's parent is not necessarily the toolkit root.
Reuse the user's configured checkout or the current workspace's toolkit submodule.
Verify it contains `scripts/video.py`, `docs/EXTERNAL-REQUIREMENTS.md` and the app
needed for this task. Do not interpret the consuming project's README as ours.

If the toolkit is absent, obtain it from
https://github.com/ChrisMarxDev/cmrx-video-toolkit into a dedicated tools/cache
location outside the production project. Reuse an existing clone at that location;
do not overwrite it or create a nested Git repository inside the user's project.
Honor an explicit version or existing submodule pin. For a new installation without
a pin, record the resolved commit used; do not claim the skill installer supplied
a compatible runtime version. Compare the installed guidance with that checkout's
skill/docs and API before execution. Do not pull or upgrade a working checkout
merely to start an edit, or switch a dirty checkout to another version.

Use absolute tool paths or an explicit toolkit working directory for commands.
Keep recordings, transcripts, caches and outputs in the consuming workspace, not
the software checkout. Reuse its existing workspace configuration and adapters.
Record the toolkit path/revision in the workspace's existing notes/configuration so
later runs can find it without inventing another installation.

## Determine the minimum

Read the located checkout's `docs/EXTERNAL-REQUIREMENTS.md` and relevant tool README.
Choose based on the next requested operation, not every capability in the toolkit:

- Browser review, media inspection/cuts: Python and FFmpeg/ffprobe. New recognition
  additionally needs whisper.cpp and a compatible model; reuse ready transcripts.
- MCP review/catalog access: Node and the relevant adapter's locked npm packages,
  plus whatever the underlying operation needs. Reuse configured MCP tools first.
- Static Fluvie validation: Python, Flutter/Dart, resolved project dependencies and
  a CLI supporting `validate --json`; see fluvie-validate. No FFmpeg/browser needed.
- Composition/render: compatible Flutter SDK (includes Dart), project Pub packages,
  Fluvie CLI where used, FFmpeg and the chosen platform's capture/build support.
- Person cutout: the optional isolated media environment/model, only when needed.
- Native 3D or generation: consult the corresponding specialist skill; do not
  install GPU/model/provider tooling for an ordinary review or local composition.

A prose-only plan or style discussion does not require a render toolchain. Catalog
file inspection does not require building the component browser. Developer tests,
docs tooling, private Studio knowledge tools and the synthetic MCP sample are not
consumer setup prerequisites. Do not use a full developer bootstrap as a shortcut.

## Inspect, then install or repair

When Python is available, `python3 scripts/doctor.py` from the toolkit is a useful
presence report (Windows may use `py -3`). It does not install anything, check all
versions, cover Node/npm, or establish feature readiness. Missing optional commands
are not blockers. If Python itself is absent, inspect the environment directly first.

Check executable paths and versions for the selected operation, and inspect relevant
manifests/lockfiles and existing environments. Reuse a working SDK, model, virtual
environment, build or server rather than creating duplicates. A binary on PATH is
not sufficient evidence of compatible packages or required FFmpeg filters/codecs.

Install missing requirements yourself within host permissions. Follow the actual
checkout's setup instructions and the dependency's official platform instructions;
look them up when the local docs do not specify a reliable current method. Inspect
setup scripts before running them. Use the user's existing package manager and
isolated environments where provided. Restore locked Node dependencies with `npm ci`
in only the needed adapter/tool, and Pub dependencies in the selected Flutter
project. Check resulting lockfile changes rather than silently upgrading packages.
Flutter's Dart is sufficient; the Fluvie CLI is distinct from the Pub library.

Reuse the editor's documented model discovery/download behavior. Keep downloads
outside software Git. Do not request generation credentials unless generation is
part of the task, expose secrets in output, or call paid providers to test setup.
Normal authorized setup can proceed; request only permissions the host actually
requires. If a system privilege or restart is unavoidable, explain that one action.
Do not ask users to operate a terminal when the agent can perform the setup.

MCP registration is optional and host-specific. Preserve unrelated host settings;
use the documented registration method when authorized and verify connectivity.
Registration on disk does not prove a running host has reloaded it. If MCP is
unavailable, follow video-review's CLI/browser fallback rather than blocking on it.
Browser opening/automation remains subject to the host's permission rules.

## Verify the requested operation

After setup or repair, repeat the relevant checks and perform a small operation:

- Media work: probe the intended input read-only with ffprobe; check required
  codecs/filters when the planned command needs them.
- Transcription: verify recognizer/model availability, then inspect the requested
  preparation result; file presence alone does not prove recognition succeeds.
- MCP: call an appropriate read-only tool or its documented connection check.
- Composition: restore dependencies and analyze the actual project; when capture
  is needed, use a small synthetic/representative frame test before a long export.

A version command, installed package, listening port or successful compilation is
not proof of browser rendering, audio correctness or human acceptance. Report
what is ready, what was actually checked and any remaining blocker. Continue the
requested work once its requirements pass; do not wait for unrelated optional tools.
For a failure, diagnose the reported cause and retry after correcting it. If the
same failure persists, report the exact missing capability and continue independent
work instead of repeatedly reinstalling or claiming success.
