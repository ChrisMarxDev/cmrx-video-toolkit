import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/src/expanded/support.dart';

void main() {
  testWidgets('Text entrance preserves fractional vertical movement', (
    tester,
  ) async {
    final key = GlobalKey();
    Future<double> centroid(double progress) async {
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: RepaintBoundary(
              key: key,
              child: SizedBox(
                width: 240,
                height: 100,
                child: ColoredBox(
                  color: const Color(0xffffffff),
                  child: Align(
                    alignment: Alignment.topLeft,
                    child: enter(
                      const Text(
                        'TITLE',
                        style: TextStyle(
                          fontSize: 32,
                          color: Color(0xff000000),
                        ),
                      ),
                      progress,
                    ),
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
        ))!;
        double mass = 0, weightedY = 0;
        for (var y = 0; y < image.height; y++) {
          for (var x = 0; x < image.width; x++) {
            final darkness = 255 - bytes.getUint8((y * image.width + x) * 4);
            mass += darkness;
            weightedY += y * darkness;
          }
        }
        image.dispose();
        expect(mass, greaterThan(0));
        return weightedY / mass;
      }))!;
    }

    final first = await centroid(.5);
    final next = await centroid(.51);
    // 24 * .01 = .24 logical pixels, not a whole-pixel jump or zero movement.
    expect(first - next, closeTo(.24, .08));
    final reverse = await centroid(.5);
    expect(reverse, closeTo(first, .001));
  });
}
