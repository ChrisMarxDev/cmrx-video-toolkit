import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

@immutable
class ChartDatum {
  const ChartDatum(this.label, this.value);
  final String label;
  final double value;
}

@immutable
class ScatterDatum {
  const ScatterDatum(this.label, this.x, this.y);
  final String label;
  final double x, y;
}

@immutable
class HeatmapDatum {
  const HeatmapDatum(this.date, this.value);
  final DateTime date;
  final double value;
}

@immutable
class RadarSeries {
  const RadarSeries(this.label, this.values);
  final String label;
  final List<double> values;
}

void _data(List<ChartDatum> data, {bool signed = false}) {
  nonEmpty(data, 'data', max: 12);
  if (data.any((d) => !d.value.isFinite || (!signed && d.value < 0)))
    throw ArgumentError(
      'Values must be finite${signed ? '' : ' and nonnegative'}',
    );
}

Widget _chart(
  VideoStyle? style,
  String title,
  String foot,
  Widget Function(VideoStyle) plot,
) => SceneCanvas(
  style: style,
  builder: (s) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      heading(s, title, size: 32),
      gap(s),
      Expanded(child: plot(s)),
      gap(s),
      label(s, foot, mono: true, size: 14, color: s.muted, lines: 2),
    ],
  ),
);

class WaterfallChart extends StatelessWidget {
  const WaterfallChart({
    super.key,
    required this.data,
    this.baseline = 0,
    this.title = 'Change over time',
    this.unitLabel = '',
    this.progress = 1,
    this.style,
  });
  final List<ChartDatum> data;
  final double baseline, progress;
  final String title, unitLabel;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    _data(data, signed: true);
    if (!baseline.isFinite) throw ArgumentError('baseline must be finite');
    return _chart(
      style,
      title,
      unitLabel,
      (s) => CustomPaint(
        painter: _DataPainter(
          s,
          unit(progress),
          kind: 0,
          data: data,
          baseline: baseline,
        ),
        size: Size.infinite,
      ),
    );
  }
}

class ConversionFunnel extends StatelessWidget {
  const ConversionFunnel({
    super.key,
    required this.stages,
    this.title = 'Conversion funnel',
    this.progress = 1,
    this.style,
  });
  final List<ChartDatum> stages;
  final String title;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    _data(stages);
    if (stages.first.value <= 0)
      throw ArgumentError('First stage must be positive');
    for (var i = 1; i < stages.length; i++)
      if (stages[i].value > stages[i - 1].value)
        throw ArgumentError('Funnel counts must not increase');
    return _chart(
      style,
      title,
      'Stage counts · conversion from previous stage',
      (s) => Column(
        children: [
          for (var i = 0; i < stages.length; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    SizedBox(
                      width: 140,
                      child: label(s, stages[i].label, size: 17),
                    ),
                    Expanded(
                      child: Align(
                        alignment: Alignment.center,
                        child: FractionallySizedBox(
                          widthFactor:
                              (stages[i].value / stages.first.value) *
                              unit(progress),
                          heightFactor: 1,
                          child: Container(
                            decoration: BoxDecoration(
                              color: i.isEven ? s.accent : s.surface,
                              borderRadius: BorderRadius.circular(s.radius),
                            ),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: label(
                        s,
                        '${stages[i].value.toStringAsFixed(0)}${i == 0 ? '' : ' · ${(stages[i - 1].value == 0 ? 0 : stages[i].value / stages[i - 1].value * 100).toStringAsFixed(0)}%'}',
                        size: 17,
                        mono: true,
                        align: TextAlign.right,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class CalendarHeatmap extends StatelessWidget {
  const CalendarHeatmap({
    super.key,
    required this.values,
    required this.start,
    this.weeks = 12,
    this.title = 'Activity',
    this.progress = 1,
    this.style,
  });
  final List<HeatmapDatum> values;
  final DateTime start;
  final int weeks;
  final String title;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    if (weeks < 1 ||
        weeks > 24 ||
        values.any((v) => !v.value.isFinite || v.value < 0))
      throw ArgumentError('Use 1–24 weeks and finite nonnegative values');
    return _chart(
      style,
      title,
      '${start.toIso8601String().split('T').first} · pale = none, dark = highest',
      (s) => CustomPaint(
        painter: _DataPainter(
          s,
          unit(progress),
          kind: 1,
          heat: values,
          start: start,
          weeks: weeks,
        ),
        size: Size.infinite,
      ),
    );
  }
}

class RadarComparison extends StatelessWidget {
  const RadarComparison({
    super.key,
    required this.axes,
    required this.series,
    this.title = 'Profile comparison',
    this.progress = 1,
    this.style,
  });
  final List<String> axes;
  final List<RadarSeries> series;
  final String title;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    if (axes.length < 3 ||
        axes.length > 8 ||
        series.isEmpty ||
        series.length > 3 ||
        series.any(
          (s) =>
              s.values.length != axes.length ||
              s.values.any((v) => !v.isFinite || v < 0 || v > 1),
        ))
      throw ArgumentError(
        'Radar needs 3–8 axes and 1–3 matching series normalized to 0–1',
      );
    return _chart(
      style,
      title,
      'Normalized scale: 0–1',
      (s) => Column(
        children: [
          Expanded(
            child: CustomPaint(
              painter: _DataPainter(
                s,
                unit(progress),
                kind: 2,
                axes: axes,
                series: series,
              ),
              size: Size.infinite,
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < series.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    children: [
                      Container(
                        width: 18,
                        height: 4,
                        color: [s.foreground, s.accent, s.muted][i],
                      ),
                      const SizedBox(width: 8),
                      label(s, series[i].label, size: 14, mono: true),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class ScatterPlot extends StatelessWidget {
  const ScatterPlot({
    super.key,
    required this.points,
    this.xLabel = 'X',
    this.yLabel = 'Y',
    this.minX = 0,
    this.maxX = 100,
    this.minY = 0,
    this.maxY = 100,
    this.title = 'Observation map',
    this.progress = 1,
    this.style,
  });
  final List<ScatterDatum> points;
  final String xLabel, yLabel, title;
  final double minX, maxX, minY, maxY, progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(points, 'points', max: 100);
    if ([minX, maxX, minY, maxY].any((v) => !v.isFinite) ||
        maxX <= minX ||
        maxY <= minY ||
        points.any(
          (p) =>
              !p.x.isFinite ||
              !p.y.isFinite ||
              p.x < minX ||
              p.x > maxX ||
              p.y < minY ||
              p.y > maxY,
        ))
      throw ArgumentError(
        'Points must be finite and inside increasing domains',
      );
    return _chart(
      style,
      title,
      '$xLabel → / $yLabel ↑',
      (s) => CustomPaint(
        painter: _DataPainter(
          s,
          unit(progress),
          kind: 3,
          points: points,
          domain: Rect.fromLTRB(minX, minY, maxX, maxY),
        ),
        size: Size.infinite,
      ),
    );
  }
}

class TargetGauge extends StatelessWidget {
  const TargetGauge({
    super.key,
    required this.value,
    required this.target,
    this.minimum = 0,
    this.maximum = 100,
    this.unitLabel = '%',
    this.title = 'Progress to target',
    this.progress = 1,
    this.style,
  });
  final double value, target, minimum, maximum, progress;
  final String unitLabel, title;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    if ([value, target, minimum, maximum].any((v) => !v.isFinite) ||
        maximum <= minimum ||
        value < minimum ||
        value > maximum ||
        target < minimum ||
        target > maximum)
      throw ArgumentError(
        'Value and target must lie within finite increasing bounds',
      );
    return _chart(
      style,
      title,
      'Target ${target.toStringAsFixed(0)}$unitLabel · range $minimum–$maximum',
      (s) => Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _DataPainter(
                s,
                unit(progress),
                kind: 4,
                baseline: (value - minimum) / (maximum - minimum),
                target: (target - minimum) / (maximum - minimum),
              ),
            ),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: 100),
              child: heading(
                s,
                '${(minimum + (value - minimum) * unit(progress)).toStringAsFixed(0)}$unitLabel',
                size: 60,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DataPainter extends CustomPainter {
  _DataPainter(
    this.s,
    this.p, {
    required this.kind,
    this.data = const [],
    this.baseline = 0,
    this.target = 0,
    this.heat = const [],
    this.start,
    this.weeks = 12,
    this.axes = const [],
    this.series = const [],
    this.points = const [],
    this.domain = const Rect.fromLTRB(0, 0, 100, 100),
  });
  final VideoStyle s;
  final double p, baseline, target;
  final int kind, weeks;
  final List<ChartDatum> data;
  final List<HeatmapDatum> heat;
  final DateTime? start;
  final List<String> axes;
  final List<RadarSeries> series;
  final List<ScatterDatum> points;
  final Rect domain;
  void text(
    Canvas c,
    String t,
    Offset at, {
    double size = 13,
    Color? color,
    double width = 100,
    TextAlign align = TextAlign.center,
  }) {
    final tp = TextPainter(
      text: TextSpan(
        text: t,
        style: s.mono.copyWith(fontSize: size, color: color ?? s.foreground),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 2,
      ellipsis: '…',
      textAlign: align,
    )..layout(maxWidth: width);
    tp.paint(c, at);
  }

  @override
  void paint(Canvas c, Size z) {
    final w = z.width, h = z.height;
    final paint = Paint();
    if (kind == 0) {
      var running = baseline;
      var low = math.min(0.0, baseline), high = math.max(0.0, baseline);
      for (final d in data) {
        running += d.value;
        low = math.min(low, running);
        high = math.max(high, running);
      }
      final range = math.max(1.0, high - low);
      double y(double v) => 20 + (high - v) / range * (h - 65);
      final step = (w - 45) / data.length;
      running = baseline;
      c.drawLine(
        Offset(35, y(0)),
        Offset(w, y(0)),
        paint
          ..color = s.rule
          ..strokeWidth = 1,
      );
      text(c, high.toStringAsFixed(0), Offset(0, 0), width: 35);
      text(c, low.toStringAsFixed(0), Offset(0, h - 50), width: 35);
      for (var i = 0; i < data.length; i++) {
        final end = running + data[i].value * p;
        final x = 40 + i * step;
        final r = Rect.fromLTRB(
          x,
          math.min(y(running), y(end)),
          x + step * .7,
          math.max(y(running), y(end)) + 1,
        );
        c.drawRRect(
          RRect.fromRectAndRadius(r, Radius.circular(s.radius)),
          paint..color = data[i].value >= 0 ? s.accent : s.foreground,
        );
        if (i < data.length - 1)
          c.drawLine(
            Offset(x + step * .7, y(end)),
            Offset(x + step, y(end)),
            paint..color = s.rule,
          );
        text(c, data[i].label, Offset(x, h - 30), width: step * .9);
        text(
          c,
          '${data[i].value >= 0 ? '+' : ''}${data[i].value}',
          Offset(x, math.min(y(running), y(end)) - 18),
          width: step * .9,
        );
        running = end;
      }
      return;
    }
    if (kind == 1) {
      final cw = (w - 40) / weeks, ch = (h - 25) / 7;
      final max = heat.fold<double>(1, (m, v) => math.max(m, v.value));
      final entries = <String, double>{};
      String key(DateTime d) => '${d.year}-${d.month}-${d.day}';
      for (final v in heat) {
        entries[key(v.date)] = v.value;
      }
      for (var day = 0; day < 7; day++) {
        text(
          c,
          ['M', 'T', 'W', 'T', 'F', 'S', 'S'][(start!.weekday - 1 + day) % 7],
          Offset(0, day * ch),
          width: 25,
        );
        for (var week = 0; week < weeks; week++) {
          final date = DateTime.utc(
            start!.year,
            start!.month,
            start!.day,
          ).add(Duration(days: week * 7 + day));
          final value = entries[key(date)] ?? 0;
          final r = Rect.fromLTWH(40 + week * cw, day * ch, cw - 4, ch - 4);
          c.drawRRect(
            RRect.fromRectAndRadius(r, Radius.circular(s.radius.clamp(0, 8))),
            paint
              ..color = Color.lerp(s.surface, s.foreground, value / max * p)!,
          );
        }
      }
      return;
    }
    if (kind == 2) {
      final center = Offset(w / 2, h / 2);
      final radius = math.min(w / 2 - 110, h / 2 - 30);
      Offset pos(int i, double r) =>
          center +
          Offset(
                math.sin(i * 2 * math.pi / axes.length),
                -math.cos(i * 2 * math.pi / axes.length),
              ) *
              r;
      for (var ring = 1; ring <= 4; ring++) {
        final path = Path()
          ..moveTo(pos(0, radius * ring / 4).dx, pos(0, radius * ring / 4).dy);
        for (var i = 1; i < axes.length; i++)
          path.lineTo(
            pos(i, radius * ring / 4).dx,
            pos(i, radius * ring / 4).dy,
          );
        path.close();
        c.drawPath(
          path,
          Paint()
            ..color = s.rule
            ..style = PaintingStyle.stroke,
        );
      }
      for (var i = 0; i < axes.length; i++) {
        c.drawLine(center, pos(i, radius), paint..color = s.rule);
        final anchor = pos(i, radius + 24);
        final dx = anchor.dx - center.dx;
        text(
          c,
          axes[i],
          anchor -
              Offset(
                dx.abs() < 1
                    ? 40
                    : dx > 0
                    ? 0
                    : 80,
                7,
              ),
          width: 80,
          align: dx.abs() < 1
              ? TextAlign.center
              : dx > 0
              ? TextAlign.left
              : TextAlign.right,
        );
      }
      for (var n = 0; n < series.length; n++) {
        final path = Path();
        for (var i = 0; i < axes.length; i++) {
          final v = pos(i, radius * series[n].values[i] * p);
          if (i == 0) {
            path.moveTo(v.dx, v.dy);
          } else {
            path.lineTo(v.dx, v.dy);
          }
        }
        path.close();
        final color = [s.foreground, s.accent, s.muted][n];
        c.drawPath(path, Paint()..color = color.withValues(alpha: .18));
        c.drawPath(
          path,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2 + n.toDouble(),
        );
      }
      return;
    }
    if (kind == 3) {
      final area = Rect.fromLTRB(50, 15, w - 35, h - 35);
      for (var i = 0; i <= 4; i++) {
        final x = area.left + area.width * i / 4,
            y = area.bottom - area.height * i / 4;
        c.drawLine(
          Offset(x, area.top),
          Offset(x, area.bottom),
          paint..color = s.rule,
        );
        c.drawLine(
          Offset(area.left, y),
          Offset(area.right, y),
          paint..color = s.rule,
        );
        text(
          c,
          (domain.left + domain.width * i / 4).toStringAsFixed(0),
          Offset(x - 20, area.bottom + 8),
          width: 40,
        );
        text(
          c,
          (domain.top + domain.height * i / 4).toStringAsFixed(0),
          Offset(0, y - 8),
          width: 40,
        );
      }
      for (final d in points) {
        final at = Offset(
          area.left + (d.x - domain.left) / domain.width * area.width,
          area.bottom - (d.y - domain.top) / domain.height * area.height,
        );
        c.drawCircle(at, 7 * p, paint..color = s.foreground);
        text(
          c,
          d.label,
          at + const Offset(9, -18),
          width: 80,
          align: TextAlign.left,
        );
      }
      return;
    }
    final center = Offset(w / 2, h * .82), radius = math.min(w * .38, h * .72);
    final rect = Rect.fromCircle(center: center, radius: radius);
    c.drawArc(
      rect,
      math.pi,
      math.pi,
      false,
      Paint()
        ..color = s.surface
        ..style = PaintingStyle.stroke
        ..strokeWidth = 24,
    );
    c.drawArc(
      rect,
      math.pi,
      math.pi * baseline * p,
      false,
      Paint()
        ..color = s.foreground
        ..style = PaintingStyle.stroke
        ..strokeWidth = 24,
    );
    final a = math.pi + target * math.pi;
    final direction = Offset(math.cos(a), math.sin(a));
    c.drawLine(
      center + direction * (radius - 24),
      center + direction * (radius + 24),
      Paint()
        ..color = s.accent
        ..strokeWidth = 5,
    );
  }

  @override
  bool shouldRepaint(_DataPainter old) => true;
}
