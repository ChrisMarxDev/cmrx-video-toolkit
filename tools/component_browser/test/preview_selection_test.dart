import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_component_browser/main.dart';
import 'package:video_component_browser/catalog.dart';
import 'package:video_component_browser/specimen.dart';
import 'package:video_component_browser/selection.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => binding.platformDispatcher.accessibilityFeaturesTestValue =
        FakeAccessibilityFeatures(disableAnimations: true),
  );
  tearDown(
    () => binding.platformDispatcher.clearAccessibilityFeaturesTestValue(),
  );
  test(
    'Selection exports independent ordered snapshots with no duplicate IDs',
    () {
      final selection = ComponentSelection();
      final props = <String, dynamic>{
        'text': 'Hello',
        'items': ['A'],
      };
      selection.put('video.title', 'default', props);
      (props['items'] as List).add('B');
      selection.put('video.quote', 'alternate', {'quote': 'Example'});
      selection.put('video.title', 'edited', {'text': 'Updated'});
      final data = jsonDecode(selection.encode(previewTheme: 'Rounded'));
      expect(data['schemaVersion'], 1);
      expect(data['kind'], 'component-selection');
      expect(data['components'].length, 2);
      expect(data['components'][0]['variant'], 'edited');
      selection.remove('video.title');
      expect(selection.length, 1);
      selection.clear();
      expect(selection.length, 0);
      selection.put('video.title', 'default', props);
      (props['items'] as List).add('C');
      expect(
        jsonDecode(
          selection.encode(previewTheme: 'Original'),
        )['components'][0]['props']['items'],
        ['A', 'B'],
      );
      selection.dispose();
    },
  );
  testWidgets(
    'Animation ticks leave page, sidebar and inspector widgets untouched',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = (await tester.runAsync(loadCatalog))!;
      await tester.pumpWidget(
        ComponentBrowser(
          catalog: catalog,
          initialRoute: '/video.editorial-title',
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Play preview'));
      await tester.pump();
      final sidebar = tester.widget(
        find.byKey(const ValueKey('component-sidebar')),
      );
      final input = tester.widget(find.byType(TextField).first);
      final frame = tester.widget<SpecimenFrame>(
        find.byType(SpecimenFrame).first,
      );
      await tester.pump(const Duration(milliseconds: 160));
      expect(
        identical(
          tester.widget(find.byKey(const ValueKey('component-sidebar'))),
          sidebar,
        ),
        true,
      );
      expect(
        identical(tester.widget(find.byType(TextField).first), input),
        true,
      );
      expect(
        tester.widget<SpecimenFrame>(find.byType(SpecimenFrame).first).progress,
        isNot(frame.progress),
      );
      expect(
        find.ancestor(
          of: find.byType(SpecimenFrame).first,
          matching: find.byType(RepaintBoundary),
        ),
        findsWidgets,
      );
      await tester.tap(find.byTooltip('Pause preview'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Overview builds only viewport cards and ticks only their previews',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = (await tester.runAsync(loadCatalog))!;
      await tester.pumpWidget(ComponentBrowser(catalog: catalog));
      await tester.pumpAndSettle();
      expect(find.byType(Checkbox).evaluate().length, lessThan(12));
      expect(
        find.byKey(const ValueKey('select-video.location-card')),
        findsNothing,
      );
      await tester.tap(find.text('Play animated previews'));
      await tester.pump();
      final sidebar = tester.widget(
        find.byKey(const ValueKey('component-sidebar')),
      );
      final check = tester.widget(
        find.byKey(const ValueKey('select-video.editorial-title')),
      );
      final field = tester.widget(find.byType(TextField).first);
      final before = tester
          .widget<SpecimenFrame>(find.byType(SpecimenFrame).first)
          .progress;
      await tester.pump(const Duration(milliseconds: 160));
      expect(
        tester.widget<SpecimenFrame>(find.byType(SpecimenFrame).first).progress,
        isNot(before),
      );
      expect(
        identical(
          tester.widget(find.byKey(const ValueKey('component-sidebar'))),
          sidebar,
        ),
        true,
      );
      expect(
        identical(
          tester.widget(
            find.byKey(const ValueKey('select-video.editorial-title')),
          ),
          check,
        ),
        true,
      );
      expect(
        identical(tester.widget(find.byType(TextField).first), field),
        true,
      );
      await tester.tap(find.text('Pause animated previews'));
      await tester.pumpAndSettle();
      await tester.drag(
        find.byKey(const ValueKey('component-overview')),
        const Offset(0, -1600),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('select-video.editorial-title')),
        findsNothing,
      );
      expect(find.byType(Checkbox).evaluate().length, lessThan(15));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Batch survives filters and routes, updates props, and copies valid JSON',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData')
            copied = call.arguments['text'] as String;
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      final catalog = (await tester.runAsync(loadCatalog))!;
      await tester.pumpWidget(ComponentBrowser(catalog: catalog));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('select-video.editorial-title')),
      );
      await tester.pumpAndSettle();
      expect(find.text('1 selected'), findsOneWidget);
      await tester.enterText(find.byType(TextField).first, 'video.quote-card');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('select-video.quote-card')));
      await tester.pumpAndSettle();
      expect(find.text('2 selected'), findsOneWidget);
      await tester.tap(find.text('Quote card').last);
      await tester.pumpAndSettle();
      expect(find.text('2 selected'), findsOneWidget);
      await tester.enterText(find.byType(TextField).first, 'Changed quotation');
      await tester.pump();
      await tester.tap(find.text('Update selection'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Copy selection'));
      await tester.pumpAndSettle();
      final data = jsonDecode(copied!);
      expect(data['components'].length, 2);
      expect(data['components'][1]['props']['quote'], 'Changed quotation');
      await tester.tap(find.text('All components').last);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<Checkbox>(
              find.byKey(const ValueKey('select-video.editorial-title')),
            )
            .value,
        true,
      );
      await tester.tap(find.byTooltip('Export selection'));
      await tester.pumpAndSettle();
      expect(
        find.text('Component selection'),
        findsOneWidget,
      ); // native fallback
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Clear selection'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('selection-count')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
