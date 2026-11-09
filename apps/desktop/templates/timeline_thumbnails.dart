import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluvie/rendering.dart';
import 'package:__PROJECT_PACKAGE__/_cmrx_render/graphics_stack.dart'
    as graphics;

// Low-cost isolated layer captures reuse the initialized renderer and loaded
// project assets. They are derived filmstrips, never authored timeline media.
Future<void> captureTimelineThumbnails(
  WidgetTester tester,
  RenderHostContext host,
) async {
  final manifest = jsonDecode(
    File('/work/project.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final clips = (manifest['clips'] as List)
      .where((c) => c['kind'] == 'graphics')
      .take(128)
      .toList();
  if (clips.isEmpty) return;
  const width = 96, height = 54, columns = 12, samples = 4;
  final images = <ui.Image>[];
  final metadata = <String, dynamic>{};
  final canvasWidth = (manifest['width'] as num).toDouble();
  final canvasHeight = (manifest['height'] as num).toDouble();
  final scale = math.min(1.0, 960 / math.max(canvasWidth, canvasHeight));
  tester.view.physicalSize = Size(canvasWidth * scale, canvasHeight * scale);
  tester.view.devicePixelRatio = 1;
  for (final raw in clips) {
    final firstImage = images.length;
    final clip = Map<String, dynamic>.from(raw);
    final interval = (clip['duration'] as num).toDouble() / samples;
    metadata[clip['id']] = {
      'interval': interval,
      'count': samples,
      'columns': columns,
      'offset': images.length,
      'sourceStart': clip['in'],
      'peakRate': 100,
      'errors': <String>[],
    };
    for (var i = 0; i < samples; i++) {
      final time = (clip['start'] as num).toDouble() + interval * (i + .5);
      final isolated = {
        ...manifest,
        'clips': [clip],
        'layers': <String, dynamic>{},
      };
      final key = GlobalKey();
      await tester.pumpWidget(
        DefaultAssetBundle(
          bundle: host.assets,
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: MediaQuery(
              data: MediaQueryData(
                size: Size(
                  (manifest['width'] as num).toDouble(),
                  (manifest['height'] as num).toDouble(),
                ),
              ),
              child: DefaultTextStyle(
                style: const TextStyle(color: Color(0xffffffff)),
                child: RepaintBoundary(
                  key: key,
                  child: FittedBox(
                    fit: BoxFit.contain,
                    child: SizedBox(
                      width: (manifest['width'] as num).toDouble(),
                      height: (manifest['height'] as num).toDouble(),
                      child: graphics.buildGraphics(time, isolated),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      final error = tester.takeException();
      if (error != null) throw StateError('Layer thumbnail failed: $error');
      final boundary =
          key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await tester.runAsync(
        () => boundary.toImage(pixelRatio: 2),
      );
      if (image == null) throw StateError('No thumbnail captured');
      images.add(image);
    }
    // Sparse graphics (badges, small icons) would otherwise be unreadable at
    // filmstrip size. Use one stable content crop across the clip's samples.
    Rect? bounds;
    await tester.runAsync(() async {
      for (final image in images.skip(firstImage)) {
        final bytes = await image.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        if (bytes == null) continue;
        final stride = math.max(1, image.width ~/ 480);
        var left = image.width, top = image.height, right = -1, bottom = -1;
        for (var y = 0; y < image.height; y += stride)
          for (var x = 0; x < image.width; x += stride) {
            if (bytes.getUint8((y * image.width + x) * 4 + 3) <= 8) continue;
            left = math.min(left, x);
            top = math.min(top, y);
            right = math.max(right, x);
            bottom = math.max(bottom, y);
          }
        if (right >= 0) {
          final box = Rect.fromLTRB(
            left.toDouble(),
            top.toDouble(),
            (right + stride).toDouble(),
            (bottom + stride).toDouble(),
          );
          bounds = bounds?.expandToInclude(box) ?? box;
        }
      }
    });
    final full = Rect.fromLTWH(
      0,
      0,
      images[firstImage].width.toDouble(),
      images[firstImage].height.toDouble(),
    );
    final crop =
        bounds != null &&
            bounds!.width * bounds!.height < full.width * full.height * .35
        ? bounds!.inflate(math.max(2, bounds!.longestSide * .1)).intersect(full)
        : full;
    metadata[clip['id']]['cropped'] = crop != full;
    // Keep only tiny output tiles; full-size capture memory is bounded to one
    // layer rather than growing with every clip in a long project.
    for (var i = firstImage; i < images.length; i++) {
      final image = images[i], recorder = ui.PictureRecorder();
      Canvas(recorder).drawImageRect(
        image,
        crop,
        Alignment.center.inscribe(
          applyBoxFit(
            BoxFit.contain,
            crop.size,
            const Size(96, 54),
          ).destination,
          const Rect.fromLTWH(0, 0, 96, 54),
        ),
        Paint()..filterQuality = FilterQuality.high,
      );
      final picture = recorder.endRecording();
      final tile = await tester.runAsync(() => picture.toImage(width, height));
      picture.dispose();
      image.dispose();
      if (tile == null) throw StateError('No frame preview');
      images[i] = tile;
    }
  }
  final recorder = ui.PictureRecorder(), canvas = Canvas(recorder);
  for (var i = 0; i < images.length; i++)
    canvas.drawImage(
      images[i],
      Offset(
        (i % columns * width).toDouble(),
        (i ~/ columns * height).toDouble(),
      ),
      Paint(),
    );
  final picture = recorder.endRecording();
  await tester.runAsync(() async {
    final sheet = await picture.toImage(
      columns * width,
      ((images.length + columns - 1) ~/ columns) * height,
    );
    final bytes = await sheet.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) throw StateError('No thumbnail sheet');
    await File('/work/graphics-thumbnails.png')
        .writeAsBytes(bytes.buffer.asUint8List());
    await File('/work/graphics-thumbnails.json')
        .writeAsString(jsonEncode(metadata));
    sheet.dispose();
  });
  picture.dispose();
  for (final image in images) image.dispose();
}
