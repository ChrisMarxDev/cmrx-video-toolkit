---
name: animation-workshop
description: Generate a disposable Flutter playground for tuning a few widgets' animation timing and curves, then copy parameter settings back to the composing agent.
---

# Animation workshop

Build a tiny task-specific playground from the bundled [shell](assets/shell/).
The user experiments and copies JSON back into chat; apply those settings to the
video afterward. This skill carries its own shell. No toolkit service, MCP server,
component registry or Fluvie dependency is needed for the starter.

## Prepare a session

Copy `assets/shell/` to a new temporary or ignored project-local directory. Never
edit the installed skill's assets for a user session. Use the project's compatible
Flutter SDK; the agent handles commands and returns the local URL to the user.
Inside the copy:

```sh
flutter create --platforms=web --project-name animation_workshop .
flutter pub get
flutter analyze
flutter test
flutter run -d web-server --web-hostname 127.0.0.1 --web-port 8093
```

`flutter create` supplies platform scaffolding and preserves existing source files.
Remove only the generated `test/widget_test.dart` counter-app test if it exists;
it references the generated MyApp rather than this shell. Retain workshop tests.
Select another port if occupied. The web-server device does not open a browser.
Follow the host's permission rules before browser automation. Stop the owned
Flutter process when the session is finished. Refresh loses adjustments: copy
settings first. No autosave or automatic source editing is provided.

## Adapt only what this animation needs

Start in [lib/main.dart](assets/shell/lib/main.dart). Import the actual widgets
and their project dependencies/assets; preserve their styling and design dimensions.
The synthetic card is a runnable example, not a substitute for the requested widget.

- `target` and `source`: stable target name and actual source path for the agent.
- `canvas`: design dimensions, independent of the fitted preview's display size.
- `seconds`, `fps`: local preview duration and intended output frame rate.
- `outputStartSeconds`: where local time zero maps into the edited video.
- `tracks`: only relevant scalar properties, each with a unique semantic `id`,
  explicit `unit`, editable value bounds, start/duration and cubic curve.
- `builder(context, seconds, values)`: compose one or a few real widgets using the
  sampled property values. Each track may have its own timing/curve.

The provided controls cover start, duration, from/to, presets, cubic handles and
numeric curve inputs. Numeric edits commit with Enter. Playback includes scrub,
frame step, full-session loop and 0.25×/0.5×/1× speeds. Reset restores the selected
track's initial values. Add a task-specific control in the copy only if needed;
do not turn this into a general animation editor.

The scalar evaluator is `MotionTrack.valueAt(seconds)` in
[lib/workshop.dart](assets/shell/lib/workshop.dart). Values hold `from` before
start and `to` after completion. Curves use Flutter `Cubic(x1,y1,x2,y2)`; this
starter bounds handles to 0–1 (no overshoot/spring editing). The builder must
explicitly apply values: do not put a second wall-clock AnimationController or
implicit animation inside the target. For progress-driven widgets, expose a
0–1 progress track and pass its value to the widget. For a short Fluvie scene,
write an explicit frame/progress adapter using that project's installed APIs;
this shell cannot discover scene animations or play video/audio automatically.
Native-only widgets need a compatible native runner, not a fake web substitute.

## Hand parameters back

**Copy settings** opens selectable JSON with a **Copy JSON** button; selectable
text remains available if clipboard access fails. Output includes schema version,
target/source, local-time origin and output offset, canvas dimensions, FPS,
property units, start/duration, from/to and curves. Playback speed is inspection
only and does not alter exported timing. Several tracks can animate one widget.

Apply the returned values to the named properties in the real composition. Use
`localSeconds = outputFrame / outputFps - outputStartSeconds`, then the same
clamped progress and Flutter Cubic evaluation as the shell. Preserve logical-pixel
units; never copy fitted-screen distances. If the production component uses a
different animation API, adapt explicitly and compare representative frames.
Validate before/start/middle/end poses and the actual composition before claiming
matching output. Copy settings is a parameter handoff, not video approval.

## Shell checks

The bundled tests cover deterministic sampling, independent tracks, live controls,
frame stepping and JSON handoff. Run `flutter analyze`, `flutter test` and
`flutter build web` in the throwaway copy after adapting it. The starter has only
Flutter SDK dependencies; imported widgets may add their own requirements.
