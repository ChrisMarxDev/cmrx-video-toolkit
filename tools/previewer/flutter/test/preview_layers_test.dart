import 'package:composition_previewer/preview_layers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('opens read-only metadata, updates after seeking, closes', (
    tester,
  ) async {
    Widget app(double t) => MaterialApp(
      home: PreviewLayers(
        seconds: t,
        layers: [
          PreviewLayer(name: 'Caption', active: t < 2),
          const PreviewLayer(name: 'Camera', active: true),
        ],
        child: const Center(child: Text('Composition')),
      ),
    );
    await tester.pumpWidget(app(0));
    expect(find.text('Caption'), findsNothing);
    await tester.tap(find.text('Layers'));
    await tester.pump();
    expect(find.text('Caption'), findsOneWidget);
    expect(find.text('Active'), findsNWidgets(2));
    await tester.pumpWidget(app(5));
    expect(find.text('5.0s · front to back'), findsOneWidget);
    expect(find.text('Inactive'), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);
    expect(find.byType(Switch), findsNothing);
    await tester.tap(find.text('Layers'));
    await tester.pump();
    expect(find.text('Caption'), findsNothing);
    expect(find.text('Composition'), findsOneWidget);
  });
  testWidgets(
    'empty metadata is explicit and many layers scroll at narrow sizes',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: PreviewLayers(seconds: 0, layers: [], child: SizedBox.expand()),
        ),
      );
      await tester.tap(find.text('Layers'));
      await tester.pump();
      expect(find.text('No layer metadata provided.'), findsOneWidget);
      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: SizedBox(
              width: 200,
              height: 160,
              child: PreviewLayers(
                seconds: 1,
                layers: List.generate(
                  20,
                  (i) => PreviewLayer(name: 'Layer $i', active: true),
                ),
                child: const SizedBox.expand(),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Layers'));
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );
}
