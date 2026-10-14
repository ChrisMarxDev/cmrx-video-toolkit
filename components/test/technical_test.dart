import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'package:video_components/technical_samples.dart';
import 'test_style.dart';

void main() {
  test(
    'Graph validates references, copies collections and routes between ports',
    () {
      final a = DiagramNode(
        id: 'a',
        label: 'A',
        bounds: const Rect.fromLTWH(0, 0, 100, 60),
      );
      final b = DiagramNode(
        id: 'b',
        label: 'B',
        bounds: const Rect.fromLTWH(300, 200, 100, 60),
      );
      final edge = DiagramEdge(from: 'a', to: 'b');
      final points = diagramEdgePoints(edge, {'a': a, 'b': b});
      expect(points.first, const Offset(100, 30));
      expect(points.last, const Offset(300, 230));
      for (var i = 1; i < points.length; i++) {
        expect(
          points[i].dx == points[i - 1].dx || points[i].dy == points[i - 1].dy,
          isTrue,
        );
      }
      final nodes = [a, b];
      final graph = TechnicalDiagram(
        nodes: nodes,
        edges: [edge],
        style: demoStyle,
      );
      nodes.clear();
      expect(graph.nodes.length, 2);
      expect(() => graph.nodes.clear(), throwsUnsupportedError);
      expect(
        () => TechnicalDiagram(nodes: [a], edges: [edge], style: demoStyle),
        throwsArgumentError,
      );
      expect(
        () => TechnicalDiagram(nodes: [a, a], edges: [], style: demoStyle),
        throwsArgumentError,
      );
      expect(
        () => TechnicalDiagram(
          nodes: [a],
          edges: [],
          style: demoStyle,
          progress: double.nan,
        ),
        throwsArgumentError,
      );
    },
  );
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
  testWidgets('Every recipe supports explicit start, end and reverse seeks', (
    tester,
  ) async {
    for (final example in DiagramExample.values) {
      for (final progress in [0.0, 1.0, .25, 0.0]) {
        await tester.pumpWidget(
          Directionality(
            textDirection: TextDirection.ltr,
            child: Center(
              child: SizedBox(
                width: 600,
                height: 400,
                child: technicalDiagramExample(
                  example,
                  style: demoStyle,
                  progress: progress,
                ),
              ),
            ),
          ),
        );
        expect(tester.takeException(), isNull, reason: '$example at $progress');
      }
    }
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
