import 'dart:convert';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import 'edit.dart';
import 'media.dart';

void main() => runApp(
  const FlutScript(workspace: String.fromEnvironment('FLUT_SCRIPT_WORKSPACE')),
);

class FlutScript extends StatelessWidget {
  const FlutScript({super.key, this.workspace = ''});
  final String workspace;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Flut Script',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff276452)),
      scaffoldBackgroundColor: const Color(0xfff7f7f2),
      useMaterial3: true,
    ),
    home: Editor(workspace: workspace),
  );
}

class Editor extends StatefulWidget {
  const Editor({super.key, required this.workspace});
  final String workspace;
  @override
  State<Editor> createState() => _EditorState();
}

class _EditorState extends State<Editor> {
  VideoPlayerController? player;
  String? source;
  double duration = 0;
  List<Passage> passages = [];
  Set<int> removed = {};
  List<Annotation> notes = [];
  final history = <Set<int>>[];
  bool busy = false;
  String query = '';
  int? selected;
  String status = 'Launch with: bash tool/open.sh /absolute/video.mp4';

  @override
  void initState() {
    super.initState();
    if (widget.workspace.isNotEmpty) task('Opening recording…', load);
  }

  Future<void> task(String label, Future<void> Function() action) async {
    if (!mounted) return;
    setState(() {
      busy = true;
      status = label;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => status = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> load() async {
    final project = jsonDecode(
      await File('${widget.workspace}/project.json').readAsString(),
    ) as Map;
    final path = project['source'] as String;
    final length = (project['source_duration'] as num).toDouble();
    final rows = parseTranscript(
      await File('${widget.workspace}/transcript.json').readAsString(),
      length,
    );
    final session = File('${widget.workspace}/session.json');
    final saved = await session.exists()
        ? jsonDecode(await session.readAsString()) as Map
        : null;
    final cuts = saved == null
        ? <int>{}
        : (saved['removed'] as List).cast<int>().toSet();
    if (cuts.any((i) => i < 0 || i >= rows.length)) {
      throw StateError('Saved cuts do not match transcript.');
    }
    final savedNotes = saved == null
        ? <Annotation>[]
        : (saved['notes'] as List)
              .map(
                (n) => Annotation.fromJson(Map<String, dynamic>.from(n as Map)),
              )
              .toList();
    final next = VideoPlayerController.file(File(path));
    try {
      await next.initialize();
    } catch (_) {
      await next.dispose();
      rethrow;
    }
    if (!mounted) {
      await next.dispose();
      return;
    }
    setState(() {
      player = next;
      source = path;
      duration = length;
      passages = rows;
      removed = cuts;
      notes = savedNotes;
      status = 'Click text to seek. Uncheck to cut. Notes and cuts save automatically.';
    });
  }

  Future<void> save() async {
    final temp = File('${widget.workspace}/session.json.tmp');
    await temp.writeAsString(
      const JsonEncoder.withIndent('  ').convert({
        'version': 1,
        'removed': removed.toList()..sort(),
        'notes': notes.map((n) => n.toJson()).toList(),
      }),
      flush: true,
    );
    await temp.rename('${widget.workspace}/session.json');
    if (mounted) {
      setState(() => status = 'Saved. Player shows original source time.');
    }
  }

  Future<void> seek(double time) async {
    await player!.seekTo(Duration(milliseconds: (time * 1000).round()));
    if (mounted) await player!.play();
  }

  Future<void> annotate({Passage? passage}) async {
    final position = (player?.value.position.inMilliseconds ?? 0) / 1000;
    var start = (passage?.start ?? position).toStringAsFixed(3);
    var end = (passage?.end ?? (position + 1).clamp(0, duration))
        .toStringAsFixed(3);
    var text = '';
    String? error;
    final result = await showDialog<Annotation>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Annotation for the next agent'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        initialValue: start,
                        onChanged: (value) => start = value,
                        decoration: const InputDecoration(
                          labelText: 'Source start (seconds)',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        initialValue: end,
                        onChanged: (value) => end = value,
                        decoration: const InputDecoration(
                          labelText: 'Source end (seconds)',
                        ),
                      ),
                    ),
                  ],
                ),
                TextFormField(
                  initialValue: text,
                  onChanged: (value) => text = value,
                  autofocus: true,
                  minLines: 3,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'What should happen here?',
                    hintText: 'Show a diagram explaining this passage…',
                  ),
                ),
                if (error != null)
                  Text(
                    error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final a = double.tryParse(start);
                final b = double.tryParse(end);
                if (a == null ||
                    b == null ||
                    !a.isFinite ||
                    !b.isFinite ||
                    a < 0 ||
                    b <= a ||
                    b > duration ||
                    text.trim().isEmpty) {
                  update(
                    () => error =
                        'Enter a note and a valid range within the recording.',
                  );
                  return;
                }
                Navigator.pop(
                  context,
                  Annotation(
                    'note-${DateTime.now().microsecondsSinceEpoch}',
                    a,
                    b,
                    text.trim(),
                  ),
                );
              },
              child: const Text('Add note'),
            ),
          ],
        ),
      ),
    );
    if (result == null || !mounted) return;
    setState(() => notes = [...notes, result]);
    await save();
  }

  Future<void> export() async {
    final parent = await getDirectoryPath(
      confirmButtonText: 'Export handoff here',
    );
    if (parent == null || !mounted) return;
    await save();
    if (mounted) {
      setState(() => status = 'Rendering media, transcript and annotations…');
    }
    final path = await exportBundle(
      source!,
      parent,
      passages,
      removed,
      notes,
      duration,
    );
    if (mounted) setState(() => status = 'Handoff exported: $path');
  }

  @override
  void dispose() {
    player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = player;
    final matches = [
      for (var i = 0; i < passages.length; i++)
        if (passages[i].text.toLowerCase().contains(query.toLowerCase())) i,
    ];
    final cutSeconds = removed.fold<double>(
      0,
      (sum, i) => sum + passages[i].end - passages[i].start,
    );
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Flut Script',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
              ),
              Text(
                source == null
                    ? 'One recording → cut, annotate, hand off.'
                    : source!.split('/').last,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: [
                  TextButton(
                    onPressed: busy || history.isEmpty
                        ? null
                        : () => task('Saving…', () async {
                            setState(() => removed = history.removeLast());
                            await save();
                          }),
                    child: const Text('Undo cut'),
                  ),
                  OutlinedButton(
                    onPressed: busy || player == null
                        ? null
                        : () => task('Adding annotation…', () => annotate()),
                    child: const Text('Annotate playhead'),
                  ),
                  FilledButton(
                    onPressed:
                        busy ||
                            passages.isEmpty ||
                            removed.length == passages.length
                        ? null
                        : () => task('Choose handoff folder…', export),
                    child: const Text('Export handoff'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: Column(
                        children: [
                          Expanded(
                            child: Center(
                              child: controller == null
                                  ? const Text(
                                      'Launch this editor with a video path.',
                                    )
                                  : AspectRatio(
                                      aspectRatio: controller.value.aspectRatio,
                                      child: VideoPlayer(controller),
                                    ),
                            ),
                          ),
                          if (controller != null)
                            ValueListenableBuilder<VideoPlayerValue>(
                              valueListenable: controller,
                              builder: (context, value, _) => Column(
                                children: [
                                  VideoProgressIndicator(
                                    controller,
                                    allowScrubbing: !busy,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 12,
                                    ),
                                  ),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      IconButton(
                                        tooltip: value.isPlaying
                                            ? 'Pause'
                                            : 'Play original',
                                        onPressed: () => value.isPlaying
                                            ? controller.pause()
                                            : controller.play(),
                                        icon: Icon(
                                          value.isPlaying
                                              ? Icons.pause
                                              : Icons.play_arrow,
                                        ),
                                      ),
                                      Flexible(
                                        child: Text(
                                          '${(value.position.inMilliseconds / 1000).toStringAsFixed(1)}s / ${duration.toStringAsFixed(1)}s · Source',
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          const Divider(),
                          Text('${notes.length} annotations'),
                          SizedBox(
                            height: 130,
                            child: ListView.builder(
                              itemCount: notes.length,
                              itemBuilder: (context, i) {
                                final n = notes[i];
                                return ListTile(
                                  dense: true,
                                  title: Text(
                                    n.text,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  subtitle: Text(
                                    '${n.start.toStringAsFixed(1)}–${n.end.toStringAsFixed(1)}s',
                                  ),
                                  onTap: busy
                                      ? null
                                      : () => task(
                                          'Seeking…',
                                          () => seek(n.start),
                                        ),
                                  trailing: IconButton(
                                    tooltip: 'Delete annotation',
                                    icon: const Icon(Icons.close),
                                    onPressed: busy
                                        ? null
                                        : () => task('Saving…', () async {
                                            setState(
                                              () =>
                                                  notes = List.of(notes)
                                                    ..removeAt(i),
                                            );
                                            await save();
                                          }),
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 20),
                    Expanded(
                      child: Column(
                        children: [
                          TextField(
                            onChanged: (value) => setState(() => query = value),
                            decoration: InputDecoration(
                              prefixIcon: const Icon(Icons.search),
                              hintText: 'Search transcript',
                              suffixText: '${matches.length} passages',
                              border: const OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Expanded(
                            child: Card(
                              clipBehavior: Clip.antiAlias,
                              child: ListView.builder(
                                itemCount: matches.length,
                                itemBuilder: (context, row) {
                                  final i = matches[row];
                                  final p = passages[i];
                                  return ListTile(
                                    selected: selected == i,
                                    leading: Checkbox(
                                      value: !removed.contains(i),
                                      onChanged: busy
                                          ? null
                                          : (_) => task('Saving…', () async {
                                              setState(() {
                                                history.add(Set.of(removed));
                                                removed = Set.of(removed);
                                                if (!removed.add(i)) {
                                                  removed.remove(i);
                                                }
                                              });
                                              await save();
                                            }),
                                    ),
                                    title: Text(
                                      p.text,
                                      style: TextStyle(
                                        decoration: removed.contains(i)
                                            ? TextDecoration.lineThrough
                                            : null,
                                        color: removed.contains(i)
                                            ? Colors.grey
                                            : null,
                                      ),
                                    ),
                                    subtitle: Text(
                                      '${p.start.toStringAsFixed(1)}–${p.end.toStringAsFixed(1)}s',
                                    ),
                                    trailing: IconButton(
                                      tooltip: 'Annotate passage',
                                      icon: const Icon(
                                        Icons.add_comment_outlined,
                                      ),
                                      onPressed: busy
                                          ? null
                                          : () => task(
                                              'Adding annotation…',
                                              () => annotate(passage: p),
                                            ),
                                    ),
                                    onTap: busy
                                        ? null
                                        : () => task('Seeking…', () async {
                                            setState(() => selected = i);
                                            await seek(p.start);
                                          }),
                                  );
                                },
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              if (busy) const LinearProgressIndicator(),
              if (passages.isNotEmpty)
                Text(
                  '${removed.length} passages cut · ${cutSeconds.toStringAsFixed(1)}s removed · ${(duration - cutSeconds).toStringAsFixed(1)}s output',
                ),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 70),
                child: SingleChildScrollView(child: SelectableText(status)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
