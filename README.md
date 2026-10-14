# CMRX Video Toolkit

Open tools and agent skills for programmable video. A local-first toolkit, not a
hosted service or autonomous editor. Bring your own recordings and editorial review.

- `apps/editor/`: Flutter macOS transcript editor, cuts, notes and export handoff.
- `tools/component_browser/`: actual Flutter components, props, variants and motion scrubber.
- `tools/dither/`: local image/field dithering and PNG export.
- `components/`: unstyled Flutter building blocks, shaders and media helpers; callers supply appearance.
- `scripts/`, `video_tools/`, `schemas/`: edit timelines, soundmaps, rendering/QA and media operations.
- `.skills/`: agent workflows. Your brand and creative choices belong in your workspace.
- `examples/`: synthetic fixtures; never product facts or real client footage.

## Start

Use Python 3, FFmpeg/ffprobe, Flutter (tested 3.47.2/Dart 3.13.2), and the pinned
Flutter dependencies. Install Whisper separately for transcription; no model is
bundled. `python3 scripts/doctor.py` reports prerequisites. From this repo:

```sh
make test
make components
# Editor: cd apps/editor && bash tool/open.sh /absolute/recording.mp4
```

The browser serves localhost:8090. It is a component workbench, not a compositor.
See each app README for limitations. Native Scene GPU capture uses a separate
macOS path; headless Fluvie GPU integration is not assumed.

## Studio integration

Pin a release or Git commit as a submodule. The toolkit is independent of the studio
and must build from a fresh clone. Keep recordings/transcripts/renders outside Git.
Set CMRX_WORKSPACE to your private project root when invoking scripts/video.py.
Optional CMRX_COMPONENT_PACKAGE, CMRX_COMPONENT_NAME and CMRX_TOKEN_CLASS select a
private Flutter design package for generated baseline compositions. See .skills/.

## License

Repository-authored software is MIT licensed. Third-party dependencies retain
their own licenses. No brand fonts are bundled. See THIRD_PARTY.md.
No client assets, private recordings, internal knowledge or private Git history are
included. This is an early toolkit: review the output and keep originals immutable.

Component styling and migration from `design_system/` are documented in
[components/CATALOG.md](components/CATALOG.md). Brand palettes, typography, fonts
and editorial presets belong in consuming workspaces, not this toolkit.
