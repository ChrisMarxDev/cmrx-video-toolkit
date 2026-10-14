import 'test_style.dart';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'shaders_test.dart' show loadTestPrograms;

void main() {
  testWidgets(
    'Background fills canvas, preserves foreground and seeks deterministically',
    (tester) async {
      final programs = (await tester.runAsync(loadTestPrograms))!;
      final key = GlobalKey();
      Future<List<int>> pixels(double seconds, {double speed = .04}) async {
        await tester.pumpWidget(
          Center(
            child: RepaintBoundary(
              key: key,
              child: SizedBox(
                width: 64,
                height: 64,
                child: VideoDitherBackground(
                  style: demoStyle,
                  programs: programs,
                  seconds: seconds,
                  speed: speed,
                  child: const Center(
                    child: SizedBox(
                      width: 8,
                      height: 8,
                      child: ColoredBox(color: DemoPalette.ink),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
        return (await tester.runAsync(() async {
          final image =
              await (key.currentContext!.findRenderObject()
                      as RenderRepaintBoundary)
                  .toImage();
          final bytes = (await image.toByteData(
            format: ui.ImageByteFormat.rawRgba,
          ))!.buffer.asUint8List().toList();
          image.dispose();
          return bytes;
        }))!;
      }

      final first = await pixels(0);
      final later = await pixels(10);
      expect(later, isNot(orderedEquals(first)));
      expect(await pixels(0), orderedEquals(first));
      expect(await pixels(10, speed: 0), orderedEquals(first));
      for (var y = 0; y < 64; y++)
        for (var x = 0; x < 64; x++) {
          final i = (y * 64 + x) * 4;
          final value = first.sublist(i, i + 4);
          if (x >= 28 && x < 36 && y >= 28 && y < 36) {
            expect(value, [28, 37, 51, 255]);
          } else {
            expect(
              value,
              anyOf(equals([255, 255, 255, 255]), equals([225, 231, 239, 255])),
            );
          }
        }
      expect(
        () => VideoDitherBackground(
          style: demoStyle,
          programs: programs,
          seconds: double.nan,
          child: const SizedBox(),
        ),
        throwsArgumentError,
      );
    },
  );
}
