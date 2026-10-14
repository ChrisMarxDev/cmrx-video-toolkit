import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';
import 'video_tokens.dart';
import 'shaders.dart';

enum VideoTheme { light, dark }

/// Package-qualified fonts work without re-registering them in consuming apps.
abstract final class VideoType {
  static const body = TextStyle(
    fontFamily: VideoTokens.fontFamily,
    package: 'video_components',
    fontSize: 24,
    height: 1.3,
    fontWeight: FontWeight.w400,
    color: VideoTokens.ink,
  );
  static const mono = TextStyle(
    fontFamily: VideoTokens.monoFamily,
    package: 'video_components',
    fontSize: 20,
    height: 1.45,
    fontWeight: FontWeight.w400,
    color: VideoTokens.ink,
  );
  static const caption = TextStyle(
    fontFamily: VideoTokens.fontFamily,
    package: 'video_components',
    fontSize: 22,
    height: 1.25,
    fontWeight: FontWeight.w600,
    color: VideoTokens.white,
  );

  /// Explicit preload for Flutter test/Fluvie capture hosts; call before frame zero.
  static Future<void> loadForCapture() async {
    for (final entry in {
      VideoTokens.fontFamily: 'SpaceGrotesk.ttf',
      VideoTokens.monoFamily: 'IBMPlexMono-Regular.ttf',
    }.entries) {
      final loader = FontLoader('packages/video_components/${entry.key}')
        ..addFont(
          rootBundle.load('packages/video_components/assets/fonts/${entry.value}'),
        );
      await loader.load();
    }
  }
}

class VideoStage extends StatelessWidget {
  const VideoStage({
    super.key,
    required this.child,
    this.theme = VideoTheme.light,
  });
  final Widget child;
  final VideoTheme theme;
  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.ltr,
    child: ColoredBox(
      color: theme == VideoTheme.light ? VideoTokens.white : VideoTokens.darkPage,
      child: DefaultTextStyle(
        style: VideoType.body.copyWith(
          color: theme == VideoTheme.light
              ? VideoTokens.ink
              : VideoTokens.darkText,
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
    required this.child,
    this.active = false,
    this.padding = 20,
  });
  final Widget child;
  final bool active;
  final double padding;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(padding),
    decoration: BoxDecoration(
      color: active ? VideoTokens.lime : VideoTokens.lavender,
      border: Border.all(color: VideoTokens.ink, width: 1.5),
    ),
    child: DefaultTextStyle(
      style: VideoType.body,
      child: IconTheme(
        data: const IconThemeData(color: VideoTokens.ink, size: 32),
        child: child,
      ),
    ),
  );
}

class VideoCaption extends StatelessWidget {
  const VideoCaption(this.text, {super.key, this.fontSize = 22});
  final String text;
  final double fontSize;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: VideoTokens.ink,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: VideoType.caption.copyWith(fontSize: fontSize),
      ),
    ),
  );
}

class VideoCode extends StatelessWidget {
  VideoCode({super.key, required List<String> lines, this.focusLine})
    : lines = List.unmodifiable(lines) {
    if (lines.isEmpty ||
        (focusLine != null && (focusLine! < 0 || focusLine! >= lines.length))) {
      throw ArgumentError('Provide code lines and an in-range focusLine');
    }
  }
  final List<String> lines;
  final int? focusLine;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: VideoTokens.ink,
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < lines.length; i++)
            Container(
              color: i == focusLine ? VideoTokens.lime : null,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Text(
                lines[i],
                style: VideoType.mono.copyWith(
                  color: i == focusLine ? VideoTokens.ink : VideoTokens.darkText,
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
    required this.programs,
    this.seconds = 0,
    this.animated = false,
    this.strong = false,
    this.lavenderLime = false,
    this.outputScale = 1,
  });
  final DitherPrograms programs;
  final double seconds, outputScale;
  final bool animated, strong, lavenderLime;
  @override
  Widget build(BuildContext context) => DitherField(
    programs: programs,
    time: 2.4 + (animated ? seconds * VideoTokens.ditherSpeed : 0),
    style: DitherStyle(
      background: lavenderLime
          ? VideoTokens.lavender
          : (strong ? VideoTokens.ink : VideoTokens.white),
      foreground: lavenderLime ? VideoTokens.lime : VideoTokens.lavender,
      pixelSize: VideoTokens.ditherPixelSize,
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
    required this.programs,
    required this.seconds,
    required this.child,
    this.speed = .04,
    this.lavenderLime = false,
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
  final DitherPrograms programs;
  final double seconds, speed, outputScale, pixelSize;
  final Widget child;
  final bool lavenderLime;
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
              background: lavenderLime ? VideoTokens.lavender : VideoTokens.white,
              foreground: lavenderLime ? VideoTokens.lime : VideoTokens.lavender,
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
  VideoLayers({super.key, this.expansion = 0, this.activeLayer = 1}) {
    if (!expansion.isFinite ||
        expansion < 0 ||
        expansion > 1 ||
        activeLayer < 0 ||
        activeLayer > 2) {
      throw ArgumentError('expansion 0..1; activeLayer 0..2');
    }
  }
  final double expansion;
  final int activeLayer;
  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _Layers(expansion, activeLayer),
    child: const SizedBox.expand(),
  );
}

class _Layers extends CustomPainter {
  const _Layers(this.expansion, this.active);
  final double expansion;
  final int active;
  @override
  void paint(Canvas canvas, Size size) {
    final scale = math.min(size.width / 400, size.height / 360);
    canvas.save();
    canvas.translate(size.width / 2, size.height / 2 + 52 * scale);
    canvas.scale(scale);
    final line = Paint()
      ..color = VideoTokens.ink
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
        Paint()..color = i == active ? VideoTokens.lime : VideoTokens.white,
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
      old.expansion != expansion || old.active != active;
}
