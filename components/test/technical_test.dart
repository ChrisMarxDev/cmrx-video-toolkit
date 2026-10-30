import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'test_style.dart';

void main() {
  test('Chart data rejects misleading or invalid input', () {
    expect(parseTechnicalChartData('A: 1\nB: 2.5'), {'A': 1, 'B': 2.5});
    for (final input in [
      'A: 1\nA: 2',
      'A: NaN',
      'A: -1',
      'A: infinity',
      '',
      'A',
    ]) {
      expect(() => parseTechnicalChartData(input), throwsFormatException);
    }
    expect(
      () => TechnicalChart(
        data: {'A': 0},
        kind: TechnicalChartKind.donut,
        style: demoStyle,
      ),
      throwsArgumentError,
    );
    expect(
      () => TechnicalGrid(
        cells: [
          ['A'],
          ['B', 'C'],
        ],
        style: demoStyle,
      ),
      throwsArgumentError,
    );
    expect(
      () => TechnicalSequence(
        participants: ['A', 'B'],
        messages: [const SequenceMessage(from: 0, to: 2, label: 'bad')],
        style: demoStyle,
      ),
      throwsArgumentError,
    );
  });
  testWidgets(
    'Fluvie charts render standalone and reverse to identical pixels',
    (tester) async {
      final key = GlobalKey();
      Future<List<int>> pixels(
        TechnicalChartKind kind,
        double progress, {
        bool zero = false,
      }) async {
        await tester.pumpWidget(
          Directionality(
            textDirection: TextDirection.ltr,
            child: Center(
              child: RepaintBoundary(
                key: key,
                child: SizedBox(
                  width: 560,
                  height: 360,
                  child: TechnicalChart(
                    style: demoStyle,
                    kind: kind,
                    data: {
                      'A': zero ? 0 : 12,
                      'B': zero ? 0 : 28,
                      'C': zero ? 0 : 20,
                    },
                    progress: progress,
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
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

      for (final kind in TechnicalChartKind.values) {
        final start = await pixels(kind, 0);
        final end = await pixels(kind, 1);
        expect(start, isNot(orderedEquals(end)), reason: '$kind reveals');
        expect(
          await pixels(kind, 0),
          orderedEquals(start),
          reason: '$kind reverses',
        );
        if (kind != TechnicalChartKind.donut) await pixels(kind, 1, zero: true);
      }
    },
  );
}
