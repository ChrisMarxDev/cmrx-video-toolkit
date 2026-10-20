import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'package:video_components/expanded_samples.dart';
import 'test_style.dart';

void main() {
  final entries =
      (jsonDecode(File('components.json').readAsStringSync())['components']
              as List)
          .expand(
            (e) => e['presentations'] == null
                ? [e]
                : (e['presentations'] as Map).values,
          )
          .where((e) => e['expanded'] == true)
          .cast<Map<String, dynamic>>()
          .toList();
  Map<String, dynamic> props(
    Map<String, dynamic> e,
    Map<String, dynamic> variant,
  ) => {
    for (final p in (e['parameters'] as Map).entries)
      p.key as String: p.value['default'],
    ...variant['props'] as Map<String, dynamic>,
  };
  Widget host(Widget child, {VideoStyle style = demoStyle}) => Directionality(
    textDirection: TextDirection.ltr,
    child: VideoThemeScope(
      style: style,
      child: SizedBox(width: 800, height: 500, child: child),
    ),
  );
  test(
    'All 48 researched additions have unique real widgets and two presets',
    () {
      expect(entries.length, 48);
      expect(entries.map((e) => e['widget']).toSet().length, 48);
      expect(entries.map((e) => e['id']).toSet().length, 48);
      for (final e in entries) {
        expect(e['variants'].length, 2);
        expect(
          File(
            (e['source'] as String).replaceFirst('components/', ''),
          ).existsSync(),
          true,
        );
      }
    },
  );
  testWidgets(
    'All new presets tolerate both endpoints and intermediate progress',
    (tester) async {
      final errors = <String>[];
      final generated = <String>[];
      for (final e in entries) {
        for (final variant in e['variants']) {
          final p = props(e, Map<String, dynamic>.from(variant));
          for (final progress in [0.0, .55, 1.0]) {
            await tester.pumpWidget(host(expandedSample(e['id'], p, progress)));
            await tester.pump();
            final error = tester.takeException();
            if (error != null)
              errors.add('${e['id']}/${variant['id']} at $progress: $error');
          }
          // Exercise the inspector's numeric representation in copied code.
          for (final k in p.keys.toList()) {
            if (p[k] is num) p[k] = (p[k] as num).toDouble();
          }
          generated.add(expandedExample(e['id'], p));
        }
      }
      const out = String.fromEnvironment('EXPANDED_EXAMPLES_OUT');
      if (out.isNotEmpty) {
        File(out).writeAsStringSync(
          "import 'package:flutter/widgets.dart';\nimport 'package:flutter_test/flutter_test.dart';\nimport 'package:video_components/video_components.dart';\nvoid main(){test('copied constructors compile',(){const progress=0.5;const media=[SizedBox(),SizedBox(),SizedBox(),SizedBox()];const map=SizedBox();final widgets=<Widget>[\n${generated.join(',\n')}\n];expect(widgets.length,96);});}\n",
        );
      }
      expect(errors, isEmpty, reason: errors.join('\n'));
    },
  );
  test(
    'Structured inputs reject malformed values instead of fabricating data',
    () {
      expect(() => parseChartValues('Label | NaN'), throwsFormatException);
      expect(() => parseCaptionWords('word | 0'), throwsFormatException);
      expect(() => parseRoutePoints('.2 | Infinity'), throwsFormatException);
      expect(
        () => parsePipelineSteps('Render | unknown | 1s'),
        throwsArgumentError,
      );
      expect(parseCredits('Director | Alex').single.name, 'Alex');
    },
  );
  testWidgets('Caption intervals have exact boundaries and silent gaps', (
    tester,
  ) async {
    const words = [CaptionWord('One', 0, 1), CaptionWord('Two', 1.5, 2)];
    Future<Color?> colorAt(double t, String text) async {
      await tester.pumpWidget(
        host(TimedWordCaptions(words: words, seconds: t)),
      );
      return tester
          .widget<Container>(
            find
                .ancestor(of: find.text(text), matching: find.byType(Container))
                .first,
          )
          .color;
    }

    expect(await colorAt(.999, 'One'), demoStyle.accent);
    expect(await colorAt(1, 'One'), isNull);
    expect(await colorAt(1.25, 'Two'), isNull);
    expect(await colorAt(1.5, 'Two'), demoStyle.accent);
    expect(await colorAt(2, 'Two'), isNull);
  });
  testWidgets(
    'Theme changes rebuild new const widgets and override precedence',
    (tester) async {
      const child = ChapterTicket(chapter: '01', title: 'Theme test');
      final other = demoStyle.copyWith(
        surface: const Color(0xFF123456),
        radius: 28,
        borderWidth: 3,
        body: const TextStyle(fontFamily: 'serif'),
      );
      await tester.pumpWidget(host(child));
      await tester.pumpWidget(host(child, style: other));
      final boxes = tester
          .widgetList<Container>(find.byType(Container))
          .where((w) => w.decoration is BoxDecoration)
          .map((w) => w.decoration as BoxDecoration);
      expect(
        boxes.any(
          (d) =>
              d.color == other.surface &&
              d.borderRadius == BorderRadius.circular(28),
        ),
        true,
      );
      final text = tester.widget<Text>(find.text('Theme test'));
      expect(text.style!.fontFamily, 'serif');
      await tester.pumpWidget(
        host(
          const ChapterTicket(
            chapter: '01',
            title: 'Theme test',
            style: demoStyle,
          ),
          style: other,
        ),
      );
      expect(
        tester.widget<Text>(find.text('Theme test')).style!.fontFamily,
        demoStyle.body.fontFamily,
      );
    },
  );
  testWidgets(
    'Transitions show exact source and destination; reverse seeks repeat pixels',
    (tester) async {
      tester.view.physicalSize = const Size(160, 100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      const from = ColoredBox(color: Color(0xFFFF0000)),
          to = ColoredBox(color: Color(0xFF0000FF));
      final builders = <Widget Function(double)>[
        (p) => StripeWipe(from: from, to: to, progress: p),
        (p) => DotIris(from: from, to: to, progress: p),
        (p) => TileWave(from: from, to: to, progress: p),
        (p) => AlternatingPanels(from: from, to: to, progress: p),
        (p) => FramePushThrough(from: from, to: to, progress: p),
        (p) => LetterboxReveal(from: from, to: to, progress: p),
      ];
      for (final build in builders) {
        Future<List<int>> pixels(double p) async {
          final key = GlobalKey();
          await tester.pumpWidget(
            host(RepaintBoundary(key: key, child: build(p))),
          );
          await tester.pump();
          final boundary =
              key.currentContext!.findRenderObject() as RenderRepaintBoundary;
          return (await tester.runAsync(() async {
            final image = await boundary.toImage();
            final bytes = (await image.toByteData(
              format: ui.ImageByteFormat.rawRgba,
            ))!.buffer.asUint8List().toList();
            image.dispose();
            return bytes;
          }))!;
        }

        final a = await pixels(0), b = await pixels(1), mid = await pixels(.5);
        for (var i = 0; i < a.length; i += 4) {
          expect(a.sublist(i, i + 4), [255, 0, 0, 255]);
          expect(b.sublist(i, i + 4), [0, 0, 255, 255]);
        }
        expect(mid, isNot(a));
        expect(mid, isNot(b));
        expect(await pixels(.5), mid);
      }
    },
  );
  testWidgets('Invalid edited data shows a useful message and recovers', (
    tester,
  ) async {
    final e = entries.firstWhere((e) => e['id'] == 'video.conversion-funnel');
    final p = props(e, Map<String, dynamic>.from(e['variants'][0]));
    p['stages'] = 'Visits | 10\nCompleted | 20';
    await tester.pumpWidget(
      host(ExpandedSpecimen(id: e['id'], props: p, progress: 1)),
    );
    expect(find.textContaining('must not increase'), findsOneWidget);
    expect(tester.takeException(), isNull);
    p['stages'] = 'Visits | 20\nCompleted | 10';
    await tester.pumpWidget(
      host(ExpandedSpecimen(id: e['id'], props: p, progress: 1)),
    );
    expect(find.byType(ConversionFunnel), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(() => parseCalendarDate('2026-02-30'), throwsFormatException);
  });
  testWidgets('Documented dense inputs fit and degenerate routes are safe', (
    tester,
  ) async {
    for (final child in <Widget>[
      CodeDiff(
        before: List.filled(12, 'old value'),
        after: List.filled(12, 'new value'),
      ),
      CreditsRoll(
        credits: List.generate(
          20,
          (i) => CreditEntry('A long role ' * 8, 'A long name ' * 8),
        ),
        progress: .5,
      ),
      PipelineStatus(
        stages: List.generate(
          6,
          (i) => PipelineStep(
            'Stage name ' * 10,
            PipelineState.done,
            detail: 'Details ' * 20,
          ),
        ),
      ),
      const RouteTrace(
        map: SizedBox(),
        points: [Offset(.5, .5), Offset(.5, .5)],
      ),
      const ConversionFunnel(
        stages: [ChartDatum('Start', 10), ChartDatum('End', 0)],
      ),
    ]) {
      await tester.pumpWidget(host(child));
      await tester.pump();
      expect(tester.takeException(), isNull, reason: '${child.runtimeType}');
    }
  });
  test('Countdown has stable endpoints in both directions', () {
    expect(const CountdownCounter(start: 10, end: 0, progress: 0).value, 10);
    expect(const CountdownCounter(start: 10, end: 0, progress: 1).value, 0);
    expect(const CountdownCounter(start: 0, end: 10, progress: .5).value, 5);
  });
}
