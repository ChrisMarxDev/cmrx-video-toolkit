import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';

enum CameraFrameShape { rectangle, circle }

/// An alpha mask for Flutter-painted camera/image content. Preload before capture.
/// This crops a frame; it does not segment the person from their background.
class CameraFrame extends StatefulWidget {
  CameraFrame({
    super.key,
    required this.program,
    required this.child,
    this.shape = CameraFrameShape.rectangle,
    this.feather = .18,
    this.dither = 1,
    this.pixelSize = 1,
    this.outputScale = 1,
  }) {
    if (!feather.isFinite ||
        feather <= 0 ||
        feather > .5 ||
        !dither.isFinite ||
        dither < 0 ||
        dither > 1 ||
        !pixelSize.isFinite ||
        pixelSize <= 0 ||
        !outputScale.isFinite ||
        outputScale <= 0) {
      throw ArgumentError(
        'Use feather in (0, .5], dither in [0, 1], and positive finite pixel sizes/scales.',
      );
    }
  }

  static const shaderAsset =
      'packages/video_components/shaders/camera_frame.frag';
  static Future<ui.FragmentProgram> loadProgram() =>
      ui.FragmentProgram.fromAsset(shaderAsset);
  final ui.FragmentProgram program;
  final Widget child;
  final CameraFrameShape shape;

  /// Feather width as a fraction of the shortest side, measured inward.
  final double feather;

  /// 0 = smooth alpha, 1 = fixed Bayer coverage. The center is always unmodified.
  final double dither;

  /// Final output pixels per dither cell and per local canvas unit.
  final double pixelSize, outputScale;

  @override
  State<CameraFrame> createState() => _CameraFrameState();
}

class _CameraFrameState extends State<CameraFrame> {
  late ui.FragmentShader shader;
  @override
  void initState() {
    super.initState();
    shader = widget.program.fragmentShader();
  }

  @override
  void didUpdateWidget(CameraFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.program != oldWidget.program) {
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
  Widget build(BuildContext context) => ClipRect(
    child: ShaderMask(
      blendMode: BlendMode.dstIn,
      shaderCallback: (bounds) {
        shader
          ..setFloat(0, bounds.width)
          ..setFloat(1, bounds.height)
          ..setFloat(2, widget.shape.index.toDouble())
          ..setFloat(3, widget.feather)
          ..setFloat(4, widget.dither)
          ..setFloat(5, widget.pixelSize / widget.outputScale);
        return shader;
      },
      child: widget.child,
    ),
  );
}
