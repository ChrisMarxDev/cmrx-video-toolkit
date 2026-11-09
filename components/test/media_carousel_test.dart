import 'dart:typed_data';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';

void main() {
  test('snap holds then arrives; cues align, seeks clamp, empty is safe', () {
    expect(mediaCarouselPosition(0, 5), 0);
    expect(mediaCarouselPosition(.1, 5), 0);
    expect(mediaCarouselPosition(.19, 5), greaterThan(.5));
    expect(mediaCarouselPosition(1, 5), 4);
    expect(mediaCarouselPosition(-1, 5), 0);
    expect(mediaCarouselPosition(2, 5), 4);
    expect(mediaCarouselPosition(.9, 0), 0);
    expect(mediaCarouselPosition(.9, 1), 0);
    expect(mediaCarouselClickCues(1), isEmpty);
    for (final cue in mediaCarouselClickCues(5)) {
      expect(mediaCarouselPosition(cue, 5), (cue * 5).round());
    }
    final samples = [
      for (var i = 0; i <= 100; i++) mediaCarouselPosition(i / 100, 5),
    ];
    for (var i = 100; i >= 0; i--) {
      expect(mediaCarouselPosition(i / 100, 5), samples[i]);
      if (i > 0) expect(samples[i], greaterThanOrEqualTo(samples[i - 1]));
    }
  });
  test('click is deterministic, finite PCM with silent boundaries', () {
    final wav = mediaCarouselClickWav();
    expect(wav, mediaCarouselClickWav());
    final data = ByteData.sublistView(wav);
    expect(data.getUint32(24, Endian.little), 48000);
    expect(data.getUint32(40, Endian.little), wav.length - 44);
    expect(data.getInt16(44, Endian.little), 0);
    expect(data.getInt16(wav.length - 2, Endian.little), 0);
  });
  testWidgets(
    'center is larger, children are clipped and reverse seeks restore layout',
    (tester) async {
      Widget scene(double position, {int count = 5}) => Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: SizedBox(
            width: 600,
            height: 500,
            child: MediaCarousel(
              position: position,
              children: List.generate(
                count,
                (i) => ColoredBox(
                  key: ValueKey('media-$i'),
                  color: const Color(0xffaabbcc),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpWidget(scene(2));
      final center = tester.getRect(find.byKey(const ValueKey('media-2')));
      final side = tester.getRect(find.byKey(const ValueKey('media-1')));
      expect(center.width, greaterThan(side.width * 1.5));
      expect(center.center.dx, 400);
      await tester.pumpWidget(scene(3.3));
      await tester.pumpWidget(scene(2));
      expect(tester.getRect(find.byKey(const ValueKey('media-2'))), center);
      for (final count in [0, 1, 5]) {
        for (final p in [-4.0, 0.0, 9.0]) {
          await tester.pumpWidget(scene(p, count: count));
          expect(tester.takeException(), isNull);
        }
      }
    },
  );
}
