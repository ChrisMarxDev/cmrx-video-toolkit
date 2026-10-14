import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'style.dart';
import 'shaders.dart';

enum VideoTheme { light, dark }

class VideoStage extends StatelessWidget {
  const VideoStage({
    super.key,
    required this.style,
    required this.child,
    this.theme = VideoTheme.light,
  });
  final VideoStyle style;
  final Widget child;
  final VideoTheme theme;
  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.ltr,
    child: ColoredBox(
      color: theme == VideoTheme.light
          ? style.background
          : style.darkBackground,
      child: DefaultTextStyle(
        style: style.body.copyWith(
          color: theme == VideoTheme.light
              ? style.foreground
              : style.darkForeground,
        ),
        child: child,
      ),
    ),
  );
}

/// Square explanatory element. No automatic heading, logo, timer or shadow.
class VideoBlock extends StatelessWidget {
  const VideoBlock({
    super.key,
    required this.style,
    required this.child,
    this.active = false,
    this.padding = 20,
  });
  final VideoStyle style;
  final Widget child;
  final bool active;
  final double padding;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(padding),
    decoration: BoxDecoration(
      color: active ? style.accent : style.surface,
      border: Border.all(color: style.foreground, width: 1.5),
    ),
    child: DefaultTextStyle(
      style: style.body,
      child: IconTheme(
        data: IconThemeData(color: style.foreground, size: 32),
        child: child,
      ),
    ),
  );
}

class VideoCaption extends StatelessWidget {
  const VideoCaption(
    this.text, {
    super.key,
    required this.style,
    this.fontSize,
  });
  final VideoStyle style;
  final String text;
  final double? fontSize;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: style.foreground,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: style.caption.copyWith(fontSize: fontSize),
      ),
    ),
  );
}

class VideoCode extends StatelessWidget {
  VideoCode({
    super.key,
    required this.style,
    required List<String> lines,
    this.focusLine,
  }) : lines = List.unmodifiable(lines) {
    if (lines.isEmpty ||
        (focusLine != null && (focusLine! < 0 || focusLine! >= lines.length))) {
      throw ArgumentError('Provide code lines and an in-range focusLine');
    }
  }
  final VideoStyle style;
  final List<String> lines;
  final int? focusLine;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: style.foreground,
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < lines.length; i++)
            Container(
              color: i == focusLine ? style.accent : null,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Text(
                lines[i],
                style: style.mono.copyWith(
                  color: i == focusLine
                      ? style.foreground
                      : style.darkForeground,
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

/// Bounded optional texture; callers place clean captions/presenter above it.
class VideoTexture extends StatelessWidget {
  const VideoTexture({
    super.key,
    required this.style,
    required this.programs,
    this.seconds = 0,
    this.animated = false,
    this.speed = .16,
    this.pixelSize = 1,
    this.strong = false,
    this.accentPalette = false,
    this.outputScale = 1,
  });
  final VideoStyle style;
  final DitherPrograms programs;
  final double seconds, outputScale, speed, pixelSize;
  final bool animated, strong, accentPalette;
  @override
  Widget build(BuildContext context) => DitherField(
    programs: programs,
    time: 2.4 + (animated ? seconds * speed : 0),
    style: DitherStyle(
      background: accentPalette
          ? style.surface
          : (strong ? style.foreground : style.background),
      foreground: accentPalette ? style.accent : style.surface,
      pixelSize: pixelSize,
      outputScale: outputScale,
      pattern: DitherPattern.bayer4,
    ),
  );
}

/// Full-canvas, gently moving dither behind clean foreground content.
/// Supply continuous edited-output seconds; zero speed freezes the field.
class VideoDitherBackground extends StatelessWidget {
  VideoDitherBackground({
    super.key,
    required this.style,
    required this.programs,
    required this.seconds,
    required this.child,
    this.speed = .04,
    this.accentPalette = false,
    this.outputScale = 1,
    this.pixelSize = 1,
  }) {
    if (!seconds.isFinite ||
        !speed.isFinite ||
        speed < 0 ||
        !outputScale.isFinite ||
        outputScale <= 0 ||
        !pixelSize.isFinite ||
        pixelSize <= 0) {
      throw ArgumentError(
        'Finite time; nonnegative speed; positive scale/cell size',
      );
    }
  }
  final VideoStyle style;
  final DitherPrograms programs;
  final double seconds, speed, outputScale, pixelSize;
  final Widget child;
  final bool accentPalette;
  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    alignment: Alignment.topLeft,
    children: [
      Positioned.fill(
        child: IgnorePointer(
          child: DitherField(
            programs: programs,
            time: 2.4 + seconds * speed,
            style: DitherStyle(
              background: accentPalette ? style.surface : style.background,
              foreground: accentPalette ? style.accent : style.surface,
              pattern: DitherPattern.bayer4,
              pixelSize: pixelSize,
              outputScale: outputScale,
              contrast: .65,
              bias: -.08,
            ),
          ),
        ),
      ),
      child,
    ],
  );
}

/// Technical exploded layers; explicit progress supports reverse seeks.
class VideoLayers extends StatelessWidget {
  VideoLayers({
    super.key,
    required this.style,
    this.expansion = 0,
    this.activeLayer = 1,
  }) {
    if (!expansion.isFinite ||
        expansion < 0 ||
        expansion > 1 ||
        activeLayer < 0 ||
        activeLayer > 2) {
      throw ArgumentError('expansion 0..1; activeLayer 0..2');
    }
  }
  final VideoStyle style;
  final double expansion;
  final int activeLayer;
  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _Layers(expansion, activeLayer, style),
    child: const SizedBox.expand(),
  );
}

class _Layers extends CustomPainter {
  const _Layers(this.expansion, this.active, this.style);
  final VideoStyle style;
  final double expansion;
  final int active;
  @override
  void paint(Canvas canvas, Size size) {
    final scale = math.min(size.width / 400, size.height / 360);
    canvas.save();
    canvas.translate(size.width / 2, size.height / 2 + 52 * scale);
    canvas.scale(scale);
    final line = Paint()
      ..color = style.foreground
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    for (var i = 0; i < 3; i++) {
      final y = -i * (18 + 60 * expansion);
      final path = Path()
        ..moveTo(-148, y)
        ..lineTo(0, y - 74)
        ..lineTo(148, y)
        ..lineTo(0, y + 74)
        ..close();
      canvas.drawPath(
        path,
        Paint()..color = i == active ? style.accent : style.background,
      );
      canvas.drawPath(path, line);
      if (i < 2) {
        canvas.drawLine(
          Offset(-148, y),
          Offset(-148, y - (18 + 60 * expansion)),
          line,
        );
        canvas.drawLine(
          Offset(148, y),
          Offset(148, y - (18 + 60 * expansion)),
          line,
        );
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_Layers old) =>
      old.expansion != expansion || old.active != active || old.style != style;
}
