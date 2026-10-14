import 'dart:io';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluvie/rendering.dart';
import '../lib/dithering.dart' as demo;

const out = String.fromEnvironment('DITHER_CAPTURE_OUT');
void main() {
  testWidgets(
    'Capture deterministic dither gallery',
    (tester) async {
      await tester.runAsync(demo.prepareDithering);
      addTearDown(demo.illustration.dispose);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await renderVideo(
        video: demo.build(),
        outDir: Directory(out),
        compositionKey: 'dithering',
        cacheEnabled: false,
        setViewSize: (w, h) {
          tester.view.physicalSize = Size(w.toDouble(), h.toDouble());
          tester.view.devicePixelRatio = 1;
        },
        pumpWidget: tester.pumpWidget,
        pumpFrame: () => tester.pump(),
        runAsync: tester.runAsync,
      );
      expect(File('$out/frames.rgba').lengthSync(), 640 * 640 * 4 * 120);
    },
    skip: out.isEmpty,
    timeout: Timeout.none,
  );
  testWidgets('Consuming app loads package shaders and fits the gallery', (
    tester,
  ) async {
    await tester.runAsync(demo.prepareDithering);
    addTearDown(demo.illustration.dispose);
    await tester.pumpWidget(
      SizedBox(width: 640, height: 640, child: demo.ditherGallery(1)),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
