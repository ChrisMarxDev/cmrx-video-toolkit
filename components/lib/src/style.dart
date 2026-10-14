import 'package:flutter/widgets.dart';

/// Caller-owned appearance. The toolkit supplies no palette or typography.
@immutable
class VideoStyle {
  const VideoStyle({
    required this.background,
    required this.foreground,
    required this.surface,
    required this.accent,
    required this.darkBackground,
    required this.darkForeground,
    required this.body,
    required this.mono,
    required this.caption,
  });
  final Color background,
      foreground,
      surface,
      accent,
      darkBackground,
      darkForeground;
  final TextStyle body, mono, caption;
}
