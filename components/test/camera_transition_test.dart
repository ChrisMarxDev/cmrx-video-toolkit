import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'shaders_test.dart' show pixels;

int alpha(Uint8List data, int x, int y, [int width = 100]) =>
    data[(y * width + x) * 4 + 3];
void main() {
  testWidgets(
    'coarse camera feather uses whole cells at explicit output scales',
    (tester) async {
      final program = (await tester.runAsync(
        () => ui.FragmentProgram.fromAsset('shaders/camera_frame.frag'),
      ))!;
      for (final scale in [1.0, .5]) {
        final data = await pixels(
          tester,
          CameraFrame(
            program: program,
            shape: CameraFrameShape.circle,
            feather: .25,
            outputScale: scale,
            child: const ColoredBox(color: Color(0xFF4488CC)),
          ),
          width: 128,
          height: 128,
        );
        final cell = (8 / scale).round();
        final coverage = <int>{};
        for (var y = 0; y < 128; y += cell) {
          for (var x = 0; x < 128; x += cell) {
            final a = alpha(data, x, y, 128);
            coverage.add(a);
            for (var dy = 0; dy < cell; dy++) {
              for (var dx = 0; dx < cell; dx++) {
                expect(
                  alpha(data, x + dx, y + dy, 128),
                  a,
                  reason: 'The feather must not slice a square dither cell',
                );
              }
            }
          }
        }
        expect(coverage, {0, 255});
        expect(alpha(data, 64, 64, 128), 255);
        expect(data.sublist((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4), [
          68,
          136,
          204,
          255,
        ]);
      }
    },
  );

  testWidgets(
    'camera mask protects center, fades edge and preserves transparency',
    (tester) async {
      final program = (await tester.runAsync(
        () => ui.FragmentProgram.fromAsset('shaders/camera_frame.frag'),
      ))!;
      for (final shape in CameraFrameShape.values) {
        final smooth = await pixels(
          tester,
          CameraFrame(
            program: program,
            shape: shape,
            feather: .2,
            dither: 0,
            child: const ColoredBox(color: Color(0xFF4488CC)),
          ),
          width: 100,
          height: 100,
        );
        expect(alpha(smooth, 50, 50), 255);
        expect(smooth[(50 * 100 + 50) * 4], 68);
        expect(alpha(smooth, 1, 50), lessThan(10));
        expect(alpha(smooth, 10, 50), inInclusiveRange(110, 150));
        expect(alpha(smooth, 25, 50), 255);
        if (shape == CameraFrameShape.circle) expect(alpha(smooth, 5, 5), 0);
        final dithered = await pixels(
          tester,
          CameraFrame(
            program: program,
            shape: shape,
            feather: .2,
            dither: 1,
            child: const ColoredBox(color: Color(0xFF4488CC)),
          ),
          width: 100,
          height: 100,
        );
        final edge = [for (var y = 40; y < 60; y++) alpha(dithered, 10, y)];
        expect(edge.toSet(), {0, 255});
        expect(alpha(dithered, 50, 50), 255);
        final repeated = await pixels(
          tester,
          CameraFrame(
            program: program,
            shape: shape,
            feather: .2,
            dither: 1,
            child: const ColoredBox(color: Color(0xFF4488CC)),
          ),
          width: 100,
          height: 100,
        );
        expect(repeated, dithered);
      }
      final transparent = await pixels(
        tester,
        CameraFrame(
          program: program,
          child: const ColoredBox(color: Color(0x804488CC)),
        ),
        width: 100,
        height: 100,
      );
      expect(alpha(transparent, 50, 50), 128);
      expect(
        () => CameraFrame(
          program: program,
          feather: double.nan,
          child: const SizedBox(),
        ),
        throwsArgumentError,
      );
      expect(
        () => CameraFrame(
          program: program,
          pixelSize: 0,
          child: const SizedBox(),
        ),
        throwsArgumentError,
      );
    },
  );

  testWidgets(
    'chapter wipe is empty at endpoints, fully covers cut and seeks continuously',
    (tester) async {
      for (final direction in WipeDirection.values) {
        for (final count in [1, 8]) {
          Future<Uint8List> frame(double p) => pixels(
            tester,
            ChapterWipe(
              progress: p,
              count: count,
              direction: direction,
              color: const Color(0xFF24143D),
            ),
            width: 100,
            height: 100,
          );
          for (final p in [0.0, 1.0]) {
            final data = await frame(p);
            expect(
              [
                for (var i = 3; i < data.length; i += 4) data[i],
              ].every((a) => a == 0),
              isTrue,
            );
          }
          for (final p in [.45, .5, .55]) {
            final data = await frame(p);
            expect(
              [
                for (var i = 3; i < data.length; i += 4) data[i],
              ].every((a) => a == 255),
              isTrue,
            );
          }
          final before = await frame(.2);
          final after = await frame(.201);
          expect(
            before,
            isNot(equals(after)),
            reason: 'Fractional progress must not be rounded',
          );
          await frame(.8);
          expect(await frame(.2), before);
        }
      }
    },
  );
}
