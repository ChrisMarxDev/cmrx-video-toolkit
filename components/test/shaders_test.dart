import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';

// Root-package tests use unprefixed asset keys; consuming apps test the loader.
Future<DitherPrograms> loadTestPrograms() async => DitherPrograms(
  field: await ui.FragmentProgram.fromAsset('shaders/dither_field.frag'),
  image: await ui.FragmentProgram.fromAsset('shaders/dither_image.frag'),
);

Future<ui.Image> sourceImage({
  bool halfTransparent = false,
  Color color = const Color(0xFF808080),
}) async {
  final r = ui.PictureRecorder();
  final c = Canvas(r);
  c.drawRect(
    Rect.fromLTWH(0, 0, halfTransparent ? 16 : 32, 32),
    Paint()..color = color,
  );
  final p = r.endRecording();
  final image = await p.toImage(32, 32);
  p.dispose();
  return image;
}

Future<Uint8List> pixels(
  WidgetTester tester,
  Widget child, {
  double width = 32,
  double height = 32,
}) async {
  final key = GlobalKey();
  await tester.pumpWidget(
    Center(
      child: RepaintBoundary(
        key: key,
        child: SizedBox(width: width, height: height, child: child),
      ),
    ),
  );
  await tester.pump();
  expect(tester.takeException(), isNull);
  return (await tester.runAsync(() async {
    final image =
        await (key.currentContext!.findRenderObject() as RenderRepaintBoundary)
            .toImage();
    final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    image.dispose();
    return Uint8List.fromList(data!.buffer.asUint8List());
  }))!;
}

void main() {
  test('Dither settings reject invalid values', () {
    for (final bad in [0.0, -1.0, double.nan, double.infinity]) {
      expect(() => DitherStyle(pixelSize: bad), throwsArgumentError);
      expect(() => DitherStyle(outputScale: bad), throwsArgumentError);
    }
    expect(() => DitherStyle(contrast: -1), throwsArgumentError);
    expect(() => DitherStyle(bias: 2), throwsArgumentError);
    expect(DitherStyle(pixelSize: 2, outputScale: .5).localPixelSize, 4);
  });
  testWidgets(
    'All Bayer orders preserve midtone coverage and use only palette colors',
    (tester) async {
      final programs = (await tester.runAsync(loadTestPrograms))!;
      final source = (await tester.runAsync(sourceImage))!;
      addTearDown(source.dispose);
      for (final pattern in DitherPattern.values) {
        final data = await pixels(
          tester,
          DitherImage(
            programs: programs,
            image: source,
            style: DitherStyle(
              pattern: pattern,
              background: const Color(0xFF000000),
              foreground: const Color(0xFFFFFFFF),
            ),
          ),
        );
        var white = 0;
        for (var i = 0; i < data.length; i += 4) {
          expect(data[i], anyOf(0, 255));
          expect(data[i + 1], data[i]);
          expect(data[i + 2], data[i]);
          expect(data[i + 3], 255);
          if (data[i] == 255) white++;
        }
        expect(
          white,
          512,
          reason: 'Half the 1024 pixels must be white for $pattern',
        );
      }
    },
  );
  testWidgets('Image alpha and contain letterboxing survive dithering', (
    tester,
  ) async {
    final programs = (await tester.runAsync(loadTestPrograms))!;
    final source = (await tester.runAsync(
      () => sourceImage(halfTransparent: true),
    ))!;
    addTearDown(source.dispose);
    final data = await pixels(
      tester,
      DitherImage(programs: programs, image: source),
      width: 64,
    );
    int alpha(int x, int y) => data[(y * 64 + x) * 4 + 3];
    expect(alpha(2, 16), 0);
    expect(alpha(20, 16), 255);
    expect(alpha(44, 16), 0);
    expect(alpha(61, 16), 0);
  });
  testWidgets('Semi-transparent input retains alpha and correct luminance', (
    tester,
  ) async {
    final programs = (await tester.runAsync(loadTestPrograms))!;
    final source = (await tester.runAsync(
      () => sourceImage(color: const Color(0x80808080)),
    ))!;
    addTearDown(source.dispose);
    final data = await pixels(
      tester,
      DitherImage(
        programs: programs,
        image: source,
        style: DitherStyle(
          background: const Color(0xFF000000),
          foreground: const Color(0xFFFFFFFF),
        ),
      ),
    );
    var bright = 0;
    for (var i = 0; i < data.length; i += 4) {
      expect(data[i + 3], 128);
      if (data[i] > 0) bright++;
    }
    expect(bright, 512);
  });
  testWidgets(
    'Field rendering is deterministic across reverse seeks and changes with time',
    (tester) async {
      final programs = (await tester.runAsync(loadTestPrograms))!;
      final a = await pixels(tester, DitherField(programs: programs, time: 0));
      final b = await pixels(tester, DitherField(programs: programs, time: 1));
      final back = await pixels(
        tester,
        DitherField(programs: programs, time: 0),
      );
      expect(back, orderedEquals(a));
      expect(b, isNot(orderedEquals(a)));
    },
  );
}
