import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Half-open authored interval in composition/output seconds.
@immutable
class PreviewSpan {
  const PreviewSpan(this.start, this.end)
    : assert(start >= 0),
      assert(end > start);
  final double start;
  final double end;
}

/// Explicit metadata in front-to-back order; audio may be listed separately.
@immutable
class PreviewLayer {
  const PreviewLayer({required this.name, required this.spans, this.detail});
  final String name;
  final List<PreviewSpan> spans;
  final String? detail;
  bool activeAt(double seconds) =>
      spans.any((s) => seconds >= s.start && seconds < s.end);
}

/// Preview-only player shell. The timeline occupies layout below the player;
/// nothing is painted onto the composition or added to its export.
class PreviewLayers extends StatefulWidget {
  const PreviewLayers({
    super.key,
    required this.child,
    required this.layers,
    required this.seconds,
    required this.duration,
    required this.onSeek,
  }) : assert(duration > 0);
  final Widget child;
  final List<PreviewLayer> layers;
  final double seconds;
  final double duration;
  final ValueChanged<double> onSeek;
  @override
  State<PreviewLayers> createState() => _PreviewLayersState();
}

class _PreviewLayersState extends State<PreviewLayers> {
  bool expanded = false;
  String time(double seconds) {
    final whole = seconds.floor();
    return '${whole ~/ 60}:${(whole % 60).toString().padLeft(2, '0')}';
  }

  Widget track(
    List<PreviewSpan> spans, {
    bool ruler = false,
    String label = 'Seek',
  }) => LayoutBuilder(
    builder: (context, constraints) => Semantics(
      label: label,
      value: '${widget.seconds.toStringAsFixed(1)} seconds',
      increasedValue:
          '${(widget.seconds + 1).clamp(0, widget.duration).toStringAsFixed(1)} seconds',
      decreasedValue:
          '${(widget.seconds - 1).clamp(0, widget.duration).toStringAsFixed(1)} seconds',
      onIncrease: () =>
          widget.onSeek((widget.seconds + 1).clamp(0, widget.duration)),
      onDecrease: () =>
          widget.onSeek((widget.seconds - 1).clamp(0, widget.duration)),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapUp: (event) => widget.onSeek(
          (event.localPosition.dx / constraints.maxWidth * widget.duration)
              .clamp(0, widget.duration),
        ),
        child: CustomPaint(
          painter: _TrackPainter(
            spans: spans,
            duration: widget.duration,
            seconds: widget.seconds,
            ruler: ruler,
          ),
          child: ruler
              ? Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: List.generate(
                    constraints.maxWidth < 300 ? 3 : 5,
                    (i) => Text(
                      time(
                        widget.duration *
                            i /
                            (constraints.maxWidth < 300 ? 2 : 4),
                      ),
                      style: const TextStyle(
                        fontSize: 10,
                        color: Color(0xffbdbdc7),
                      ),
                    ),
                  ),
                )
              : const SizedBox.expand(),
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final labelWidth = math.min(150.0, constraints.maxWidth * .35);
      // Keep the video visible even on short embedded surfaces.
      final timelineHeight = math.min(
        220.0,
        math.max(24.0, constraints.maxHeight * .4 - 44),
      );
      return Column(
        children: [
          Expanded(child: widget.child),
          Material(
            color: const Color(0xff202027),
            child: DefaultTextStyle(
              style: const TextStyle(fontSize: 12, color: Colors.white),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    height: 44,
                    child: Row(
                      children: [
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            '${time(widget.seconds)} / ${time(widget.duration)}',
                            style: const TextStyle(color: Color(0xffbdbdc7)),
                          ),
                        ),
                        Semantics(
                          expanded: expanded,
                          child: TextButton.icon(
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.white,
                            ),
                            onPressed: () =>
                                setState(() => expanded = !expanded),
                            icon: Icon(
                              expanded
                                  ? Icons.expand_more
                                  : Icons.layers_outlined,
                              size: 18,
                            ),
                            label: const Text('Layers'),
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],
                    ),
                  ),
                  if (expanded)
                    SizedBox(
                      height: timelineHeight,
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: SizedBox(
                              height: 24,
                              child: Row(
                                children: [
                                  SizedBox(
                                    width: labelWidth,
                                    child: const Text(
                                      'Click to seek',
                                      style: TextStyle(fontSize: 10),
                                    ),
                                  ),
                                  Expanded(child: track(const [], ruler: true)),
                                ],
                              ),
                            ),
                          ),
                          Expanded(
                            child: widget.layers.isEmpty
                                ? const Center(
                                    child: Text('No layer metadata provided.'),
                                  )
                                : ListView.builder(
                                    padding: const EdgeInsets.fromLTRB(
                                      12,
                                      0,
                                      12,
                                      8,
                                    ),
                                    itemCount: widget.layers.length,
                                    itemBuilder: (context, index) {
                                      final layer = widget.layers[index];
                                      final active = layer.activeAt(
                                        widget.seconds,
                                      );
                                      return SizedBox(
                                        height: 30,
                                        child: Row(
                                          children: [
                                            SizedBox(
                                              width: labelWidth,
                                              child: Tooltip(
                                                message:
                                                    '${layer.name}${layer.detail == null ? '' : '\n${layer.detail}'}',
                                                child: Text(
                                                  layer.name,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: TextStyle(
                                                    color: active
                                                        ? Colors.white
                                                        : const Color(
                                                            0xffbdbdc7,
                                                          ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                            Expanded(
                                              child: track(
                                                layer.spans,
                                                label: '${layer.name} timeline',
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    },
                                  ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      );
    },
  );
}

class _TrackPainter extends CustomPainter {
  _TrackPainter({
    required this.spans,
    required this.duration,
    required this.seconds,
    this.ruler = false,
  });
  final List<PreviewSpan> spans;
  final double duration, seconds;
  final bool ruler;
  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = const Color(0xff41414c)
      ..strokeWidth = 1;
    if (!ruler) {
      canvas.drawRect(
        Offset.zero & size,
        Paint()..color = const Color(0xff292932),
      );
      for (var i = 0; i <= 4; i++) {
        final x = size.width * i / 4;
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
      }
      for (final span in spans) {
        final left = (span.start / duration).clamp(0.0, 1.0) * size.width;
        final right = (span.end / duration).clamp(0.0, 1.0) * size.width;
        if (right <= left) continue;
        final active = seconds >= span.start && seconds < span.end;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTRB(
              left,
              7,
              math.min(size.width, math.max(left + 1, right)),
              size.height - 7,
            ),
            const Radius.circular(3),
          ),
          Paint()
            ..color = active
                ? const Color(0xffd0c4ff)
                : const Color(0xff8176a8),
        );
      }
    }
    final x = (seconds / duration).clamp(0.0, 1.0) * (size.width - 1);
    canvas.drawLine(
      Offset(x, 0),
      Offset(x, size.height),
      Paint()
        ..color = Colors.white
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant _TrackPainter old) =>
      old.seconds != seconds ||
      old.duration != duration ||
      old.spans != spans ||
      old.ruler != ruler;
}
