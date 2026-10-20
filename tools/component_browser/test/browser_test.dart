import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_components/video_components.dart';
import 'package:video_component_browser/catalog.dart';
import 'package:video_component_browser/main.dart';
import 'package:video_component_browser/specimen.dart';
import 'package:video_component_browser/demo_media.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadDemoMedia);
  setUp(() {
    binding.platformDispatcher.accessibilityFeaturesTestValue =
        FakeAccessibilityFeatures(disableAnimations: true);
  });
  tearDown(
    () => binding.platformDispatcher.clearAccessibilityFeaturesTestValue(),
  );

  testWidgets('Preview theme persists across component navigation', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    const reviewDir = String.fromEnvironment('THEME_REVIEW_DIR');
    if (reviewDir.isNotEmpty) {
      await tester.runAsync(() async {
        await (FontLoader(
          'MaterialIcons',
        )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
        for (final entry in {
          'sans-serif': const String.fromEnvironment('THEME_REVIEW_SANS'),
          'serif': const String.fromEnvironment('THEME_REVIEW_SERIF'),
        }.entries) {
          if (entry.value.isNotEmpty) {
            final bytes = await File(entry.value).readAsBytes();
            await (FontLoader(
              entry.key,
            )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
          }
        }
      });
    }
    final boundary = GlobalKey();
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundary,
        child: ComponentBrowser(
          catalog: (await tester.runAsync(loadCatalog))!,
          initialRoute: '/video.block',
        ),
      ),
    );
    await tester.pumpAndSettle();
    final selector = find.byKey(const ValueKey('preview-theme'));
    for (final name in ['Rounded', 'Editorial', 'Original']) {
      await tester.tap(selector);
      await tester.pumpAndSettle();
      await tester.tap(find.text(name).last);
      await tester.pumpAndSettle();
      final style = VideoThemeScope.of(
        tester.element(find.byType(SpecimenFrame).first),
      );
      expect(
        style.radius,
        name == 'Rounded'
            ? 24
            : name == 'Editorial'
            ? 4
            : 0,
      );
      const directory = String.fromEnvironment('THEME_REVIEW_DIR');
      if (directory.isNotEmpty) {
        await tester.runAsync(() async {
          final capture =
              await (boundary.currentContext!.findRenderObject()
                      as RenderRepaintBoundary)
                  .toImage();
          final bytes = await capture.toByteData(
            format: ui.ImageByteFormat.png,
          );
          await Directory(directory).create(recursive: true);
          await File(
            '$directory/$name.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          capture.dispose();
        });
      }
    }
    await tester.tap(selector);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rounded').last);
    await tester.pumpAndSettle();
    final sidebar = find.byKey(const ValueKey('component-sidebar'));
    await tester.tap(
      find
          .descendant(of: sidebar, matching: find.byType(ListTile))
          .hitTestable()
          .at(2),
    );
    await tester.pumpAndSettle();
    expect(tester.widget<DropdownButton<String>>(selector).value, 'Rounded');
    expect(
      VideoThemeScope.of(
        tester.element(find.byType(SpecimenFrame).first),
      ).radius,
      24,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('Sidebar keeps its scroll position when selecting components', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ComponentBrowser(catalog: (await tester.runAsync(loadCatalog))!),
    );
    await tester.pumpAndSettle();
    final sidebar = find.byKey(const ValueKey('component-sidebar'));
    double offset() => tester.widget<ListView>(sidebar).controller!.offset;
    await tester.drag(sidebar, const Offset(0, -600));
    await tester.pumpAndSettle();
    final originalOffset = offset();
    expect(originalOffset, greaterThan(0));
    for (var i = 0; i < 2; i++) {
      final tiles = find.descendant(
        of: sidebar,
        matching: find.byType(ListTile),
      );
      await tester.tap(tiles.hitTestable().at(i));
      await tester.pumpAndSettle();
      expect(offset(), closeTo(originalOffset, .01));
      expect(
        tester.widgetList<ListTile>(tiles).where((tile) => tile.selected),
        hasLength(1),
      );
    }
    Navigator.of(tester.element(sidebar)).pop();
    await tester.pumpAndSettle();
    expect(offset(), closeTo(originalOffset, .01));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Every registered variant renders actual widgets in landscape and portrait',
    (tester) async {
      final catalog = (await tester.runAsync(loadCatalog))!;
      final programs = (await tester.runAsync(DitherPrograms.load))!;
      await tester.runAsync(() async {
        await (FontLoader(
          'MaterialIcons',
        )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      });
      expect(catalog.map((s) => s.id).toSet().length, catalog.length);
      for (final spec in catalog) {
        expect(
          File('../../${spec.source}').existsSync(),
          isTrue,
          reason: spec.id,
        );
        for (final variant in spec.variants) {
          final props = spec.props(variant['id']);
          expect(dartExample(spec, props), contains(spec.widget));
          final ref = jsonDecode(flowReference(spec, variant['id'], props));
          expect(ref['props'], props);
          for (final canvas in [const Size(960, 540), const Size(540, 960)]) {
            await tester.pumpWidget(
              Directionality(
                textDirection: TextDirection.ltr,
                child: Center(
                  child: SizedBox(
                    width: 380,
                    height: 400,
                    child: SpecimenFrame(
                      spec: spec,
                      props: props,
                      progress: .75,
                      programs: programs,
                      canvas: canvas,
                    ),
                  ),
                ),
              ),
            );
            await tester.pump();
            expect(
              tester.takeException(),
              isNull,
              reason: '${spec.id}/${variant['id']} $canvas',
            );
          }
        }
      }
    },
  );

  testWidgets(
    'Search filters overview and gives useful empty results at mobile width',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ComponentBrowser(catalog: (await tester.runAsync(loadCatalog))!),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'video.layers');
      await tester.pumpAndSettle();
      expect(find.text('1 component'), findsOneWidget);
      expect(find.text('Exploded layers'), findsOneWidget);
      await tester.enterText(find.byType(TextField).first, 'missing-widget');
      await tester.pumpAndSettle();
      expect(find.textContaining('No matching components'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Deep links load presets, editable properties reset, and unknown routes recover',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = (await tester.runAsync(loadCatalog))!;
      await tester.pumpWidget(
        ComponentBrowser(
          catalog: catalog,
          initialRoute: '/video.block?variant=active',
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
        isTrue,
      );
      await tester.enterText(find.byType(TextFormField), 'Updated concept');
      await tester.pumpAndSettle();
      expect(find.text('Updated concept'), findsWidgets);
      await tester.tap(find.text('Reset properties'));
      await tester.pumpAndSettle();
      expect(find.text('Updated concept'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(
        ComponentBrowser(
          key: UniqueKey(),
          catalog: catalog,
          initialRoute: '/missing',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Unknown component'), findsOneWidget);
    },
  );

  testWidgets(
    'Overview renders at desktop size and exports an optional review frame',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = (await tester.runAsync(loadCatalog))!;
      final programs = (await tester.runAsync(DitherPrograms.load))!;
      await tester.runAsync(() async {
        await (FontLoader(
          'MaterialIcons',
        )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      });
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: ComponentBrowser(catalog: catalog, programs: programs),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      const out = String.fromEnvironment('BROWSER_REVIEW_PNG');
      if (out.isNotEmpty)
        await tester.runAsync(() async {
          final image =
              await (key.currentContext!.findRenderObject()
                      as RenderRepaintBoundary)
                  .toImage();
          await File(out).writeAsBytes(
            (await image.toByteData(
              format: ui.ImageByteFormat.png,
            ))!.buffer.asUint8List(),
          );
          image.dispose();
        });
    },
  );
  testWidgets('Mobile inspector fits and motion only advances after play', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final catalog = (await tester.runAsync(loadCatalog))!;
    await tester.pumpWidget(
      ComponentBrowser(
        catalog: catalog,
        initialRoute: '/video.layers?variant=top',
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final initial = tester
        .widget<VideoLayers>(find.byType(VideoLayers))
        .expansion;
    await tester.pump(const Duration(seconds: 1));
    expect(
      tester.widget<VideoLayers>(find.byType(VideoLayers)).expansion,
      initial,
    );
    await tester.drag(find.byType(ListView).last, const Offset(0, -500));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Play preview'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(
      tester.widget<VideoLayers>(find.byType(VideoLayers)).expansion,
      isNot(initial),
    );
    await tester.tap(find.byTooltip('Pause preview'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'Dithers autoplay with a pause control and respect reduced motion',
    (tester) async {
      final catalog = (await tester.runAsync(loadCatalog))!;
      final programs = (await tester.runAsync(DitherPrograms.load))!;
      binding.platformDispatcher.accessibilityFeaturesTestValue =
          FakeAccessibilityFeatures(disableAnimations: false);
      await tester.pumpWidget(
        ComponentBrowser(
          catalog: catalog,
          programs: programs,
          initialRoute: '/video.texture?variant=surface-accent',
        ),
      );
      await tester.pump();
      expect(find.byTooltip('Pause preview'), findsOneWidget);
      final first = tester
          .widget<VideoTexture>(find.byType(VideoTexture))
          .seconds;
      await tester.pump(const Duration(seconds: 1));
      expect(
        tester.widget<VideoTexture>(find.byType(VideoTexture)).seconds,
        isNot(first),
      );
      expect(
        tester.widget<VideoTexture>(find.byType(VideoTexture)).accentPalette,
        isTrue,
      );
      binding.platformDispatcher.accessibilityFeaturesTestValue =
          FakeAccessibilityFeatures(disableAnimations: true);
      await tester.pumpAndSettle();
      expect(find.byTooltip('Play preview'), findsOneWidget);
      final stopped = tester
          .widget<VideoTexture>(find.byType(VideoTexture))
          .seconds;
      await tester.pump(const Duration(seconds: 1));
      expect(
        tester.widget<VideoTexture>(find.byType(VideoTexture)).seconds,
        stopped,
      );
    },
  );
}
