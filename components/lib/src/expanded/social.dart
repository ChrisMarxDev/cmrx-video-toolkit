import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

class QuoteCard extends StatelessWidget {
  const QuoteCard({
    super.key,
    required this.quote,
    required this.attribution,
    this.portrait,
    this.progress = 1,
    this.style,
  });
  final String quote, attribution;
  final Widget? portrait;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => enter(
      panel(
        s,
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            label(s, '“', size: 84, lines: 1),
            Expanded(child: label(s, quote, size: 38, lines: 5)),
            gap(s),
            Row(
              children: [
                if (portrait != null) ...[
                  ClipOval(
                    child: SizedBox(width: 54, height: 54, child: portrait),
                  ),
                  SizedBox(width: s.spacing),
                ],
                Expanded(child: label(s, attribution, mono: true)),
              ],
            ),
          ],
        ),
      ),
      progress,
    ),
  );
}

@immutable
class Testimonial {
  const Testimonial(this.quote, this.author);
  final String quote, author;
}

class TestimonialStack extends StatelessWidget {
  const TestimonialStack({
    super.key,
    required this.quotes,
    this.activeIndex = 0,
    this.progress = 1,
    this.style,
  });
  final List<Testimonial> quotes;
  final int activeIndex;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(quotes, 'quotes', max: 10);
    final active = activeIndex.clamp(0, quotes.length - 1);
    return SceneCanvas(
      style: style,
      builder: (s) => Stack(
        children: [
          for (var n = math.min(2, quotes.length - 1); n >= 0; n--)
            Positioned(
              left: n * 16 * unit(progress),
              right: (2 - n) * 16 * unit(progress),
              top: n * 22 * unit(progress),
              bottom: (2 - n) * 22 * unit(progress),
              child: panel(
                s,
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    label(
                      s,
                      '${active + 1} / ${quotes.length}',
                      mono: true,
                      color: s.muted,
                    ),
                    gap(s),
                    Expanded(
                      child: heading(
                        s,
                        quotes[(active + n) % quotes.length].quote,
                        size: 40,
                      ),
                    ),
                    label(
                      s,
                      quotes[(active + n) % quotes.length].author,
                      mono: true,
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

class CountdownCounter extends StatelessWidget {
  const CountdownCounter({
    super.key,
    this.start = 10,
    this.end = 0,
    this.progress = 0,
    this.labelText = 'Starting in',
    this.pad = 2,
    this.style,
  });
  final int start, end, pad;
  final double progress;
  final String labelText;
  final VideoStyle? style;
  int get value => start + ((end - start) * unit(progress)).truncate();
  @override
  Widget build(BuildContext context) {
    if (pad < 1 || pad > 12) throw ArgumentError('pad must be 1–12');
    return SceneCanvas(
      style: style,
      builder: (s) => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          label(s, labelText, mono: true),
          gap(s),
          FittedBox(
            child: label(
              s,
              value.toString().padLeft(pad, '0'),
              mono: true,
              size: 180,
              lines: 1,
            ),
          ),
          gap(s),
          rule(s, progress: 1 - unit(progress)),
        ],
      ),
    );
  }
}

class MetricComparison extends StatelessWidget {
  const MetricComparison({
    super.key,
    required this.first,
    required this.second,
    required this.firstLabel,
    required this.secondLabel,
    this.unitLabel = '',
    this.source = '',
    this.progress = 1,
    this.style,
  });
  final double first, second, progress;
  final String firstLabel, secondLabel, unitLabel, source;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    if (!first.isFinite || !second.isFinite)
      throw ArgumentError('Metrics must be finite');
    return SceneCanvas(
      style: style,
      builder: (s) => Column(
        children: [
          Expanded(
            child: Row(
              children: [
                for (final item in [(first, firstLabel), (second, secondLabel)])
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.all(s.spacing / 2),
                      child: panel(
                        s,
                        Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            label(s, item.$2, mono: true),
                            gap(s),
                            FittedBox(
                              child: heading(
                                s,
                                '${(item.$1 * unit(progress)).toStringAsFixed(0)}$unitLabel',
                                size: 72,
                                lines: 1,
                              ),
                            ),
                          ],
                        ),
                        accent: item.$2 == secondLabel,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          gap(s),
          label(
            s,
            'Difference ${(second - first).toStringAsFixed(1)}$unitLabel · $source',
            mono: true,
            size: 16,
          ),
        ],
      ),
    );
  }
}

class RouteTrace extends StatelessWidget {
  const RouteTrace({
    super.key,
    required this.map,
    required this.points,
    this.labels = const [],
    this.progress = 1,
    this.style,
  });
  final Widget map;
  final List<Offset> points;
  final List<String> labels;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    if (points.length < 2 ||
        points.length > 100 ||
        points.any(
          (p) =>
              !p.dx.isFinite ||
              !p.dy.isFinite ||
              p.dx < 0 ||
              p.dx > 1 ||
              p.dy < 0 ||
              p.dy > 1,
        ) ||
        labels.isNotEmpty && labels.length != points.length)
      throw ArgumentError('Use 2–100 normalized points and matching labels');
    final s = VideoThemeScope.resolve(context, style);
    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          map,
          CustomPaint(
            painter: _RoutePainter(s, points, labels, unit(progress)),
          ),
        ],
      ),
    );
  }
}

class LocationCard extends StatelessWidget {
  const LocationCard({
    super.key,
    required this.map,
    required this.address,
    this.details = '',
    this.pin = const Offset(.5, .5),
    this.progress = 1,
    this.style,
  });
  final Widget map;
  final String address, details;
  final Offset pin;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    if (!pin.dx.isFinite ||
        !pin.dy.isFinite ||
        pin.dx < 0 ||
        pin.dx > 1 ||
        pin.dy < 0 ||
        pin.dy > 1)
      throw ArgumentError('Pin must be normalized');
    return SceneCanvas(
      style: style,
      builder: (s) => enter(
        panel(
          s,
          Column(
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    map,
                    Align(
                      alignment: Alignment(pin.dx * 2 - 1, pin.dy * 2 - 1),
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: s.accent,
                          shape: BoxShape.circle,
                          border: Border.all(color: s.foreground, width: 4),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              gap(s),
              Align(
                alignment: Alignment.centerLeft,
                child: heading(s, address, size: 30),
              ),
              gap(s, .5),
              Align(
                alignment: Alignment.centerLeft,
                child: label(s, details, mono: true),
              ),
            ],
          ),
        ),
        progress,
      ),
    );
  }
}

class _RoutePainter extends CustomPainter {
  _RoutePainter(this.s, this.points, this.labels, this.progress);
  final VideoStyle s;
  final List<Offset> points;
  final List<String> labels;
  final double progress;
  @override
  void paint(Canvas c, Size size) {
    Offset at(Offset p) => Offset(p.dx * size.width, p.dy * size.height);
    final path = Path()..moveTo(at(points.first).dx, at(points.first).dy);
    for (final p in points.skip(1)) {
      path.lineTo(at(p).dx, at(p).dy);
    }
    final metrics = path.computeMetrics().toList();
    if (metrics.isEmpty) return;
    final metric = metrics.first;
    final end = metric.length * progress;
    c.drawPath(
      path,
      Paint()
        ..color = s.rule
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
    c.drawPath(
      metric.extractPath(0, end),
      Paint()
        ..color = s.foreground
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5,
    );
    for (var i = 0; i < points.length; i++) {
      final pos = at(points[i]);
      c.drawCircle(pos, 6, Paint()..color = s.foreground);
      if (labels.isNotEmpty) {
        final text = TextPainter(
          text: TextSpan(
            text: labels[i],
            style: s.mono.copyWith(color: s.foreground, fontSize: 16),
          ),
          textDirection: TextDirection.ltr,
          maxLines: 1,
          ellipsis: '…',
        )..layout(maxWidth: 130);
        text.paint(
          c,
          Offset(
            (pos.dx + 10).clamp(0, math.max(0, size.width - text.width)),
            (pos.dy - 25).clamp(0, math.max(0, size.height - text.height)),
          ),
        );
      }
    }
    final tangent = metric.getTangentForOffset(end);
    if (tangent != null)
      c.drawCircle(tangent.position, 10, Paint()..color = s.accent);
  }

  @override
  bool shouldRepaint(_RoutePainter old) => true;
}
