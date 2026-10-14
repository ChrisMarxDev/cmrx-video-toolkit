# Compose

Run `video.py compose projects/<slug>` to create a baseline. Then the agent authors animations using storyboard/scenes.json and design_system/CATALOG.md. Run flutter pub get in composition. Keep Clip.asset as the audio source beneath graphics. Use FrameBuilder ctx.frame / ctx.fps for output seconds in the one-scene baseline; use cueProgress for each annotation window.

Run `video.py preview projects/<slug>`. The composition is code plus media and a pubspec, not a self-contained Dart executable. Existing main.dart is protected from accidental regeneration. See examples/gallery for a complete animated composition.

Commands run from the toolkit root; `video.py` means `python3 scripts/video.py`.
