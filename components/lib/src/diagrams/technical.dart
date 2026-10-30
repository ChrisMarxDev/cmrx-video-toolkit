import 'dart:math' as math;
import 'package:flutter/widgets.dart';

import '../style.dart';
import '../validation.dart';

/// A matrix / tensor / memory tile. All labels and values are caller-owned.
class TechnicalGrid extends StatelessWidget {
  TechnicalGrid({
    super.key,
    required List<List<String>> cells,
    this.style,
    this.activeRow,
    this.activeColumn,
  }) : cells = List.unmodifiable(
         cells.map((row) => List<String>.unmodifiable(row)),
       ) {
    if (cells.isEmpty ||
        cells.length > 12 ||
        cells.first.isEmpty ||
        cells.first.length > 12 ||
        cells.any((row) => row.length != cells.first.length))
      throw ArgumentError('Rectangular 1..12 by 1..12 grid required');
    if (activeRow != null && (activeRow! < 0 || activeRow! >= cells.length) ||
        activeColumn != null &&
            (activeColumn! < 0 || activeColumn! >= cells.first.length)) {
      throw ArgumentError('Active row/column outside grid');
    }
  }
  final List<List<String>> cells;
  final VideoStyle? style;
  final int? activeRow, activeColumn;
  @override
  Widget build(BuildContext context) {
    final style = VideoThemeScope.resolve(context, this.style);
    return FittedBox(
      fit: BoxFit.contain,
      child: SizedBox(
        width: cells.first.length * 76.0,
        height: cells.length * 64.0,
        child: Column(
          children: [
            for (var row = 0; row < cells.length; row++)
              Expanded(
                child: Row(
                  children: [
                    for (var col = 0; col < cells[row].length; col++)
                      Expanded(
                        child: Container(
                          margin: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            color: row == activeRow || col == activeColumn
                                ? style.accent
                                : style.surface,
                            border: Border.all(
                              color: style.foreground,
                              width: 1.5,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              cells[row][col],
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: style.mono.copyWith(
                                fontSize: 20,
                                color: row == activeRow || col == activeColumn
                                    ? style.onAccent
                                    : style.foreground,
                                decoration: TextDecoration.none,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

@immutable
class SequenceMessage {
  const SequenceMessage({
    required this.from,
    required this.to,
    required this.label,
    this.response = false,
  });
  final int from, to;
  final String label;
  final bool response;
}

/// Temporal order is top-to-bottom. Request/response uses solid/dashed arrows.
class TechnicalSequence extends StatelessWidget {
  TechnicalSequence({
    super.key,
    required List<String> participants,
    required List<SequenceMessage> messages,
    this.style,
    this.progress = 1,
  }) : participants = List.unmodifiable(participants),
       messages = List.unmodifiable(messages) {
    checkProgress(progress);
    if (participants.length < 2 ||
        participants.length > 5 ||
        messages.isEmpty ||
        messages.length > 8) {
      throw ArgumentError('Provide 2..5 participants and 1..8 messages');
    }
    for (final message in messages) {
      if (message.from < 0 ||
          message.to < 0 ||
          message.from >= participants.length ||
          message.to >= participants.length ||
          message.from == message.to) {
        throw ArgumentError('Messages require distinct valid participants');
      }
    }
  }
  final List<String> participants;
  final List<SequenceMessage> messages;
  final VideoStyle? style;
  final double progress;
  @override
  Widget build(BuildContext context) {
    final style = VideoThemeScope.resolve(context, this.style);
    return Semantics(
      label: messages
          .map(
            (m) =>
                '${participants[m.from]} to ${participants[m.to]}: ${m.label}',
          )
          .join('; '),
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: 800,
          height: 140 + messages.length * 64.0,
          child: CustomPaint(
            painter: _SequencePainter(participants, messages, style, progress),
          ),
        ),
      ),
    );
  }
}

class _SequencePainter extends CustomPainter {
  const _SequencePainter(
    this.participants,
    this.messages,
    this.style,
    this.progress,
  );
  final List<String> participants;
  final List<SequenceMessage> messages;
  final VideoStyle style;
  final double progress;
  @override
  void paint(Canvas canvas, Size size) {
    double x(int i) => 90 + i * 620 / (participants.length - 1);
    final pen = Paint()
      ..color = style.foreground
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < participants.length; i++) {
      final rect = Rect.fromCenter(
        center: Offset(x(i), 35),
        width: 150,
        height: 54,
      );
      canvas.drawRect(rect, Paint()..color = style.surface);
      canvas.drawRect(rect, pen);
      paintLabel(
        canvas,
        participants[i],
        rect.center,
        style.body.copyWith(
          fontSize: 21,
          color: style.foreground,
          decoration: TextDecoration.none,
        ),
        maxWidth: 138,
      );
      for (var y = 70.0; y < size.height - 15; y += 14) {
        canvas.drawLine(
          Offset(x(i), y),
          Offset(x(i), y + 6),
          pen..strokeWidth = 1,
        );
      }
    }
    pen.strokeWidth = 2;
    for (var i = 0; i < messages.length; i++) {
      final message = messages[i];
      final p = (progress * messages.length - i).clamp(0.0, 1.0);
      final y = 115 + i * 64.0;
      paintArrow(
        canvas,
        polyline([Offset(x(message.from), y), Offset(x(message.to), y)]),
        pen,
        p,
        dashed: message.response,
      );
      if (p > .5)
        paintLabel(
          canvas,
          message.label,
          Offset((x(message.from) + x(message.to)) / 2, y - 17),
          style.mono.copyWith(
            fontSize: 18,
            color: style.foreground,
            decoration: TextDecoration.none,
          ),
          maxWidth: (x(message.to) - x(message.from)).abs() - 16,
          background: style.background,
        );
    }
  }

  @override
  bool shouldRepaint(_SequencePainter old) => true;
}

@immutable
class TechnicalNote {
  TechnicalNote({
    required this.target,
    required this.labelPosition,
    required this.text,
  }) {
    if (![
      target.dx,
      target.dy,
      labelPosition.dx,
      labelPosition.dy,
    ].every((v) => v.isFinite)) {
      throw ArgumentError('Note positions must be finite');
    }
  }
  final Offset target, labelPosition;
  final String text;
}

/// Crosshair and leader annotations over any widget. Coordinates use designSize.
class TechnicalAnnotation extends StatelessWidget {
  TechnicalAnnotation({
    super.key,
    required this.child,
    required List<TechnicalNote> notes,
    this.style,
    this.designSize = const Size(800, 480),
    this.progress = 1,
  }) : notes = List.unmodifiable(notes) {
    checkSize(designSize);
    checkProgress(progress);
    for (final n in notes) {
      for (final p in [n.target, n.labelPosition]) {
        if (p.dx < 0 ||
            p.dy < 0 ||
            p.dx > designSize.width ||
            p.dy > designSize.height) {
          throw ArgumentError('Annotation outside design canvas');
        }
      }
    }
  }
  final Widget child;
  final List<TechnicalNote> notes;
  final VideoStyle? style;
  final Size designSize;
  final double progress;
  @override
  Widget build(BuildContext context) {
    final style = VideoThemeScope.resolve(context, this.style);
    return Semantics(
      label: notes.map((n) => n.text).join('; '),
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox.fromSize(
          size: designSize,
          child: CustomPaint(
            foregroundPainter: _NotesPainter(notes, style, progress),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _NotesPainter extends CustomPainter {
  const _NotesPainter(this.notes, this.style, this.progress);
  final List<TechnicalNote> notes;
  final VideoStyle style;
  final double progress;
  @override
  void paint(Canvas canvas, Size size) {
    final pen = Paint()
      ..color = style.foreground
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    for (final note in notes) {
      final p = note.target;
      canvas.drawCircle(p, 9, pen);
      canvas.drawLine(p - const Offset(15, 0), p + const Offset(15, 0), pen);
      canvas.drawLine(p - const Offset(0, 15), p + const Offset(0, 15), pen);
      final path = polyline([
        note.labelPosition,
        Offset(note.labelPosition.dx, p.dy),
        p,
      ]);
      paintArrow(canvas, path, pen, progress);
      if (progress > .6)
        paintLabel(
          canvas,
          note.text,
          note.labelPosition,
          style.mono.copyWith(
            fontSize: 19,
            color: style.foreground,
            decoration: TextDecoration.none,
          ),
          maxWidth: 200,
          background: style.background,
        );
    }
  }

  @override
  bool shouldRepaint(_NotesPainter old) => true;
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
