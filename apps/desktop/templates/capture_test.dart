import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluvie/fluvie.dart' show Video;
import 'package:fluvie/rendering.dart';

import '__TARGET__' as target;

import 'package:__PROJECT_PACKAGE__/prepare.dart' as preparation;

import 'timeline_thumbnails.dart';

import 'dart:io';

// App-owned adapter. The pinned CLI's plain .dart adapter calls build synchronously.
// Its supported --harness option lets both capture paths preload on a real loop.
void main() {
  testWidgets('CMRX capture', (tester) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final video = await tester.runAsync<Video>(() async {
      await preparation.prepareGraphics();
      return await target.build();
    });
    if (video == null) throw StateError('No composition returned');
    final host = RenderHostContext(
      pumpWidget: tester.pumpWidget,
      pumpFrame: () => tester.pump(),
      setViewSize: (width, height) {
        tester.view.physicalSize = Size(width.toDouble(), height.toDouble());
        tester.view.devicePixelRatio = 1;
      },
      runAsync: tester.runAsync,
    );
    await runFluvieRender(video: video, videoFactory: target.build, host: host);
    if (__CAPTURE_THUMBNAILS__) {
      try {
        await captureTimelineThumbnails(tester, host);
      } catch (error) {
        File('/work/graphics-thumbnails-error.txt')
            .writeAsStringSync(error.toString());
      }
      await tester.pumpWidget(const SizedBox());
      while (tester.takeException() != null) {}
    }
  }, timeout: Timeout.none);
}
