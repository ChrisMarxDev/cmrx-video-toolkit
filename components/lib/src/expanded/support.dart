import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../style.dart';

double unit(double value) {
  if (!value.isFinite)
    throw ArgumentError.value(value, 'progress', 'Must be finite');
  return value.clamp(0.0, 1.0);
}

/// A bounded logical canvas. Content scales uniformly instead of overflowing
/// when used in narrow video frames. Supply a bounded parent.
class SceneCanvas extends StatelessWidget {
  const SceneCanvas({
    super.key,
    required this.builder,
    this.style,
    this.size = const Size(800, 500),
    this.padding = true,
  });
  final Widget Function(VideoStyle) builder;
  final VideoStyle? style;
  final Size size;
  final bool padding;
  @override
  Widget build(BuildContext context) {
    final s = VideoThemeScope.resolve(context, style);
    return VideoThemeScope(
      style: s,
      child: LayoutBuilder(
        builder: (context, c) {
          return ClipRect(
            child: Center(
              child: FittedBox(
                fit: BoxFit.contain,
                child: SizedBox(
                  width: size.width,
                  height: size.height,
                  child: DefaultTextStyle(
                    style: s.body.copyWith(color: s.foreground),
                    child: Padding(
                      padding: EdgeInsets.all(padding ? 36 : 0),
                      child: builder(s),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

Widget label(
  VideoStyle s,
  String text, {
  double size = 18,
  bool mono = false,
  Color? color,
  int lines = 3,
  TextAlign align = TextAlign.start,
  FontWeight? weight,
}) => Text(
  text,
  maxLines: lines,
  overflow: TextOverflow.ellipsis,
  textAlign: align,
  style: (mono ? s.mono : s.body).copyWith(
    fontSize: size,
    height: 1.2,
    color: color ?? s.foreground,
    fontWeight: weight,
  ),
);
Widget heading(VideoStyle s, String text, {double size = 54, int lines = 3}) =>
    label(s, text, size: size, lines: lines, weight: FontWeight.w700);
Widget gap(VideoStyle s, [double scale = 1]) =>
    SizedBox(height: s.spacing * scale);
Widget rule(VideoStyle s, {double progress = 1}) => Align(
  alignment: Alignment.centerLeft,
  child: FractionallySizedBox(
    widthFactor: unit(progress),
    child: Container(height: math.max(1, s.borderWidth), color: s.foreground),
  ),
);
Widget panel(
  VideoStyle s,
  Widget child, {
  bool accent = false,
  double? padding,
}) => Container(
  padding: EdgeInsets.all(padding ?? s.spacing),
  decoration: BoxDecoration(
    color: accent ? s.accent : s.surface,
    borderRadius: BorderRadius.circular(s.radius),
    border: Border.all(
      color: s.rule,
      width: s.borderWidth,
      style: s.borderWidth == 0 ? BorderStyle.none : BorderStyle.solid,
    ),
  ),
  child: child,
);
Widget enter(Widget child, double progress, {double dy = 24}) {
  final p = unit(progress);
  return Opacity(
    opacity: p,
    child: Transform.translate(
      offset: Offset(0, dy * (1 - p)),
      // Filter a bitmap of the text instead of re-rasterizing glyphs at snapped
      // pixel positions during slow, fractional translation (notably on web).
      filterQuality: FilterQuality.low,
      child: child,
    ),
  );
}

Widget slot(VideoStyle s, Widget child, {double? width, double? height}) =>
    ClipRRect(
      borderRadius: BorderRadius.circular(s.radius),
      child: SizedBox(
        width: width,
        height: height,
        child: ColoredBox(color: s.surface, child: child),
      ),
    );
void nonEmpty(Iterable<Object?> values, String name, {int max = 100}) {
  if (values.isEmpty || values.length > max)
    throw ArgumentError('$name requires 1–$max entries');
}

/// Small semantic marks drawn as vectors, independent of font glyph coverage.
class SceneMark extends StatelessWidget {
  const SceneMark({
    super.key,
    required this.kind,
    required this.color,
    this.size = 28,
  });
  final String kind;
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Semantics(
    label: kind,
    child: CustomPaint(
      size: Size.square(size),
      painter: _MarkPainter(kind, color),
    ),
  );
}

class _MarkPainter extends CustomPainter {
  _MarkPainter(this.kind, this.color);
  final String kind;
  final Color color;
  @override
  void paint(Canvas c, Size size) {
    c.save();
    c.scale(size.width / 28, size.height / 28);
    final p = Paint()
      ..color = color
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    switch (kind) {
      case 'done':
        c.drawPath(
          Path()
            ..moveTo(5, 14)
            ..lineTo(11, 20)
            ..lineTo(23, 7),
          p,
        );
      case 'failed':
        c.drawLine(const Offset(6, 6), const Offset(22, 22), p);
        c.drawLine(const Offset(22, 6), const Offset(6, 22), p);
      case 'running':
        c.drawCircle(const Offset(14, 14), 10, p);
        c.drawCircle(const Offset(14, 14), 4, p..style = PaintingStyle.fill);
      case 'clock':
        c.drawCircle(const Offset(14, 14), 10, p);
        c.drawPath(
          Path()
            ..moveTo(14, 7)
            ..lineTo(14, 14)
            ..lineTo(19, 17),
          p,
        );
      case 'add':
        c.drawLine(const Offset(5, 14), const Offset(23, 14), p);
        c.drawLine(const Offset(14, 5), const Offset(14, 23), p);
      default:
        c.drawCircle(const Offset(14, 14), 10, p);
    }
    c.restore();
  }

  @override
  bool shouldRepaint(_MarkPainter old) =>
      kind != old.kind || color != old.color;
}
