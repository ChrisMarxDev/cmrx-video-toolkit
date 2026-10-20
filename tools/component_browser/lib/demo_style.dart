import 'package:flutter/widgets.dart';
import 'package:video_components/video_components.dart';

// Example application styling, never exported by the component library.
abstract final class DemoPalette {
  static const white = Color(0xFFFFFFFF);
  static const ink = Color(0xFF30283F);
  static const surface = Color(0xFFEDE8F5);
  static const accent = Color(0xFF7655AB);
  static const mist = Color(0xFFF8F6FC);
  static const muted = Color(0xFF756B83);
  static const rule = Color(0xFFDDD6E8);
}

abstract final class DemoType {
  static const body = TextStyle(fontSize: 24, color: DemoPalette.ink);
  static const mono = TextStyle(
    fontFamily: 'monospace',
    fontSize: 20,
    color: DemoPalette.ink,
  );
  static const caption = TextStyle(fontSize: 22, color: DemoPalette.white);
}

const demoStyle = VideoStyle(
  background: DemoPalette.white,
  foreground: DemoPalette.ink,
  surface: DemoPalette.surface,
  accent: DemoPalette.accent,
  darkBackground: DemoPalette.ink,
  darkForeground: DemoPalette.white,
  body: DemoType.body,
  mono: DemoType.mono,
  caption: DemoType.caption,
  radius: 6,
  borderWidth: 1,
  muted: DemoPalette.muted,
  rule: DemoPalette.rule,
);
