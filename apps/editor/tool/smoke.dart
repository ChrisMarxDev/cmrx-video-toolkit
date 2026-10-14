import 'dart:convert';
import 'dart:io';

import 'package:flut_script/edit.dart';
import 'package:flut_script/media.dart';

Future<void> main() async {
  final temp = await Directory.systemTemp.createTemp('flut-script-smoke-');
  try {
    final source = '${temp.path}/source.mp4';
    await runTool('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x120:rate=30:duration=4',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=4',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-shortest',
      source,
    ]);
    final output = await exportBundle(
      source,
      temp.path,
      [
        const Passage(0, 1, 'First'),
        const Passage(1, 2, 'Cut'),
        const Passage(2, 4, 'Last'),
      ],
      {1},
      [
        const Annotation('across', 0.5, 2.5, 'Show diagram'),
        const Annotation('gone', 1.1, 1.9, 'Removed note'),
      ],
      4,
    );
    final timeline =
        jsonDecode(await File('$output/timeline.json').readAsString()) as Map;
    if (timeline['duration'] != 3 ||
        timeline['notes'][0]['output_windows'].length != 2 ||
        timeline['notes'][1]['status'] != 'removed-by-edit') {
      throw StateError('Incorrect time mapping');
    }
    final srt = await File('$output/transcript.srt').readAsString();
    if (!srt.contains('00:00:01,000 --> 00:00:03,000\nLast')) {
      throw StateError('Incorrect subtitle times');
    }
    for (final name in [
      'edited.mp4',
      'audio.wav',
      'transcript.json',
      'annotations.json',
      'annotations.resolved.json',
      'HANDOFF.md',
    ]) {
      if (!await File('$output/$name').exists()) {
        throw StateError('Missing $name');
      }
    }
    final before = await File(source).length();
    var refused = false;
    try {
      await exportVideo(source, source, [const Passage(0, 1, '')]);
    } catch (_) {
      refused = true;
    }
    if (!refused || await File(source).length() != before) {
      throw StateError('Source protection failed');
    }
    stdout.writeln(
      'PASS: real FFmpeg export, duration, SRT, split/removed annotations, handoff files, source protection.',
    );
  } finally {
    await temp.delete(recursive: true);
  }
}
