import 'package:composition_previewer/preview_layers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const layer = PreviewLayer(
    name: 'Captions',
    spans: [PreviewSpan(1, 3), PreviewSpan(6, 8)],
  );
  test('intervals are half open', () {
    expect(layer.activeAt(1), isTrue);
    expect(layer.activeAt(3), isFalse);
    expect(layer.activeAt(6), isTrue);
  });
  testWidgets(
    'toggle below player, seek from row and ruler, preserve state on clock update',
    (tester) async {
      double? sought;
      Widget app(double t) => MaterialApp(
        home: PreviewLayers(
          seconds: t,
          duration: 10,
          layers: const [layer],
          onSeek: (t) => sought = t,
          child: const SizedBox.expand(key: Key('video')),
        ),
      );
      await tester.pumpWidget(app(0));
      final originalHeight = tester
          .getSize(find.byKey(const Key('video')))
          .height;
      expect(find.text('Captions'), findsNothing);
      await tester.tap(find.text('Layers'));
      await tester.pump();
      expect(
        tester.getSize(find.byKey(const Key('video'))).height,
        lessThan(originalHeight),
      );
      final row = find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.label == 'Captions timeline',
      );
      await tester.tapAt(tester.getCenter(row));
      expect(sought, closeTo(5, .1));
      await tester.pumpWidget(app(7));
      expect(find.text('Captions'), findsOneWidget);
      sought = null;
      await tester.tap(
        find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.label == 'Seek',
        ),
      );
      await tester.pump();
      expect(sought, closeTo(5, .1));
      await tester.tap(find.text('Layers'));
      await tester.pump();
      expect(find.text('Captions'), findsNothing);
      expect(
        tester.getSize(find.byKey(const Key('video'))).height,
        originalHeight,
      );
    },
  );
  testWidgets('small surface and many rows scroll without overflow', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: SizedBox(
            width: 320,
            height: 300,
            child: PreviewLayers(
              seconds: 0,
              duration: 10,
              onSeek: (_) {},
              layers: List.generate(
                30,
                (i) => PreviewLayer(
                  name: 'Layer $i',
                  spans: const [PreviewSpan(0, 10)],
                ),
              ),
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Layers'));
    await tester.pump();
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
