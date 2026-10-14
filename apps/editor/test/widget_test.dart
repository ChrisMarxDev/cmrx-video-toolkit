import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flut_script/main.dart';
import 'package:flut_script/edit.dart';

void main() {
  testWidgets('Requires launch workspace and disables export', (tester) async {
    await tester.pumpWidget(const FlutScript());
    expect(find.text('Export handoff'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Export handoff'),
          )
          .onPressed,
      isNull,
    );
    expect(
      find.text('Launch with: bash tool/open.sh /absolute/video.mp4'),
      findsOneWidget,
    );
  });
  test(
    'Annotation ranges split across cuts without relocating deleted notes',
    () {
      final data = handoff(
        [
          const Passage(0, 1, 'A'),
          const Passage(1, 2, 'B'),
          const Passage(2, 4, 'C'),
        ],
        {1},
        [
          const Annotation('a', 0.5, 2.5, 'Across'),
          const Annotation('b', 1.2, 1.8, 'Gone'),
        ],
        4,
        'revision',
      );
      expect(data['notes'][0]['output_windows'].length, 2);
      expect(data['notes'][0]['output_windows'][1]['output_start'], 1);
      expect(data['notes'][1]['status'], 'removed-by-edit');
      expect(data['notes'][1]['output_windows'], isEmpty);
      expect(data['segments'][1]['output_start'], 1);
      expect(srtTime(3661.123), '01:01:01,123');
    },
  );

  test('Cut complement preserves gaps and source boundaries', () {
    const rows = [Passage(1, 3, 'a'), Passage(4, 6, 'b'), Passage(6, 9, 'c')];
    final spans = retainedSpans(rows, {1, 2}, 10);
    expect(spans.map((p) => [p.start, p.end]).toList(), [
      [0, 4],
      [9, 10],
    ]);
    expect(retainedSpans(rows, {}, 10).single.end, 10);
    expect(retainedSpans([const Passage(0, 10, '')], {0}, 10), isEmpty);
  });
  test('Whisper offsets are milliseconds; overlapping rows are rejected', () {
    expect(
      parseTranscript(
        '{"transcription":[{"offsets":{"from":1000,"to":2000},"text":"Hello"}]}',
        3,
      ).single.start,
      1,
    );
    expect(
      () => parseTranscript(
        '{"transcription":[{"offsets":{"from":1000,"to":500},"text":"bad"}]}',
        3,
      ),
      throwsFormatException,
    );
  });
}
