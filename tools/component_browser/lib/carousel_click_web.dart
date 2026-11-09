import 'dart:convert';
import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'package:video_components/video_components.dart';

web.HTMLAudioElement? _click;

/// Explicit pointer/keyboard selection only: no sound on load or timeline scrubs.
void playCarouselClick() {
  final audio = _click ??= (web.HTMLAudioElement()
    ..src = 'data:audio/wav;base64,${base64Encode(mediaCarouselClickWav())}');
  audio.currentTime = 0;
  audio.play().toDart.catchError((Object _) => null);
}
