import 'test_style.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';

void main() {
  test('Immutable code and bounded motion inputs', () {
    final source = ['final t = frame / fps;'];
    final code = VideoCode(style: demoStyle, lines: source, focusLine: 0);
    source.clear();
    expect(code.lines, hasLength(1));
    expect(
      () => VideoCode(style: demoStyle, lines: ['x'], focusLine: 1),
      throwsArgumentError,
    );
    expect(
      () => VideoLayers(style: demoStyle, expansion: double.nan),
      throwsArgumentError,
    );
  });
  testWidgets('Caller typography and palette survive library composition', (
    tester,
  ) async {
    const style = VideoStyle(
      background: Color(0xFF123456),
      foreground: Color(0xFFFEDCBA),
      surface: Color(0xFF224466),
      accent: Color(0xFF668822),
      darkBackground: Color(0xFF010203),
      darkForeground: Color(0xFFFAFBFC),
      body: TextStyle(fontSize: 17, fontFamily: 'caller-body'),
      mono: TextStyle(fontSize: 13, fontFamily: 'caller-mono'),
      caption: TextStyle(fontSize: 31, fontFamily: 'caller-caption'),
    );
    await tester.pumpWidget(
      const VideoStage(
        style: style,
        child: Column(
          children: [
            VideoBlock(style: style, active: true, child: Text('Body')),
            VideoCaption('Caption', style: style),
          ],
        ),
      ),
    );
    final body = tester.element(find.text('Body'));
    expect(DefaultTextStyle.of(body).style.fontFamily, 'caller-body');
    final caption = tester.widget<Text>(find.text('Caption'));
    expect(caption.style!.fontFamily, 'caller-caption');
    expect(caption.style!.fontSize, 31);
    final block = tester.widget<Container>(
      find.descendant(
        of: find.byType(VideoBlock),
        matching: find.byType(Container),
      ),
    );
    expect((block.decoration as BoxDecoration).color, style.accent);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Both themes fit narrow frames and reverse diagram seeks', (
    tester,
  ) async {
    for (final theme in VideoTheme.values) {
      for (final progress in [0.0, 1.0, .4, 0.0]) {
        await tester.pumpWidget(
          VideoStage(
            style: demoStyle,
            theme: theme,
            child: Center(
              child: SizedBox(
                width: 320,
                height: 540,
                child: Column(
                  children: [
                    Expanded(
                      child: VideoLayers(style: demoStyle, expansion: progress),
                    ),
                    VideoCode(
                      style: demoStyle,
                      lines: ['final t = frame / fps;'],
                      focusLine: 0,
                    ),
                    const VideoCaption(
                      style: demoStyle,
                      'Aus Code wird Video.',
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
        expect(tester.takeException(), isNull);
      }
    }
  });
}
