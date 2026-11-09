import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:fluvie/fluvie.dart';
import 'package:__PROJECT_PACKAGE__/_cmrx_render/graphics_stack.dart';
import 'package:__PROJECT_PACKAGE__/prepare.dart';

// App-owned alpha cache. The editor composites it over live media at the same time.
Future<Video> build() async {
  await prepareGraphics();
  final p = jsonDecode(File('/work/project.json').readAsStringSync()) as Map<String, dynamic>;
  final duration = (p['clips'] as List).fold<double>(0,
    (n, c) => math.max(n, (c['start'] + c['duration']).toDouble()));
  return Video(size: VideoSize(p['width'], p['height']), fps: p['fps'], scenes: [
    Scene(duration: Time.seconds(math.max(1, duration)), children: [
      // ignore: experimental_member_use
      Positioned.fill(child: FrameBuilder((ctx) => buildGraphics(ctx.frame / ctx.fps, p))),
    ]),
  ]);
}
void main() {}
