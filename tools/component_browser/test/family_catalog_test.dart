import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_component_browser/catalog.dart';
import 'package:video_component_browser/main.dart';
import 'package:video_component_browser/specimen.dart';

void main() {
  test(
    'Families retain every legacy preset and presentation property schema',
    () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      final catalog = await loadCatalog();
      expect(catalog.length, 60);
      final families = catalog
          .where((s) => s.presentations.isNotEmpty)
          .toList();
      expect(families.length, 10);
      final ids = catalog.map((s) => s.id).toSet();
      expect(ids, isNot(contains('video.episode-title')));
      expect(ids, isNot(contains('video.screenshot-fan')));
      for (final family in families) {
        for (final original in family.implementations) {
          expect(family.matchesId(original.id), true);
          for (final variant in original.variants) {
            final preset = family.variantForRoute(original.id, variant['id']);
            final props = family.props(preset);
            expect(family.presentation(props).id, original.id);
            expect(family.parametersFor(props), original.parameters);
            expect(props, {
              ...original.props(variant['id']),
              'presentation': original.id,
            });
            final reference = jsonDecode(flowReference(family, preset, props));
            expect(reference['component'], family.id);
            expect(reference['props']['presentation'], original.id);
            expect(dartExample(family, props), contains(original.widget));
          }
        }
      }
    },
  );

  testWidgets(
    'Legacy episode link opens title family and swaps only relevant controls',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = (await tester.runAsync(loadCatalog))!;
      await tester.pumpWidget(
        ComponentBrowser(
          catalog: catalog,
          initialRoute: '/video.episode-title',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Title card'), findsWidgets);
      var specimen = tester.widget<SpecimenFrame>(
        find.byType(SpecimenFrame).first,
      );
      expect(specimen.spec.id, 'video.editorial-title');
      expect(specimen.props['presentation'], 'video.episode-title');
      final family = catalog.firstWhere((s) => s.id == 'video.editorial-title');
      final chapter =
          family.variants.firstWhere(
                (v) => v['presentation'] == 'video.chapter-ticket',
              )['id']
              as String;
      final dropdown = tester.widget<DropdownButtonFormField<String>>(
        find.byType(DropdownButtonFormField<String>).first,
      );
      dropdown.onChanged!(chapter);
      await tester.pumpAndSettle();
      specimen = tester.widget<SpecimenFrame>(find.byType(SpecimenFrame).first);
      expect(specimen.props['presentation'], 'video.chapter-ticket');
      expect(specimen.props.containsKey('chapter'), true);
      expect(specimen.props.containsKey('host'), false);
      expect(tester.takeException(), isNull);
    },
  );
}
