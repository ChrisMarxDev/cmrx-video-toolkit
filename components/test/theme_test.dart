import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'test_style.dart';

void main() {
  testWidgets(
    'Parent updates const descendants; nested and explicit styles win',
    (tester) async {
      final alternate = demoStyle.copyWith(
        surface: const Color(0xFFABCDEF),
        radius: 18,
        borderWidth: 4,
        spacing: 31,
        body: const TextStyle(fontFamily: 'serif', fontSize: 29),
      );
      Widget scene(VideoStyle style) => VideoStage(
        style: style,
        child: Column(
          children: [
            const VideoBlock(child: Text('Inherited')),
            VideoThemeScope(
              style: alternate,
              child: const VideoBlock(child: Text('Nested')),
            ),
            const VideoBlock(style: demoStyle, child: Text('Explicit')),
            const VideoCaption('Caption'),
          ],
        ),
      );
      BoxDecoration decoration(String label) =>
          tester
                  .widget<Container>(
                    find
                        .ancestor(
                          of: find.text(label),
                          matching: find.byType(Container),
                        )
                        .first,
                  )
                  .decoration!
              as BoxDecoration;
      await tester.pumpWidget(scene(demoStyle));
      expect(decoration('Inherited').color, demoStyle.surface);
      expect(decoration('Nested').borderRadius, BorderRadius.circular(18));
      await tester.pumpWidget(scene(alternate));
      expect(decoration('Inherited').color, alternate.surface);
      expect(decoration('Inherited').borderRadius, BorderRadius.circular(18));
      expect((decoration('Inherited').border! as Border).top.width, 4);
      expect(
        DefaultTextStyle.of(
          tester.element(find.text('Inherited')),
        ).style.fontFamily,
        'serif',
      );
      expect(decoration('Explicit').color, demoStyle.surface);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Public components report missing theme instead of choosing a brand',
    (tester) async {
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: VideoBlock(child: Text('Missing')),
        ),
      );
      expect(tester.takeException(), isA<FlutterError>());
    },
  );
  testWidgets('Charts resolve parent styles', (tester) async {
    await tester.pumpWidget(
      VideoStage(
        style: demoStyle,
        child: Column(
          children: [
            SizedBox(
              width: 400,
              height: 300,
              child: TechnicalChart(
                data: {'A': 1, 'B': 2},
                kind: TechnicalChartKind.bar,
              ),
            ),
          ],
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });
}
