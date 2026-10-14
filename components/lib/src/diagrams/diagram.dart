import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../style.dart';

enum DiagramShape { process, terminal, decision, database, document }

enum DiagramPort { top, right, bottom, left }

void checkProgress(double value) {
  if (!value.isFinite || value < 0 || value > 1) {
    throw ArgumentError.value(
      value,
      'progress',
      'Expected a finite value in 0..1',
    );
  }
}

void checkSize(Size size) {
  if (!size.width.isFinite || !size.height.isFinite || size.isEmpty) {
    throw ArgumentError.value(
      size,
      'size',
      'Expected finite positive dimensions',
    );
  }
}

/// Coordinates are logical pixels in the diagram's declared design size.
@immutable
class DiagramNode {
  DiagramNode({
    required this.id,
    required this.label,
    required this.bounds,
    this.shape = DiagramShape.process,
    this.active = false,
  }) {
    if (id.isEmpty ||
        ![
          bounds.left,
          bounds.top,
          bounds.width,
          bounds.height,
        ].every((v) => v.isFinite) ||
        bounds.isEmpty) {
      throw ArgumentError('Nodes need an ID and finite positive bounds');
    }
  }
  final String id, label;
  final Rect bounds;
  final DiagramShape shape;
  final bool active;
  Offset port(DiagramPort port) => switch (port) {
    DiagramPort.top => bounds.topCenter,
    DiagramPort.right => bounds.centerRight,
    DiagramPort.bottom => bounds.bottomCenter,
    DiagramPort.left => bounds.centerLeft,
  };
}

@immutable
class DiagramEdge {
  DiagramEdge({
    required this.from,
    required this.to,
    this.fromPort = DiagramPort.right,
    this.toPort = DiagramPort.left,
    this.label = '',
    this.active = false,
    this.dashed = false,
    List<Offset> via = const [],
  }) : via = List.unmodifiable(via) {
    if (via.any((p) => !p.dx.isFinite || !p.dy.isFinite)) {
      throw ArgumentError('Waypoints must be finite');
    }
  }
  final String from, to, label;
  final DiagramPort fromPort, toPort;
  final bool active, dashed;
  final List<Offset> via;
}

/// Deterministic orthogonal routing. Supply [DiagramEdge.via] for loops or to
/// avoid intervening nodes; this is not an obstacle-avoiding layout engine.
List<Offset> diagramEdgePoints(
  DiagramEdge edge,
  Map<String, DiagramNode> nodes,
) {
  final a = nodes[edge.from]!.port(edge.fromPort);
  final b = nodes[edge.to]!.port(edge.toPort);
  if (edge.via.isNotEmpty) return [a, ...edge.via, b];
  final horizontalA =
      edge.fromPort == DiagramPort.right || edge.fromPort == DiagramPort.left;
  final horizontalB =
      edge.toPort == DiagramPort.right || edge.toPort == DiagramPort.left;
  if (horizontalA && horizontalB) {
    final x = (a.dx + b.dx) / 2;
    return [a, Offset(x, a.dy), Offset(x, b.dy), b];
  }
  if (!horizontalA && !horizontalB) {
    final y = (a.dy + b.dy) / 2;
    return [a, Offset(a.dx, y), Offset(b.dx, y), b];
  }
  return [a, horizontalA ? Offset(b.dx, a.dy) : Offset(a.dx, b.dy), b];
}

Path polyline(List<Offset> points) {
  final path = Path()..moveTo(points.first.dx, points.first.dy);
  for (final point in points.skip(1)) {
    path.lineTo(point.dx, point.dy);
  }
  return path;
}

void paintArrow(
  Canvas canvas,
  Path path,
  Paint pen,
  double progress, {
  bool dashed = false,
}) {
  if (progress <= 0) return;
  for (final metric in path.computeMetrics()) {
    final length = metric.length * progress;
    if (dashed) {
      for (var start = 0.0; start < length; start += 12) {
        canvas.drawPath(
          metric.extractPath(start, math.min(start + 6, length)),
          pen,
        );
      }
    } else {
      canvas.drawPath(metric.extractPath(0, length), pen);
    }
    final tangent = metric.getTangentForOffset(length);
    if (tangent != null && length > 10) {
      final tip = tangent.position;
      final direction = tangent.vector;
      final normal = Offset(-direction.dy, direction.dx);
      final base = tip - direction * 10;
      canvas.drawPath(
        Path()
          ..moveTo((base + normal * 5).dx, (base + normal * 5).dy)
          ..lineTo(tip.dx, tip.dy)
          ..lineTo((base - normal * 5).dx, (base - normal * 5).dy),
        pen,
      );
    }
  }
}

void paintLabel(
  Canvas canvas,
  String text,
  Offset center,
  TextStyle style, {
  double maxWidth = 180,
  Color? background,
}) {
  final painter = TextPainter(
    text: TextSpan(text: text, style: style),
    textAlign: TextAlign.center,
    textDirection: TextDirection.ltr,
  )..layout(maxWidth: maxWidth);
  if (background != null)
    canvas.drawRect(
      Rect.fromCenter(
        center: center,
        width: painter.width + 12,
        height: painter.height + 6,
      ),
      Paint()..color = background,
    );
  painter.paint(canvas, center - Offset(painter.width / 2, painter.height / 2));
  painter.dispose();
}

/// Five conventional flowchart shapes. The label is real Flutter/accessibility
/// text in consuming apps, not baked into an SVG asset.
class TechnicalNode extends StatelessWidget {
  const TechnicalNode({
    super.key,
    required this.label,
    required this.style,
    this.shape = DiagramShape.process,
    this.active = false,
  });
  final String label;
  final VideoStyle style;
  final DiagramShape shape;
  final bool active;
  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    child: CustomPaint(
      painter: _NodePainter(shape, style, active),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: shape == DiagramShape.decision ? 34 : 14,
          vertical: shape == DiagramShape.decision ? 24 : 16,
        ),
        child: Center(
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: style.body.copyWith(
              color: style.foreground,
              decoration: TextDecoration.none,
            ),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    ),
  );
}

class _NodePainter extends CustomPainter {
  const _NodePainter(this.shape, this.style, this.active);
  final DiagramShape shape;
  final VideoStyle style;
  final bool active;
  @override
  void paint(Canvas canvas, Size size) {
    final r = (Offset.zero & size).deflate(1.5);
    final path = Path();
    switch (shape) {
      case DiagramShape.process:
        path.addRect(r);
      case DiagramShape.terminal:
        path.addRRect(
          RRect.fromRectAndRadius(r, Radius.circular(r.height / 2)),
        );
      case DiagramShape.decision:
        path
          ..moveTo(r.center.dx, r.top)
          ..lineTo(r.right, r.center.dy)
          ..lineTo(r.center.dx, r.bottom)
          ..lineTo(r.left, r.center.dy)
          ..close();
      case DiagramShape.database:
        final ry = math.min(14.0, r.height / 6);
        path
          ..moveTo(r.left, r.top + ry)
          ..cubicTo(
            r.left,
            r.top - ry / 3,
            r.right,
            r.top - ry / 3,
            r.right,
            r.top + ry,
          )
          ..lineTo(r.right, r.bottom - ry)
          ..cubicTo(
            r.right,
            r.bottom + ry / 3,
            r.left,
            r.bottom + ry / 3,
            r.left,
            r.bottom - ry,
          )
          ..close();
      case DiagramShape.document:
        path
          ..moveTo(r.left, r.top)
          ..lineTo(r.right, r.top)
          ..lineTo(r.right, r.bottom - 10)
          ..cubicTo(
            r.width * .7,
            r.bottom - 25,
            r.width * .3,
            r.bottom + 10,
            r.left,
            r.bottom - 10,
          )
          ..close();
    }
    canvas.drawPath(
      path,
      Paint()..color = active ? style.accent : style.surface,
    );
    final pen = Paint()
      ..color = style.foreground
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawPath(path, pen);
    if (shape == DiagramShape.database) {
      final ry = math.min(14.0, r.height / 6);
      canvas.drawOval(Rect.fromLTWH(r.left, r.top, r.width, ry * 2), pen);
    }
  }

  @override
  bool shouldRepaint(_NodePainter old) =>
      shape != old.shape || style != old.style || active != old.active;
}

/// A reusable flowchart/architecture canvas. Caller owns layout, labels and style.
/// Geometry uniformly scales; use a portrait layout for dense vertical scenes.
class TechnicalDiagram extends StatelessWidget {
  TechnicalDiagram({
    super.key,
    required List<DiagramNode> nodes,
    required List<DiagramEdge> edges,
    required this.style,
    this.designSize = const Size(800, 480),
    this.progress = 1,
  }) : nodes = List.unmodifiable(nodes),
       edges = List.unmodifiable(edges) {
    checkSize(designSize);
    checkProgress(progress);
    final ids = nodes.map((n) => n.id).toSet();
    if (ids.length != nodes.length || nodes.isEmpty)
      throw ArgumentError('Unique nonempty node set required');
    for (final n in nodes) {
      if (n.bounds.left < 0 ||
          n.bounds.top < 0 ||
          n.bounds.right > designSize.width ||
          n.bounds.bottom > designSize.height) {
        throw ArgumentError('Node ${n.id} is outside the design canvas');
      }
    }
    for (final e in edges) {
      if (!ids.contains(e.from) || !ids.contains(e.to))
        throw ArgumentError('Edge endpoint not found');
      if (e.from == e.to && e.via.isEmpty)
        throw ArgumentError('Self-loops require explicit waypoints');
      for (final p in e.via) {
        if (p.dx < 0 ||
            p.dy < 0 ||
            p.dx > designSize.width ||
            p.dy > designSize.height) {
          throw ArgumentError('Waypoint outside design canvas');
        }
      }
    }
  }
  final List<DiagramNode> nodes;
  final List<DiagramEdge> edges;
  final VideoStyle style;
  final Size designSize;
  final double progress;
  @override
  Widget build(BuildContext context) => FittedBox(
    fit: BoxFit.contain,
    child: SizedBox.fromSize(
      size: designSize,
      child: Stack(
        children: [
          Positioned.fill(
            child: Semantics(
              label: edges
                  .map(
                    (e) =>
                        '${e.from} to ${e.to}${e.label.isEmpty ? '' : ': ${e.label}'}',
                  )
                  .join('; '),
              child: CustomPaint(
                painter: _Edges(nodes, edges, style, progress),
              ),
            ),
          ),
          for (final node in nodes)
            Positioned.fromRect(
              rect: node.bounds,
              child: TechnicalNode(
                label: node.label,
                shape: node.shape,
                active: node.active,
                style: style,
              ),
            ),
        ],
      ),
    ),
  );
}

class _Edges extends CustomPainter {
  const _Edges(this.nodes, this.edges, this.style, this.progress);
  final List<DiagramNode> nodes;
  final List<DiagramEdge> edges;
  final VideoStyle style;
  final double progress;
  @override
  void paint(Canvas canvas, Size size) {
    final map = {for (final node in nodes) node.id: node};
    for (final edge in edges) {
      final path = polyline(diagramEdgePoints(edge, map));
      final pen = Paint()
        ..color = style.foreground
        ..strokeWidth = edge.active ? 4 : 2
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round;
      if (edge.active) {
        paintArrow(
          canvas,
          path,
          Paint()
            ..color = style.accent
            ..strokeWidth = 9
            ..style = PaintingStyle.stroke,
          progress,
          dashed: edge.dashed,
        );
      }
      paintArrow(canvas, path, pen, progress, dashed: edge.dashed);
      if (edge.label.isNotEmpty && progress > .6) {
        final metrics = path.computeMetrics().toList();
        if (metrics.isNotEmpty) {
          final point = metrics.first
              .getTangentForOffset(metrics.first.length / 2)
              ?.position;
          if (point != null)
            paintLabel(
              canvas,
              edge.label,
              point,
              style.mono.copyWith(
                fontSize: 17,
                color: style.foreground,
                decoration: TextDecoration.none,
              ),
              background: style.background,
            );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_Edges old) => true;
}
