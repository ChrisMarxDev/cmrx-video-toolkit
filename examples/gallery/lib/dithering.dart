// ignore_for_file: experimental_member_use
import 'dart:ui' as ui;
import 'package:flutter/widgets.dart' hide Animation, Clip, Image, Tween;
import 'package:fluvie/fluvie.dart';
import 'package:video_components/video_components.dart';

late DitherPrograms programs;
late ui.Image illustration;
Future<void> prepareDithering({ui.Image? source}) async {
  programs = await DitherPrograms.load();
  if (source != null) {
    illustration = source;
    return;
  }
  final recorder = ui.PictureRecorder();
  final c = Canvas(recorder);
  c.drawColor(const Color(0xFFFFFFFF), BlendMode.src);
  // Original geometric luminance fixture; no external image asset needed.
  c.drawCircle(
    const Offset(160, 160),
    130,
    Paint()..color = const Color(0xFFBBBBBB),
  );
  c.drawRect(
    const Rect.fromLTWH(72, 86, 120, 152),
    Paint()..color = const Color(0xFF444444),
  );
  final face = Path()
    ..moveTo(192, 86)
    ..lineTo(255, 48)
    ..lineTo(255, 200)
    ..lineTo(192, 238)
    ..close();
  c.drawPath(face, Paint()..color = const Color(0xFF888888));
  final top = Path()
    ..moveTo(72, 86)
    ..lineTo(135, 48)
    ..lineTo(255, 48)
    ..lineTo(192, 86)
    ..close();
  c.drawPath(top, Paint()..color = const Color(0xFFDDDDDD));
  final picture = recorder.endRecording();
  illustration = await picture.toImage(320, 320);
  picture.dispose();
}

Widget ditherGallery(double t) {
  Widget frame(Widget child) => Expanded(
    child: Padding(padding: const EdgeInsets.all(8), child: child),
  );
  return ColoredBox(
    color: const Color(0xFFE7EDF2),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Expanded(
            child: Row(
              textDirection: TextDirection.ltr,
              children: [
                frame(
                  DitherField(
                    programs: programs,
                    time: t,
                    style: DitherStyle(pixelSize: 2),
                  ),
                ),
                frame(
                  DitherField(
                    programs: programs,
                    time: t,
                    shape: DitherShape.sphere,
                    style: DitherStyle(
                      pixelSize: 1,
                      pattern: DitherPattern.bayer8,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Row(
              textDirection: TextDirection.ltr,
              children: [
                frame(
                  DitherImage(
                    programs: programs,
                    image: illustration,
                    style: DitherStyle(
                      pixelSize: 1,
                      background: const Color(0xFF122D4D),
                      foreground: const Color(0xFFFFFFFF),
                    ),
                  ),
                ),
                frame(
                  DitherField(
                    programs: programs,
                    time: t,
                    shape: DitherShape.ripple,
                    style: DitherStyle(
                      pixelSize: 2,
                      pattern: DitherPattern.bayer2,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

Video build() => Video(
  size: const VideoSize(640, 640),
  fps: 30,
  scenes: [
    Scene(
      duration: 4.seconds,
      children: [
        FrameBuilder((frame) => ditherGallery(frame.frame / frame.fps)),
      ],
    ),
  ],
);
Video buildDraft() => build();
