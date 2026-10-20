import 'package:video_component_browser/demo_style.dart';
import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('GIF uses encoded durations, loops and supports reverse seeks', (
    tester,
  ) async {
    final frames = (await tester.runAsync(
      () async => VideoGifFrames.decode(
        (await rootBundle.load('assets/demo/loop.gif')).buffer.asUint8List(),
      ),
    ))!;
    addTearDown(frames.dispose);
    expect(frames.images.length, greaterThan(1));
    final first = frames.at(0);
    expect(frames.at(.5), isNot(same(first)));
    expect(frames.at(0), same(first));
    final duration =
        frames.durations.fold<int>(0, (s, d) => s + d.inMicroseconds) / 1e6;
    expect(frames.at(duration), same(first));
    expect(() => frames.at(double.nan), throwsArgumentError);
    expect(() => frames.at(-1), throwsArgumentError);
    await tester.pumpWidget(
      SizedBox(
        width: 320,
        height: 180,
        child: VideoGif(
          style: demoStyle,
          frames: frames,
          seconds: .5,
          framed: true,
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Caller palette dither changes with time and uses only its two colors',
    (tester) async {
      final programs = (await tester.runAsync(DitherPrograms.load))!;
      final key = GlobalKey();
      Future<List<int>> pixels(double seconds) async {
        await tester.pumpWidget(
          Center(
            child: RepaintBoundary(
              key: key,
              child: SizedBox(
                width: 96,
                height: 96,
                child: VideoTexture(
                  style: demoStyle,
                  programs: programs,
                  animated: true,
                  accentPalette: true,
                  seconds: seconds,
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
          final data = (await image.toByteData(
            format: ui.ImageByteFormat.rawRgba,
          ))!.buffer.asUint8List().toList();
          image.dispose();
          return data;
        }))!;
      }

      final a = await pixels(0), b = await pixels(4);
      expect(a, isNot(orderedEquals(b)));
      expect(await pixels(0), orderedEquals(a));
      final colors = <String>{};
      for (var i = 0; i < a.length; i += 4) {
        colors.add(a.sublist(i, i + 4).join(','));
      }
      expect(colors, equals({'237,240,243,255', '12,102,228,255'}));
    },
  );
}
