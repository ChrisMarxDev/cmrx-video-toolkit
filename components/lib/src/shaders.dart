import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';

/// Preload programs before frame zero; widgets below never load during capture.
abstract final class VideoShaderAssets {
  static const ditherField =
      'packages/video_components/shaders/dither_field.frag';
  static const ditherImage =
      'packages/video_components/shaders/dither_image.frag';
  static const sculpture = 'packages/video_components/shaders/sculpture.frag';
}

class DitherPrograms {
  const DitherPrograms({required this.field, required this.image});
  final ui.FragmentProgram field, image;
  static Future<DitherPrograms> load() async {
    final programs = await Future.wait([
      ui.FragmentProgram.fromAsset(VideoShaderAssets.ditherField),
      ui.FragmentProgram.fromAsset(VideoShaderAssets.ditherImage),
    ]);
    return DitherPrograms(field: programs[0], image: programs[1]);
  }
}

/// Generic synchronous shader canvas: resolution occupies float slots 0–1,
/// followed by [uniforms]. Caller owns any sampler image's lifetime.
class ShaderSurface extends StatefulWidget {
  ShaderSurface({
    super.key,
    required this.program,
    List<double> uniforms = const [],
    this.image,
  }) : uniforms = List.unmodifiable(uniforms) {
    if (uniforms.any((v) => !v.isFinite))
      throw ArgumentError('Uniforms must be finite');
  }
  final ui.FragmentProgram program;
  final List<double> uniforms;
  final ui.Image? image;
  @override
  State<ShaderSurface> createState() => _ShaderSurfaceState();
}

class _ShaderSurfaceState extends State<ShaderSurface> {
  late ui.FragmentShader shader;
  @override
  void initState() {
    super.initState();
    shader = widget.program.fragmentShader();
  }

  @override
  void didUpdateWidget(ShaderSurface oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.program != widget.program) {
      shader.dispose();
      shader = widget.program.fragmentShader();
    }
  }

  @override
  void dispose() {
    shader.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      if (!constraints.hasBoundedWidth || !constraints.hasBoundedHeight) {
        throw FlutterError('ShaderSurface requires bounded width and height');
      }
      return CustomPaint(
        size: constraints.biggest,
        painter: _ShaderPainter(shader, widget.uniforms, widget.image),
      );
    },
  );
}

class _ShaderPainter extends CustomPainter {
  const _ShaderPainter(this.shader, this.uniforms, this.image);
  final ui.FragmentShader shader;
  final List<double> uniforms;
  final ui.Image? image;
  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    shader.setFloat(0, size.width);
    shader.setFloat(1, size.height);
    for (var i = 0; i < uniforms.length; i++) {
      shader.setFloat(i + 2, uniforms[i]);
    }
    if (image != null) shader.setImageSampler(0, image!);
    canvas.drawRect(Offset.zero & size, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_ShaderPainter old) => true;
}

enum DitherPattern { bayer2, bayer4, bayer8 }

enum DitherShape { wave, sphere, ripple }

/// Two-color settings. pixelSize is measured in final output pixels;
/// outputScale is output pixels per local canvas unit (including parent scaling).
class DitherStyle {
  DitherStyle({
    this.pixelSize = 1,
    this.outputScale = 1,
    this.pattern = DitherPattern.bayer4,
    this.background = const Color(0xFF000000),
    this.foreground = const Color(0xFFFFFFFF),
    this.contrast = 1,
    this.bias = 0,
  }) {
    if (!pixelSize.isFinite ||
        pixelSize <= 0 ||
        !outputScale.isFinite ||
        outputScale <= 0 ||
        !contrast.isFinite ||
        contrast < 0 ||
        !bias.isFinite ||
        bias < -1 ||
        bias > 1) {
      throw ArgumentError('Invalid dither size, scale, contrast or bias');
    }
  }
  final double pixelSize, outputScale, contrast, bias;
  final DitherPattern pattern;
  final Color background, foreground;
  double get localPixelSize => pixelSize / outputScale;
  List<double> get palette => [
    background.r,
    background.g,
    background.b,
    background.a,
    foreground.r,
    foreground.g,
    foreground.b,
    foreground.a,
  ];
}

/// Procedural ordered dither. Pass edited-output time explicitly; no ticker.
class DitherField extends StatelessWidget {
  DitherField({
    super.key,
    required this.programs,
    required this.time,
    this.shape = DitherShape.wave,
    DitherStyle? style,
  }) : style = style ?? DitherStyle() {
    if (!time.isFinite) throw ArgumentError.value(time, 'time');
  }
  final DitherPrograms programs;
  final double time;
  final DitherShape shape;
  final DitherStyle style;
  @override
  Widget build(BuildContext context) => ShaderSurface(
    program: programs.field,
    uniforms: [
      time,
      style.localPixelSize,
      (style.pattern.index + 1).toDouble(),
      shape.index.toDouble(),
      style.contrast,
      style.bias,
      ...style.palette,
    ],
  );
}

/// Dither only an explicitly supplied image, not the entire widget tree.
/// Source transparency and contain/cover fitting are preserved. Caller owns image.
class DitherImage extends StatelessWidget {
  DitherImage({
    super.key,
    required this.programs,
    required this.image,
    this.fit = BoxFit.contain,
    this.alignment = Alignment.center,
    this.inverted = false,
    DitherStyle? style,
  }) : style = style ?? DitherStyle();
  final DitherPrograms programs;
  final ui.Image image;
  final BoxFit fit;
  final Alignment alignment;
  final bool inverted;
  final DitherStyle style;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      if (!c.hasBoundedWidth || !c.hasBoundedHeight)
        throw FlutterError('DitherImage requires bounded width and height');
      if (c.biggest.isEmpty) return const SizedBox.shrink();
      final input = Size(image.width.toDouble(), image.height.toDouble());
      final fitted = applyBoxFit(fit, input, c.biggest);
      final src = alignment.inscribe(fitted.source, Offset.zero & input);
      final dst = alignment.inscribe(
        fitted.destination,
        Offset.zero & c.biggest,
      );
      return ShaderSurface(
        program: programs.image,
        image: image,
        uniforms: [
          style.localPixelSize,
          (style.pattern.index + 1).toDouble(),
          style.contrast,
          style.bias,
          inverted ? 1 : 0,
          ...style.palette,
          src.left / input.width,
          src.top / input.height,
          src.width / input.width,
          src.height / input.height,
          dst.left,
          dst.top,
          dst.width,
          dst.height,
        ],
      );
    },
  );
}
