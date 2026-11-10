import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/widgets.dart' hide Clip;
import 'package:fluvie/fluvie.dart';
import 'graphics.dart';
import 'prepare.dart';

// project.json is the shared media edit. Keep media source/time mapping here.
Future<Video> build() async {
  await prepareGraphics();
  final p = jsonDecode(File('/work/project.json').readAsStringSync()) as Map<String, dynamic>;
  final assets = {for (final a in p['assets']) a['id']: a};
  final clips = List<Map<String, dynamic>>.from(p['clips'])
    ..sort((a, b) => (a['track'] as num).compareTo(b['track'] as num));
  final layers = Map<String, dynamic>.from(p['layers'] ?? {});
  final duration = clips.fold<double>(0, (v, c) => math.max(v, (c['start'] + c['duration']).toDouble()));
  return Video(size: VideoSize(p['width'], p['height']), fps: p['fps'], scenes: [
    Scene(duration: Time.seconds(math.max(duration, 1)), children: [
      const Positioned.fill(child: ColoredBox(color: Color(0xFF17171B))),
      for (final c in clips)
        if (c['kind'] == 'video' && layers['${c['track']}']?['disabled'] != true)
          Positioned(left: (c['x'] as num).toDouble(), top: (c['y'] as num).toDouble(),
            width: (c['width'] as num).toDouble(), height: (c['height'] as num).toDouble(),
            child: Clip.file('/work/${assets[c['assetId']]['path']}',
              trim: Time.seconds((c['in'] as num).toDouble()).to(Time.seconds((c['in'] + c['duration']).toDouble())),
              audio: c['muted'] == true || layers['${c['track']}']?['muted'] == true
                ? const ClipAudio.muted() : ClipAudio.included(volume: (c['volume'] as num? ?? 1).toDouble()),
              fit: BoxFit.contain,
            ).show(from: Time.seconds((c['start'] as num).toDouble()), to: Time.seconds((c['start'] + c['duration']).toDouble()))),
      // ignore: experimental_member_use
      Positioned.fill(child: FrameBuilder((ctx) => buildGraphics(ctx.frame / ctx.fps, p))),
    ]),
  ]);
}
void main() {}
