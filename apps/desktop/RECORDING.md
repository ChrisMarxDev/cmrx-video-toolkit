# Screen, camera and microphone recording

Open a project, then choose **Record screen or camera…** from the timeline's
right-click / More menu. Add to timeline continues to open the ordinary file picker.

A compact popup lets you choose screen/window capture, a camera and an optional
microphone. Start opens the OS screen picker (or thumbnail chooser), then shrinks
the popup to a timer and Stop button. Stop saves the take and closes the popup
automatically; no completion screen needs dismissing. Camera and microphone can
also be used without a screen. Camera selection has a local setup preview. Start
recording, then Stop & save. If registered by the OS, Ctrl/⌘+Shift+F9 stops capture;
the recorder always retains its Stop button; hover it for the shortcut. Ending screen sharing stops and saves
the other tracks too. Closing the recorder during capture requests Stop & save.

There is no system-audio capture, baked camera overlay or automatic timeline edit.
The recorder is a compact capture popup; the editor retains one player.
Recording controls are available independently of the chat provider connection.

## Project files

Completed sessions appear in Assets → Project → recordings. Each session is one
portable asset bundle; attaching it to chat gives the agent the source instructions.

```text
project/
  assets/recordings/recording-<time>-<id>/
    screen.webm           # if selected
    camera.webm           # if selected
    microphone.weba      # if selected, Opus/WebM audio
    manifest.json        # source types, durations, approximate start offsets
    assetconfig.yaml     # static playable preview and asset description
    INSTRUCTIONS.md      # agent editing/synchronization handoff
```

These are independent uncomposited sources. Video is captured with a target of
30 fps, camera resolution is negotiated with the device, and encoded samples are
remuxed without rescaling or re-encoding for seekable playback. Capture is not a
lossless video codec. Start offsets use the same renderer monotonic clock; they
are approximate, so check speech/lip sync when composing a showcase.

Choose the screen/camera WebM with Add to timeline, or attach the bundle and ask
the agent to cut, arrange or composite its separate tracks. Originals stay separate.

## Interruption and ownership

One recorder owns one fixed project, even if the user changes project tabs. It
writes bounded chunks through trusted recorder-only IPC into
`.editor/recordings/<session>/`. Completed files are probed and the whole bundle is
published to assets only after every selected source is playable. Publishing does
not alter project.json, timeline clips, comments, or undo history.

Failed writes, encoding failures and interrupted processes retain partial files
and a manifest in staging. Reopening Record detects abandoned sessions and offers
Open interrupted recording files. These are recovery inputs, not completed assets;
a fresh recording does not delete them. The agent can attempt an FFmpeg remux of
retained `.partial` sources. An unfinished encoder session cannot be resumed.
Saving failures allow retry. App quit requests stop/save before closing services;
a forced process/OS termination may leave recoverable partial media.

## Platform requirements and acceptance

- **macOS:** Screen Recording permission. Camera and microphone require the signed
  app's `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` Info.plist keys
  and OS consent. Required metadata must be added before signing/notarization. The
  recorder fails clearly if a Mac build omits it. On supported systems Electron's
  system picker is used; older systems fall back to source selection.
- **Linux:** Wayland capture uses PipeWire and the ScreenCast desktop portal/backend
  supplied by the desktop environment. Debian packaging declares PipeWire and the
  base portal; the desktop must provide its matching ScreenCast backend. X11 uses
  the source chooser. Global shortcut availability depends on the desktop.
- Capture permissions are granted only to the dedicated local recorder renderer;
  generated project tools and chat content cannot call recorder IPC.

Verified on Linux: real Electron renderer → MediaRecorder → chunk IPC → disk →
FFmpeg remux/probe → independent playable assets, with synthetic video/audio devices.
Decoded source colors verify screen and selected camera were kept separate. Tests
cover invalid tracks, interrupted data, symlink boundaries, entry authentication,
source-ended and native-window-close stopping, asset discovery and unchanged timeline.

**Still required:** actual camera/microphone hardware, Wayland portal/X11 selection,
macOS native permissions/capture, and signed/installed-app acceptance on both systems.
Synthetic streams verify encoding/storage; they do not prove OS capture compatibility.

```sh
make recording-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright EDITOR_ELECTRON=/path/to/electron
node --test tests/recording.test.mjs
```
