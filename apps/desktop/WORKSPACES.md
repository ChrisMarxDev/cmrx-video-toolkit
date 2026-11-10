# Workspaces and projects

A workspace is the portable home for shared creative resources and multiple video
projects. Create/open one through the **+** menu. The first New project asks for a
workspace folder; canceling leaves the project uncreated. Choose a new folder or
an existing workspace through its dedicated menu actions. Workspace creation adds
only its configuration, shared directories, instructions and ignore rules; it does
not initialize a Git repository, move existing files or configure a remote.

```text
My Studio/
  workspace.yaml             # schemaVersion: 1, name: My Studio
  AGENTS.md                  # instructions shared by projects
  .gitignore
  assets/                    # shared media and assetconfig.yaml bundles
  skills/                    # shared SKILL.md folders, scripts and references
  projects/
    jev-video/
      project.json           # timeline, layers, comments and canvas
      AGENTS.md              # optional project-specific instructions
      memory.md              # project decisions
      script.md
      lib/                   # authored Flutter graphics
      shaders/
      assets/                # project-specific resources and copied shared assets
      media/                 # full-resolution playback copies; originals/ keeps unconverted sources
      skills/                # optional project-specific skills
      chats/history.json     # portable conversation
      exports/               # generated output; ignored
      .editor/               # local sessions, tokens, caches, history; ignored
```

Files appear as they are authored/imported; projects do not need recordings to
start. One project is one video, potentially exported in multiple formats. This
change does not add export-format management.

## Working in the app

The + menu shows the selected workspace, its unopened projects and recent
workspaces, alongside existing project actions. Creating a project places it under
that workspace's `projects/`. Opening another workspace keeps project tabs alive
but shows the empty state until a project is opened or created. Selecting a tab
returns to that project's owning workspace. Workspace selection, open tabs and
recent folders are remembered locally; projects are discovered from disk when a
workspace is opened on another machine.

Assets has **Workspace** and a view named after the current project. Workspace assets always come from
`<workspace>/assets`; no global library or arbitrary external library selector is
exposed for workspace projects. Selecting a shared asset makes an independent
project copy before agent use. Existing bundle previews, instructions, promotion
and trash behavior remain available; Save to library saves to this workspace.

Settings → Skills → Add skill folder installs into `<workspace>/skills`. Agents
can discover both `workspace/name` and `project/name`, plus shipped app/toolkit
skills. Same-named skills keep explicit scopes. The offline worker mounts the
selected workspace skill directory at `/skills`; it does not mount every project.

Settings → your project name edits workspace instructions, project instructions and project
memory. Workspace instructions apply across projects; project guidance refines
that context. The app checks for concurrent workspace instruction changes before
saving. Other projects' chats and source are not automatically added to context.

Provider credentials, secret keys, device connection configuration, CLI downloads
and installed compiler/toolchain files remain in the local app profile. They are
not part of the portable creative workspace. There is no global creative library
in this version. Existing profile libraries are not deleted or silently imported.

## Git and portability

The recommended Git boundary is the workspace root. All project files and shared
creative dependencies use workspace-relative layout. The generated ignore rules
exclude local `.editor/`, `.cmrx/`, Dart/build caches and generated exports while
preserving source, scripts, chats, media, assets and skills. Review imported files
and chat content before sharing a repository. The app does not commit, push, merge
or choose a media storage backend. Large original recordings need a deliberate
large-file storage policy; source Git alone is not a turnkey video backup service.

Moving/copying the workspace with its media preserves the folder relationships.
Open its root with Open workspace, then choose a project from the + menu. Local
caches are regenerated and provider sign-in is device-local. Generated preview
links may need fresh renders. Undo history and unfinished queues are device-local.
Close project tabs before external Git updates; automatic conflict reconciliation
for simultaneous timeline edits is not implemented.

## Existing projects

Old `.cmrx-editor/` projects remain in place and continue to open. Their recordings
and source are not automatically moved or converted. Opening a legacy project
uses its owning workspace when present, otherwise the selected/default workspace
for shared assets and skills. Its existing chat is copied once into project-local
`chats/history.json`; the original is preserved. Raw old project folders are not
silently imported into the workspace. New projects always use the visible layout.

The chat header shows the project name and a small **Open folder…** action for
its on-disk project folder. Global Settings stays in the native tab bar.

Video imports preserve supported source dimensions (3840×2160 landscape or 2160×3840 portrait),
keep the selected filename, and retain an untouched project-local original when
conversion is needed. HDR footage receives a technical SDR playback conversion;
the original remains available under `media/originals/`. Import progress reports
encoded duration, and canceled or conflicting imports remove their partial files.

Review notes and revision counters do not invalidate video/graphics render caches.
Visual content belongs in clips and authored source; graphics must not derive their
appearance from review status or revision numbers. Existing cache receipts migrate only when their recorded timeline content and
current authored sources still match; unverifiable receipts refresh normally.

Clip `volume` is a shared linear audio gain (0–16, default 1), applied by the
player and standard Flutter/FFmpeg exports. Stock composition bridges upgrade
without changing default playback; custom authored compositions remain untouched
and must bind ClipAudio volume to the manifest before using gain.

Automatic preview refreshes run only for the active desktop project and yield
to queued edits. Switching tabs cancels a disposable refresh, while explicit
exports and agent work continue. Export video downloads an existing fresh export
directly; changed video content requires a new render.
