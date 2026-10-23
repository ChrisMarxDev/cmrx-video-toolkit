import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:animation_workshop/workshop.dart';

void main() {
  test('sampling holds endpoints and is independent of evaluation order', () {
    final t = MotionTrack(
      id: 'x',
      unit: 'px',
      from: 40,
      to: 0,
      min: -100,
      max: 100,
      start: 1,
      duration: 1,
      curve: [0, 0, 1, 1],
    );
    expect(t.valueAt(0), 40);
    expect(t.valueAt(3), 0);
    expect(t.valueAt(1.5), closeTo(20, .01));
    expect(t.valueAt(1), 40);
    expect(t.valueAt(1.5), closeTo(20, .01));
    final copy = t.copy()..curve[0] = .5;
    expect(t.curve[0], 0);
    expect(copy.curve[0], .5);
  });

  testWidgets(
    'controls update samples, frame step pauses, export identifies all tracks',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final tracks = [
        MotionTrack(
          id: 'title.x',
          unit: 'logicalPixels',
          from: 40,
          to: 0,
          min: -100,
          max: 100,
          start: 0,
          duration: 1,
          curve: [0, 0, 1, 1],
        ),
        MotionTrack(
          id: 'title.opacity',
          unit: 'opacity',
          from: 0,
          to: 1,
          min: 0,
          max: 1,
          start: 1,
          duration: 1,
        ),
      ];
      await tester.pumpWidget(
        AnimationWorkshop(
          target: 'title',
          source: 'lib/video.dart',
          tracks: tracks,
          seconds: 3,
          fps: 30,
          outputStartSeconds: 12,
          builder: (context, time, values) =>
              Text('x=${values['title.x']!.toStringAsFixed(2)}'),
        ),
      );
      expect(find.text('x=40.00'), findsOneWidget);
      await tester.tap(find.byTooltip('Next frame'));
      await tester.pump();
      expect(find.text('x=38.67'), findsOneWidget);
      await tester.tap(find.text('Play'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.byTooltip('Next frame'));
      await tester.pump();
      expect(find.text('Play'), findsOneWidget);
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(2), '80');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      await tester.tap(find.text('Copy settings'));
      await tester.pumpAndSettle();
      final text =
          tester.widget<SelectableText>(find.byType(SelectableText)).data!;
      final json = jsonDecode(text);
      expect(json['target'], 'title');
      expect(json['outputStartSeconds'], 12);
      expect(json['tracks'][0]['from'], 80);
      expect(json['tracks'][1]['startSeconds'], 1);
      expect(
        tracks[0].from,
        40,
      ); // Session edits do not mutate caller defaults.
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Reset selected track'), 180,
          scrollable: find
              .descendant(
                  of: find.byType(ListView), matching: find.byType(Scrollable))
              .first);
      await tester.tap(find.text('Reset selected track'));
      await tester.pump();
      await tester.tap(find.text('Copy settings'));
      await tester.pumpAndSettle();
      final reset = jsonDecode(
          tester.widget<SelectableText>(find.byType(SelectableText)).data!);
      expect(reset['tracks'][0]['from'], 40);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('narrow layout remains usable', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      AnimationWorkshop(
        target: 'Card',
        source: 'example.dart',
        tracks: [
          MotionTrack(
            id: 'opacity',
            unit: 'opacity',
            from: 0,
            to: 1,
            min: 0,
            max: 1,
          ),
        ],
        builder: (context, seconds, values) => const SizedBox(),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
