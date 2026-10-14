import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';

void main() {
  test('Immutable code and bounded motion inputs', () {
    final source = ['final t = frame / fps;'];
    final code = VideoCode(lines: source, focusLine: 0);
    source.clear();
    expect(code.lines, hasLength(1));
    expect(() => VideoCode(lines: ['x'], focusLine: 1), throwsArgumentError);
    expect(() => VideoLayers(expansion: double.nan), throwsArgumentError);
  });
  testWidgets('Both themes fit narrow frames and reverse diagram seeks', (
    tester,
  ) async {
    for (final theme in VideoTheme.values) {
      for (final progress in [0.0, 1.0, .4, 0.0]) {
        await tester.pumpWidget(
          VideoStage(
            theme: theme,
            child: Center(
              child: SizedBox(
                width: 320,
                height: 540,
                child: Column(
                  children: [
                    Expanded(child: VideoLayers(expansion: progress)),
                    VideoCode(lines: ['final t = frame / fps;'], focusLine: 0),
                    const VideoCaption('Aus Code wird Video.'),
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
