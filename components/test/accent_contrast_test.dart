import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'test_style.dart';

void main() {
  test('onAccent preserves legacy styles and explicit copy overrides', () {
    expect(demoStyle.onAccent, demoStyle.foreground);
    final blue = demoStyle.copyWith(
      accent: const Color(0xFF0C66E4),
      onAccent: const Color(0xFFFFFFFF),
    );
    expect(blue.copyWith(radius: 6).onAccent, const Color(0xFFFFFFFF));
    expect(
      blue.copyWith(onAccent: demoStyle.foreground).onAccent,
      demoStyle.foreground,
    );
    final contrast =
        (blue.onAccent.computeLuminance() + .05) /
        (blue.accent.computeLuminance() + .05);
    expect(contrast, greaterThan(4.5));
  });

  testWidgets(
    'accent content follows parent onAccent and normal text stays dark',
    (tester) async {
      final blue = demoStyle.copyWith(
        accent: const Color(0xFF0C66E4),
        onAccent: const Color(0xFFFFFFFF),
      );
      Widget frame(VideoStyle style, Widget child) => Directionality(
        textDirection: TextDirection.ltr,
        child: VideoThemeScope(style: style, child: child),
      );
      for (final ink in [const Color(0xFFFFFFFF), const Color(0xFFFFEECC)]) {
        final style = blue.copyWith(onAccent: ink);
        await tester.pumpWidget(
          frame(
            style,
            const EpisodeTitle(
              title: 'Title',
              episode: 'EPISODE',
              host: 'Host',
            ),
          ),
        );
        expect(tester.widget<Text>(find.text('EPISODE')).style!.color, ink);
        expect(
          tester.widget<Text>(find.text('Title')).style!.color,
          style.foreground,
        );
        await tester.pumpWidget(
          frame(
            style,
            const TimedWordCaptions(
              words: [CaptionWord('Current', 0, 1), CaptionWord('Next', 1, 2)],
              seconds: .5,
            ),
          ),
        );
        expect(tester.widget<Text>(find.text('Current')).style!.color, ink);
        expect(
          tester.widget<Text>(find.text('Next')).style!.color,
          style.foreground,
        );
        await tester.pumpWidget(
          frame(style, const VideoBlock(active: true, child: Text('Block'))),
        );
        expect(
          DefaultTextStyle.of(tester.element(find.text('Block'))).style.color,
          ink,
        );
        expect(tester.takeException(), isNull);
      }
    },
  );
}
