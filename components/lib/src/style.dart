import 'package:flutter/widgets.dart';

/// Caller-owned tokens shared by every styled video widget.
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
    this.borderWidth = 1.5,
    this.radius = 0,
    this.spacing = 20,
    Color? muted,
    Color? rule,
    Color? darkMuted,
  }) : _muted = muted,
       _rule = rule,
       _darkMuted = darkMuted,
       assert(borderWidth >= 0 && borderWidth < double.infinity),
       assert(radius >= 0 && radius < double.infinity),
       assert(spacing >= 0 && spacing < double.infinity);
  final Color background,
      foreground,
      surface,
      accent,
      darkBackground,
      darkForeground;
  final TextStyle body, mono, caption;
  final Color? _muted, _rule, _darkMuted;
  Color get muted => _muted ?? foreground.withValues(alpha: .65);
  Color get rule => _rule ?? foreground.withValues(alpha: .25);
  Color get darkMuted => _darkMuted ?? darkForeground.withValues(alpha: .65);
  final double borderWidth, radius, spacing;
  VideoStyle copyWith({
    Color? background,
    Color? foreground,
    Color? surface,
    Color? accent,
    Color? darkBackground,
    Color? darkForeground,
    TextStyle? body,
    TextStyle? mono,
    TextStyle? caption,
    double? borderWidth,
    double? radius,
    double? spacing,
    Color? muted,
    Color? rule,
    Color? darkMuted,
  }) => VideoStyle(
    background: background ?? this.background,
    foreground: foreground ?? this.foreground,
    surface: surface ?? this.surface,
    accent: accent ?? this.accent,
    darkBackground: darkBackground ?? this.darkBackground,
    darkForeground: darkForeground ?? this.darkForeground,
    body: body ?? this.body,
    mono: mono ?? this.mono,
    caption: caption ?? this.caption,
    borderWidth: borderWidth ?? this.borderWidth,
    radius: radius ?? this.radius,
    spacing: spacing ?? this.spacing,
    muted: muted ?? _muted,
    rule: rule ?? _rule,
    darkMuted: darkMuted ?? _darkMuted,
  );
}

/// Nearest parent wins; explicit widget styles override the inherited style.
/// No hidden brand defaults: standalone public widgets need a style or scope.
class VideoThemeScope extends InheritedWidget {
  const VideoThemeScope({super.key, required this.style, required super.child});
  final VideoStyle style;
  static VideoStyle? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<VideoThemeScope>()?.style;
  static VideoStyle of(BuildContext context) =>
      maybeOf(context) ??
      (throw FlutterError(
        'No VideoThemeScope found. Wrap the composition in '
        'VideoThemeScope(style: yourStyle, child: ...) or pass style explicitly.',
      ));
  static VideoStyle resolve(BuildContext context, VideoStyle? explicit) =>
      explicit ?? of(context);
  @override
  bool updateShouldNotify(VideoThemeScope oldWidget) =>
      style != oldWidget.style;
}
