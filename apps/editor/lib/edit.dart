import 'dart:convert';

class Passage {
  const Passage(this.start, this.end, this.text);
  final double start;
  final double end;
  final String text;
}

List<Passage> parseTranscript(String json, double duration) {
  final data = jsonDecode(json) as Map<String, dynamic>;
  final rows = data['transcription'] as List;
  final result = <Passage>[];
  for (final row in rows) {
    final offsets = row['offsets'] as Map;
    final start = (offsets['from'] as num).toDouble() / 1000;
    final end = (offsets['to'] as num).toDouble() / 1000;
    if (!start.isFinite ||
        !end.isFinite ||
        start < 0 ||
        end <= start ||
        start >= duration ||
        (result.isNotEmpty && start < result.last.end)) {
      throw const FormatException(
        'Transcript has invalid or overlapping times.',
      );
    }
    result.add(
      Passage(start, end.clamp(0, duration), (row['text'] as String).trim()),
    );
  }
  if (result.isEmpty) throw const FormatException('No speech found.');
  return result;
}

// Delete only selected speech intervals. Preserve silence and all untouched media.
List<Passage> retainedSpans(
  List<Passage> passages,
  Set<int> removed,
  double duration,
) {
  final result = <Passage>[];
  var cursor = 0.0;
  for (var i = 0; i < passages.length; i++) {
    if (!removed.contains(i)) continue;
    final p = passages[i];
    if (p.start > cursor) result.add(Passage(cursor, p.start, ''));
    cursor = p.end;
  }
  if (cursor < duration) result.add(Passage(cursor, duration, ''));
  return result;
}

String exportFilter(List<Passage> spans) {
  if (spans.isEmpty) throw StateError('Nothing to export.');
  final filters = <String>[];
  for (var i = 0; i < spans.length; i++) {
    final p = spans[i];
    filters.add(
      '[0:v:0]trim=start=${p.start}:end=${p.end},setpts=PTS-STARTPTS[v$i]',
    );
    filters.add(
      '[0:a:0]atrim=start=${p.start}:end=${p.end},asetpts=PTS-STARTPTS[a$i]',
    );
  }
  filters.add(
    '${List.generate(spans.length, (i) => '[v$i][a$i]').join()}'
    'concat=n=${spans.length}:v=1:a=1[v][a]',
  );
  return filters.join(';');
}

class Annotation {
  const Annotation(this.id, this.start, this.end, this.text);
  final String id;
  final double start;
  final double end;
  final String text;
  Map<String, Object> toJson() => {
    'id': id,
    'source_start': start,
    'source_end': end,
    'intent': text,
    'component': '',
    'presentation': 'overlay',
  };
  factory Annotation.fromJson(Map<String, dynamic> row) => Annotation(
    row['id'] as String,
    (row['source_start'] as num).toDouble(),
    (row['source_end'] as num).toDouble(),
    row['intent'] as String,
  );
}

List<Map<String, double>> timelineSpans(List<Passage> spans) {
  var output = 0.0;
  return spans.map((p) {
    final start = output;
    output += p.end - p.start;
    return {
      'source_start': p.start,
      'source_end': p.end,
      'output_start': start,
      'output_end': output,
    };
  }).toList();
}

List<Map<String, double>> resolveRange(
  double start,
  double end,
  List<Map<String, double>> spans,
) {
  final windows = <Map<String, double>>[];
  for (final span in spans) {
    final a = start > span['source_start']! ? start : span['source_start']!;
    final b = end < span['source_end']! ? end : span['source_end']!;
    if (b > a) {
      windows.add({
        'source_start': a,
        'source_end': b,
        'output_start': span['output_start']! + a - span['source_start']!,
        'output_end': span['output_start']! + b - span['source_start']!,
      });
    }
  }
  return windows;
}

String srtTime(double seconds) {
  final ms = (seconds * 1000).round();
  String pad(int n, int width) => n.toString().padLeft(width, '0');
  return '${pad(ms ~/ 3600000, 2)}:${pad(ms ~/ 60000 % 60, 2)}:'
      '${pad(ms ~/ 1000 % 60, 2)},${pad(ms % 1000, 3)}';
}

Map<String, dynamic> handoff(
  List<Passage> passages,
  Set<int> removed,
  List<Annotation> notes,
  double duration,
  String revision,
) {
  final spans = timelineSpans(retainedSpans(passages, removed, duration));
  final segments = <Map<String, Object>>[];
  for (var i = 0; i < passages.length; i++) {
    if (removed.contains(i)) continue;
    final p = passages[i];
    for (final window in resolveRange(p.start, p.end, spans)) {
      segments.add({'id': 's$i', 'text': p.text, ...window});
    }
  }
  return {
    'version': 1,
    'schema': 'flut-script-segments-v1',
    'revision': revision,
    'timestamp_unit': 'seconds',
    'granularity': 'segment',
    'source_duration': duration,
    'duration': spans.isEmpty ? 0.0 : spans.last['output_end'],
    'spans': spans,
    'segments': segments,
    'notes': notes.map((n) {
      final windows = resolveRange(n.start, n.end, spans);
      return {
        ...n.toJson(),
        'output_windows': windows,
        'status': windows.isEmpty ? 'removed-by-edit' : 'retained',
      };
    }).toList(),
  };
}

String subtitles(List<dynamic> segments) => segments
    .asMap()
    .entries
    .map((e) {
      final s = e.value as Map;
      return '${e.key + 1}\n${srtTime(s['output_start'] as double)} --> '
          '${srtTime(s['output_end'] as double)}\n${s['text']}\n';
    })
    .join('\n');
