# Folder-based asset library

Open **Assets** beside the project name. Switch between **Library** and **Project**,
open folders, search names/descriptions/tags and filter by type. Choose a card to
inspect its preview and metadata; **Attach to chat** prepares a project copy and
adds a compact attachment. Describe the intended use, then Send. Selection does
not edit the timeline. Sent/queued messages retain project-relative asset references.

Settings → Project → Asset library provides **Choose folder** and **Open folder**.
The initial library is `asset-library/` under the app's agent profile; selecting a
folder switches libraries without moving or deleting the previous folder. The
configured path persists across projects and app launches. An unavailable external
folder appears offline; existing project copies remain available.

## Files and bundles

Ordinary images, videos and audio files need no manifest. Other file formats remain
visible as generic files. Folders without `assetconfig.yaml` are collections.
A folder containing that file is one asset: its implementation files are not
separate cards, including during recursive search. Bundles may contain arbitrary
file formats and source languages. Browsing never launches their implementation.

```text
my-library/
  photos/
    reference.png
  sounds/
    bell.wav
  glowing-ring/
    assetconfig.yaml
    SKILL.md
    preview.mp4
    src/
      ring.frag
      ring.dart
```

```yaml
name: Glowing ring
type: shader
description: Animated halo with configurable colours.
tags: [halo, background, animated]
preview:
  file: preview.mp4
  type: video
instructions: SKILL.md
source: https://example.com/original-source
license: Unknown
```

- `name`, `description` and `tags` support browsing/search; omitted names use the
  folder name. `type` is a free-form label such as shader, chart, image or sound.
- `preview.type` is image, video or audio (`sound` also accepts audio). `preview.file`
  names an existing local file inside the bundle. Preview type and extension must
  match. Supported images: PNG/JPEG/WebP/GIF/BMP/SVG; video: MP4/M4V/MOV/WebM;
  audio: WAV/MP3/OGG/M4A/FLAC/AAC. Actual decoding depends on the desktop browser.
- `instructions` names a local text file, defaulting to `SKILL.md`. Standard skill
  frontmatter and Markdown guidance can describe entrypoints, parameters and
  integration. The agent receives selected instructions, not every library skill.
- `source` and `license` are optional strings. They are retained when copying or
  promoting; absent or unrecognized licensing remains Unknown. The app does not
  infer reuse permission. Keep attribution/license files in the bundle too.

Paths must stay within the asset folder. Scanning skips hidden entries and symlinks;
portable copies accept regular files/directories and reject symlinks/special files.
Copies are bounded to 2 GB and 20,000 entries. Listing/search is bounded to 1,000
results, 10,000 visited entries and 16 folder levels; use folder navigation for
larger collections. No asset IDs, versions, update detection or synchronization.

Missing previews/instructions and malformed YAML remain visible with explanations.
Raster images are lazy thumbnails. Video/audio load only in the selected preview;
they do not autoplay. SVG previews have a restrictive sandbox/CSP. HTML and arbitrary
source are never served as runnable previews. **Generate preview** for an incomplete
bundle prepares an attachment and a chat request; it does not silently execute code
or send the message. Preview creation is a separate agent task.

## Project copies and authoring

Shared assets copy to `assets/library/<folder-or-file>` inside the managed project
workspace. In a normal selected project folder this is under `.cmrx-editor/`.
Existing names receive numeric suffixes; originals are never overwritten.
Project-local assets attach directly. Changes to library files do not update copies.
An unsent attachment is a UI selection; copied files remain in Project assets even
if the window closes before sending.

The agent can use `assets_list`, `asset_read` and `asset_use`, then ordinary
workspace read/write/execution tools to inspect and integrate files. Attached
asset context includes project paths and its SKILL.md instructions. Images can be
inspected with workspace_image; video/audio can be inspected through the worker.
Bundle instructions are usage guidance subject to project/user instructions;
they grant no host execution, secret access or publishing authority. Generated
commands still run through the existing offline worker. Dependencies are assumed
installed; this feature adds no installer or dependency manager.

To create a reusable asset, author a folder under project `assets/` containing its
implementation, config, instructions and a standalone preview. Ask the agent to
save it to the library, or select **Save to library** in the manager. The agent's
`asset_promote` tool is reserved for explicit user requests. Promotion copies files,
including source/license metadata, and never overwrites existing library content.

**Move to trash** removes a library item using the operating system trash in the
native app. Headless service tests use an app-profile `asset-trash/` fallback.
Project copies survive library deletion. Project items expose promotion rather
than a destructive delete button.

## Verification

Run `make desktop-check` from the toolkit root. Optional browser acceptance is
`make -C apps/desktop agent-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright`.
