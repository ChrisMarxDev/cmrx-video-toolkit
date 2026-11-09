import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:fluvie/fluvie.dart';
import 'package:__PROJECT_PACKAGE__/_cmrx_render/graphics_stack.dart';
import 'package:__PROJECT_PACKAGE__/prepare.dart';

// App-owned alpha cache. The editor composites it over live media at the same time.
Future<Video> build({int? previewTrack}) async {
  await prepareGraphics();
  final p = jsonDecode(File('/work/project.json').readAsStringSync()) as Map<String, dynamic>;
  if (previewTrack != null) {
    final layers = Map<String, dynamic>.from(p['layers'] ?? {});
    if (layers['$previewTrack']?['disabled'] == true) {
      layers['$previewTrack'] = {...Map<String, dynamic>.from(layers['$previewTrack'] ?? {}), 'disabled': false};
      p['layers'] = layers;
    }
  }
  final duration = (p['clips'] as List).fold<double>(0,
    (n, c) => math.max(n, (c['start'] + c['duration']).toDouble()));
  return Video(size: VideoSize(p['width'], p['height']), fps: p['fps'], scenes: [
    Scene(duration: Time.seconds(math.max(1, duration)), children: [
      // ignore: experimental_member_use
      Positioned.fill(child: FrameBuilder((ctx) => buildGraphics(ctx.frame / ctx.fps, p, previewTrack: previewTrack))),
    ]),
  ]);
}
void main() {}
