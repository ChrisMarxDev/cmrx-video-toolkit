import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A scalar property. Times are local seconds; curves use Flutter Cubic semantics.
class MotionTrack {
  MotionTrack({
    required this.id,
    required this.unit,
    required this.from,
    required this.to,
    required this.min,
    required this.max,
    this.start = 0,
    this.duration = .6,
    List<double> curve = const [.22, 1, .36, 1],
  }) : curve = List.of(curve);
  final String id, unit;
  final double min, max;
  double start, duration, from, to;
  List<double> curve;

  double valueAt(double seconds) {
    final t = ((seconds - start) / duration).clamp(0.0, 1.0);
    final eased = Cubic(curve[0], curve[1], curve[2], curve[3]).transform(t);
    return from + (to - from) * eased;
  }

  MotionTrack copy() => MotionTrack(
        id: id,
        unit: unit,
        min: min,
        max: max,
        start: start,
        duration: duration,
        from: from,
        to: to,
        curve: curve,
      );

  Map<String, Object> toJson() => {
        'id': id,
        'unit': unit,
        'startSeconds': start,
        'durationSeconds': duration,
        'from': from,
        'to': to,
        'curve': curve,
      };
}

typedef WorkshopBuilder = Widget Function(
  BuildContext context,
  double seconds,
  Map<String, double> values,
);

class AnimationWorkshop extends StatelessWidget {
  const AnimationWorkshop({
    super.key,
    required this.target,
    required this.source,
    required this.tracks,
    required this.builder,
    this.seconds = 3,
    this.fps = 30,
    this.canvas = const Size(640, 360),
    this.outputStartSeconds = 0,
  });
  final String target, source;
  final List<MotionTrack> tracks;
  final WorkshopBuilder builder;
  final double seconds, outputStartSeconds;
  final int fps;
  final Size canvas;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff0c66e4)),
        ),
        home: _Workshop(config: this),
      );
}

class _Workshop extends StatefulWidget {
  const _Workshop({required this.config});
  final AnimationWorkshop config;
  @override
  State<_Workshop> createState() => _WorkshopState();
}

class _WorkshopState extends State<_Workshop>
    with SingleTickerProviderStateMixin {
  late final AnimationController clock;
  late List<MotionTrack> tracks;
  int selected = 0;
  bool loop = true;
  double speed = 1;
  AnimationWorkshop get config => widget.config;
  int get lastFrame => (config.seconds * config.fps).ceil() - 1;
  int get frame =>
      math.min(lastFrame, (clock.value * config.seconds * config.fps).floor());
  double get seconds => frame / config.fps;
  MotionTrack get track => tracks[selected];

  @override
  void initState() {
    super.initState();
    if (config.tracks.isEmpty ||
        config.fps <= 0 ||
        !config.seconds.isFinite ||
        config.seconds * config.fps < 2 ||
        config.canvas.width <= 0 ||
        config.canvas.height <= 0 ||
        config.tracks.map((t) => t.id).toSet().length != config.tracks.length) {
      throw ArgumentError(
        'Use unique tracks, a positive canvas and at least two frames.',
      );
    }
    for (final t in config.tracks) {
      if (!(t.min < t.max &&
              t.from >= t.min &&
              t.from <= t.max &&
              t.to >= t.min &&
              t.to <= t.max &&
              t.start >= 0 &&
              t.duration >= 1 / config.fps &&
              t.start + t.duration <= config.seconds) ||
          t.curve.length != 4 ||
          t.curve.any((v) => !v.isFinite || v < 0 || v > 1)) {
        throw ArgumentError('Invalid bounds, timing or curve for ${t.id}');
      }
    }
    tracks = config.tracks.map((t) => t.copy()).toList();
    clock = AnimationController(vsync: this, duration: _duration)
      ..addListener(() => setState(() {}))
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed && loop) clock.forward(from: 0);
      });
  }

  Duration get _duration =>
      Duration(microseconds: (config.seconds / speed * 1e6).round());
  @override
  void dispose() {
    clock.dispose();
    super.dispose();
  }

  void seek(int f) {
    clock.stop();
    clock.value = f.clamp(0, lastFrame) / (config.seconds * config.fps);
    setState(() {});
  }

  String settings() => const JsonEncoder.withIndent('  ').convert({
        'schemaVersion': 1,
        'target': config.target,
        'source': config.source,
        'timeOrigin': 'scene-local',
        'outputStartSeconds': config.outputStartSeconds,
        'preview': {
          'fps': config.fps,
          'durationSeconds': config.seconds,
          'canvasWidth': config.canvas.width,
          'canvasHeight': config.canvas.height,
        },
        'curveType': 'flutter-cubic',
        'tracks': tracks.map((t) => t.toJson()).toList(),
      });

  Future<void> export() async {
    clock.stop();
    setState(() {});
    final json = settings();
    // Always expose selectable text, even when clipboard permissions fail.
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Animation settings'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(child: SelectableText(json)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Close'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                await Clipboard.setData(ClipboardData(text: json));
                if (dialogContext.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Settings copied')),
                  );
                }
              } catch (_) {
                if (dialogContext.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Select the text and copy it manually.'),
                    ),
                  );
                }
              }
            },
            child: const Text('Copy JSON'),
          ),
        ],
      ),
    );
  }

  Widget number(
    String label,
    double value,
    double min,
    double max,
    ValueChanged<double> change,
  ) =>
      Row(
        children: [
          SizedBox(width: 105, child: Text(label)),
          Expanded(
            child: Slider(
              value: value.clamp(min, max),
              min: min,
              max: max,
              onChanged: max > min ? (v) => setState(() => change(v)) : null,
            ),
          ),
          SizedBox(
            width: 82,
            child: TextFormField(
              key: ValueKey('$selected:$label:$value'),
              initialValue: value.toStringAsFixed(3),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
                signed: true,
              ),
              decoration: const InputDecoration(isDense: true),
              onFieldSubmitted: (text) {
                final v = double.tryParse(text);
                if (v != null && v.isFinite)
                  setState(() => change(v.clamp(min, max)));
              },
            ),
          ),
        ],
      );

  Widget inspector() => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          DropdownButton<int>(
            value: selected,
            isExpanded: true,
            items: [
              for (var i = 0; i < tracks.length; i++)
                DropdownMenuItem(value: i, child: Text(tracks[i].id)),
            ],
            onChanged: (v) => setState(() => selected = v!),
          ),
          Text(
            'Values in ${track.unit}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          number(
            'Start (s)',
            track.start,
            0,
            config.seconds - track.duration,
            (v) => track.start = v,
          ),
          number(
            'Duration (s)',
            track.duration,
            1 / config.fps,
            config.seconds - track.start,
            (v) => track.duration = v,
          ),
          number(
              'From', track.from, track.min, track.max, (v) => track.from = v),
          number('To', track.to, track.min, track.max, (v) => track.to = v),
          const SizedBox(height: 20),
          const Text('Easing · drag either handle'),
          Wrap(
            spacing: 6,
            children: [
              for (final preset in <String, List<double>>{
                'Linear': [0, 0, 1, 1],
                'Ease': [.25, .1, .25, 1],
                'Ease out': [.22, 1, .36, 1],
                'Ease in/out': [.42, 0, .58, 1],
              }.entries)
                ActionChip(
                  label: Text(preset.key),
                  onPressed: () =>
                      setState(() => track.curve = List.of(preset.value)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 180,
            child: _CurveEditor(
              points: track.curve,
              onChanged: (p) => setState(() => track.curve = p),
            ),
          ),
          for (var i = 0; i < 4; i++)
            number(
              ['x1', 'y1', 'x2', 'y2'][i],
              track.curve[i],
              0,
              1,
              (v) => track.curve[i] = v,
            ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () => setState(() {
              tracks[selected] = config.tracks[selected].copy();
            }),
            child: const Text('Reset selected track'),
          ),
        ],
      );

  Widget player() => Column(
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: FittedBox(
                child: SizedBox(
                  width: config.canvas.width,
                  height: config.canvas.height,
                  child: ClipRect(
                    child: ColoredBox(
                      color: const Color(0xffeef1f5),
                      child: config.builder(context, seconds, {
                        for (final t in tracks) t.id: t.valueAt(seconds),
                      }),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Slider(
              label: '$frame',
              value: frame.toDouble(),
              max: lastFrame.toDouble(),
              divisions: lastFrame,
              onChanged: (v) => seek(v.round()),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                IconButton(
                  tooltip: 'Previous frame',
                  onPressed: () => seek(frame - 1),
                  icon: const Icon(Icons.skip_previous),
                ),
                FilledButton.tonalIcon(
                  onPressed: () => setState(() {
                    if (clock.isAnimating) {
                      clock.stop();
                    } else {
                      clock.forward(from: frame >= lastFrame ? 0 : clock.value);
                    }
                  }),
                  icon:
                      Icon(clock.isAnimating ? Icons.pause : Icons.play_arrow),
                  label: Text(clock.isAnimating ? 'Pause' : 'Play'),
                ),
                IconButton(
                  tooltip: 'Next frame',
                  onPressed: () => seek(frame + 1),
                  icon: const Icon(Icons.skip_next),
                ),
                Text('${seconds.toStringAsFixed(3)} s · frame $frame'),
                FilterChip(
                  label: const Text('Loop'),
                  selected: loop,
                  onSelected: (v) => setState(() => loop = v),
                ),
                DropdownButton<double>(
                  value: speed,
                  items: [
                    for (final v in [.25, .5, 1.0])
                      DropdownMenuItem(value: v, child: Text('${v}×')),
                  ],
                  onChanged: (v) => setState(() {
                    final playing = clock.isAnimating;
                    clock.stop();
                    speed = v!;
                    clock.duration = _duration;
                    if (playing) clock.forward();
                  }),
                ),
              ],
            ),
          ),
        ],
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(config.target),
          actions: [
            TextButton.icon(
              onPressed: export,
              icon: const Icon(Icons.copy),
              label: const Text('Copy settings'),
            ),
            const SizedBox(width: 12),
          ],
        ),
        body: LayoutBuilder(
          builder: (context, box) => box.maxWidth >= 900
              ? Row(
                  children: [
                    Expanded(child: player()),
                    const VerticalDivider(width: 1),
                    SizedBox(width: 360, child: inspector()),
                  ],
                )
              : Column(
                  children: [
                    SizedBox(height: box.maxHeight * .48, child: player()),
                    const Divider(height: 1),
                    Expanded(child: inspector()),
                  ],
                ),
        ),
      );
}

class _CurveEditor extends StatefulWidget {
  const _CurveEditor({required this.points, required this.onChanged});
  final List<double> points;
  final ValueChanged<List<double>> onChanged;
  @override
  State<_CurveEditor> createState() => _CurveEditorState();
}

class _CurveEditorState extends State<_CurveEditor> {
  int handle = 0;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, box) {
          Offset point(int i) => Offset(
                12 + widget.points[i] * (box.maxWidth - 24),
                12 + (1 - widget.points[i + 1]) * (box.maxHeight - 24),
              );
          void update(Offset p) {
            final next = List<double>.of(widget.points);
            next[handle] = ((p.dx - 12) / (box.maxWidth - 24)).clamp(0, 1);
            next[handle + 1] =
                (1 - (p.dy - 12) / (box.maxHeight - 24)).clamp(0, 1);
            widget.onChanged(next);
          }

          return GestureDetector(
            onPanStart: (d) {
              handle = (d.localPosition - point(0)).distance <=
                      (d.localPosition - point(2)).distance
                  ? 0
                  : 2;
              update(d.localPosition);
            },
            onPanUpdate: (d) => update(d.localPosition),
            child: CustomPaint(
              painter: _CurvePainter(List.of(widget.points)),
              child: const SizedBox.expand(),
            ),
          );
        },
      );
}

class _CurvePainter extends CustomPainter {
  _CurvePainter(this.p);
  final List<double> p;
  @override
  void paint(Canvas canvas, Size size) {
    Offset at(double x, double y) =>
        Offset(12 + x * (size.width - 24), 12 + (1 - y) * (size.height - 24));
    final pen = Paint()
      ..color = const Color(0xffcbd2db)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    canvas.drawRect(Rect.fromPoints(at(0, 1), at(1, 0)), pen);
    canvas.drawLine(at(0, 0), at(p[0], p[1]), pen);
    canvas.drawLine(at(1, 1), at(p[2], p[3]), pen);
    final path = Path()
      ..moveTo(at(0, 0).dx, at(0, 0).dy)
      ..cubicTo(
        at(p[0], p[1]).dx,
        at(p[0], p[1]).dy,
        at(p[2], p[3]).dx,
        at(p[2], p[3]).dy,
        at(1, 1).dx,
        at(1, 1).dy,
      );
    canvas.drawPath(
      path,
      pen
        ..color = const Color(0xff0c66e4)
        ..strokeWidth = 2,
    );
    pen.style = PaintingStyle.fill;
    canvas.drawCircle(at(p[0], p[1]), 7, pen);
    canvas.drawCircle(at(p[2], p[3]), 7, pen);
  }

  @override
  bool shouldRepaint(_CurvePainter old) => true;
}
