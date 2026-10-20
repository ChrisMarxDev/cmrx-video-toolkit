import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_component_browser/main.dart';
import 'package:video_component_browser/catalog.dart';
import 'package:video_component_browser/specimen.dart';

void main() {
  testWidgets(
    'Fractional controls preserve values while index controls stay discrete',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = (await tester.runAsync(loadCatalog))!;
      await tester.pumpWidget(
        ComponentBrowser(
          key: UniqueKey(),
          catalog: catalog,
          initialRoute: '/video.screenshot-rail',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Perspective · 0.15'), findsOneWidget);
      // Numeric controls precede the preview playback scrubber in the widget tree.
      Slider control(String label) => tester.widget<Slider>(
        find
            .descendant(
              of: find
                  .ancestor(of: find.text(label), matching: find.byType(Column))
                  .first,
              matching: find.byType(Slider),
            )
            .first,
      );
      final perspective = control('Perspective · 0.15');
      expect(perspective.divisions, isNull);
      perspective.onChanged!(.2375);
      await tester.pump();
      final position = control('Position · 1');
      expect(position.divisions, isNull);
      position.onChanged!(1.375);
      await tester.pump();
      var specimen = tester.widget<SpecimenFrame>(
        find.byType(SpecimenFrame).first,
      );
      expect(specimen.props['perspective'], .2375);
      expect(specimen.props['position'], 1.375);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(
        ComponentBrowser(
          key: UniqueKey(),
          catalog: catalog,
          initialRoute: '/video.screenshot-stack',
        ),
      );
      await tester.pumpAndSettle();
      final index = control('Active Index · 1');
      expect(index.divisions, 3);
      index.onChanged!(2);
      await tester.pump();
      specimen = tester.widget<SpecimenFrame>(find.byType(SpecimenFrame).first);
      expect(specimen.props['activeIndex'], isA<int>());
      expect(specimen.props['activeIndex'], 2);
      expect(tester.takeException(), isNull);
    },
  );
}
