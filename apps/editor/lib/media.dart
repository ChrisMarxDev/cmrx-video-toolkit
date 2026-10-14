import 'dart:io';
import 'dart:convert';

import 'edit.dart';

String executable(String name) {
  for (final dir in ['/opt/homebrew/bin', '/usr/local/bin']) {
    if (File('$dir/$name').existsSync()) return '$dir/$name';
  }
  return name;
}

Future<void> runTool(String name, List<String> args) async {
  final result = await Process.run(executable(name), args);
  if (result.exitCode != 0) {
    final message = '${result.stderr}';
    throw Exception(
      '$name failed (${result.exitCode}):\n'
      '${message.length > 2000 ? message.substring(message.length - 2000) : message}',
    );
  }
}

Future<void> prepare(String source, String workspace, String model) async {
  if (!await File(source).exists()) {
    throw StateError('Video does not exist: $source');
  }
  if (!await File(model).exists()) {
    throw StateError('Whisper model not found: $model');
  }
  final dir = Directory(workspace);
  if (await dir.exists()) {
    final project = File('$workspace/project.json');
    if (await project.exists() &&
        (jsonDecode(await project.readAsString()) as Map)['source'] == source &&
        await File('$workspace/transcript.json').exists()) {
      return;
    }
    throw StateError(
      'Workspace already exists but is incomplete or belongs to another video. Choose a new workspace.',
    );
  }
  await dir.create(recursive: true);
  final probe = await Process.run(executable('ffprobe'), [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    source,
  ]);
  if (probe.exitCode != 0) {
    throw StateError('Could not inspect video: ${probe.stderr}');
  }
  final metadata = jsonDecode(probe.stdout as String) as Map;
  final streams = metadata['streams'] as List;
  if (!streams.any((s) => s['codec_type'] == 'video') ||
      !streams.any((s) => s['codec_type'] == 'audio')) {
    throw StateError('This prototype needs one video with an audio track.');
  }
  final duration = double.parse(metadata['format']['duration'] as String);
  if (!duration.isFinite || duration <= 0) {
    throw StateError('Invalid media duration.');
  }
  // Keep full-quality extracted audio, plus the 16 kHz mono Whisper input.
  await runTool('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-n',
    '-i',
    source,
    '-map',
    '0:v:0',
    '-an',
    '-c:v',
    'copy',
    '$workspace/video.mkv',
    '-map',
    '0:a:0',
    '-vn',
    '-c:a',
    'pcm_s16le',
    '$workspace/audio.wav',
  ]);
  await runTool('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-n',
    '-i',
    '$workspace/audio.wav',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    '$workspace/whisper.wav',
  ]);
  await runTool('whisper-cli', [
    '-m',
    model,
    '-f',
    '$workspace/whisper.wav',
    '-l',
    'auto',
    '-oj',
    '-of',
    '$workspace/transcript',
  ]);
  parseTranscript(
    await File('$workspace/transcript.json').readAsString(),
    duration,
  );
  await File('$workspace/project.json').writeAsString(
    jsonEncode({
      'version': 1,
      'source': source,
      'source_duration': duration,
      'transcription_engine': 'whisper.cpp',
      'model': model,
    }),
  );
}

Future<void> exportVideo(
  String source,
  String destination,
  List<Passage> spans,
) async {
  // Refuse existing outputs, including symlinks: originals are never overwritten.
  if (await FileSystemEntity.type(destination) !=
      FileSystemEntityType.notFound) {
    throw StateError(
      'Choose a new filename. Existing files are never overwritten.',
    );
  }
  final temp = await Directory.systemTemp.createTemp('flut-script-export-');
  try {
    final filter = File('${temp.path}/filter.txt');
    await filter.writeAsString(exportFilter(spans));
    await runTool('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-n',
      '-i',
      source,
      '-filter_complex_script',
      filter.path,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      '${temp.path}/cut.mp4',
    ]);
    // Exclusive creation protects against overwriting a file created during export.
    await File(destination).create(exclusive: true);
    await File('${temp.path}/cut.mp4').copy(destination);
  } finally {
    await temp.delete(recursive: true);
  }
}

Future<String> exportBundle(
  String source,
  String parent,
  List<Passage> passages,
  Set<int> removed,
  List<Annotation> notes,
  double duration,
) async {
  final dir = await Directory(parent).createTemp('.flut-script-render-');
  try {
    final revision = DateTime.now().toUtc().toIso8601String();
    final data = handoff(passages, removed, notes, duration, revision);
    final spans = retainedSpans(passages, removed, duration);
    await exportVideo(source, '${dir.path}/edited.mp4', spans);
    await runTool('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-n',
      '-i',
      '${dir.path}/edited.mp4',
      '-vn',
      '-c:a',
      'pcm_s16le',
      '${dir.path}/audio.wav',
    ]);
    final probe = await Process.run(executable('ffprobe'), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      '${dir.path}/edited.mp4',
    ]);
    final actual = double.tryParse((probe.stdout as String).trim());
    if (probe.exitCode != 0 ||
        actual == null ||
        (actual - (data['duration'] as num)).abs() > 0.15) {
      throw StateError(
        'Export timing differs from timeline; handoff was not published.',
      );
    }
    data['rendered_duration'] = actual;
    final encoder = const JsonEncoder.withIndent('  ');
    await File('${dir.path}/timeline.json')
        .writeAsString(encoder.convert(data));
    await File('${dir.path}/transcript.json').writeAsString(
      encoder.convert({
        'version': 1,
        'timeline_revision': revision,
        'timestamp_unit': 'seconds',
        'granularity': 'segment',
        'segments': data['segments'],
      }),
    );
    await File('${dir.path}/transcript.srt')
        .writeAsString(subtitles(data['segments'] as List));
    await File('${dir.path}/annotations.json').writeAsString(
      encoder.convert({
        'version': 1,
        'notes': notes.map((n) => n.toJson()).toList(),
      }),
    );
    await File('${dir.path}/annotations.resolved.json').writeAsString(
      encoder.convert({
        'version': 1,
        'timeline_revision': revision,
        'notes': data['notes'],
      }),
    );
    await File('${dir.path}/HANDOFF.md')
        .writeAsString('''# Flut Script agent handoff

Use edited.mp4 as the footage and audio.wav as the extracted edited audio.
transcript.srt uses EDITED OUTPUT time. transcript.json contains segment text
with both source and output times. These are Whisper segment timestamps, NOT
word-level alignment. Do not invent word timestamps.

timeline.json is the authoritative mapping for this export (revision: $revision).
annotations.json stores original source ranges; annotations.resolved.json stores
output windows. A note crossing a cut has multiple windows; a fully removed note
has no windows and status removed-by-edit. Never relocate a deleted note.

Review the rough cut before detailed Fluvie animation. Preserve narration timing.
Original recording: $source

This standalone segment schema is not a drop-in word-based edit import. Adapt it
explicitly if using the parent repository's word-based pipeline. Edits are
quantized by video frames; rendered duration has been checked within 150 ms.
''');
    final published =
        '${dir.parent.path}/flut-script-export-${DateTime.now().microsecondsSinceEpoch}';
    await dir.rename(published);
    return published;
  } catch (_) {
    if (await dir.exists()) await dir.delete(recursive: true);
    rethrow;
  }
}
