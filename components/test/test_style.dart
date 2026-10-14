import 'package:flutter/widgets.dart';
import 'package:video_components/video_components.dart';

// Arbitrary test palette, not library defaults.
abstract final class DemoPalette {
  static const white = Color(0xFFFFFFFF);
  static const ink = Color(0xFF1C2533);
  static const surface = Color(0xFFE1E7EF);
  static const accent = Color(0xFFB0B0B0);
  static const mist = Color(0xFFF5F5F5);
  static const muted = Color(0xFF606060);
  static const rule = Color(0xFFD0D0D0);
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
);
