import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

enum WipeDirection { left, right, up, down }

abstract class SceneTransition extends StatelessWidget {
  const SceneTransition({
    super.key,
    required this.from,
    required this.to,
    required this.progress,
  });
  final Widget from, to;
  final double progress;
  CustomClipper<Path> clipper(double p);
  @override
  Widget build(BuildContext context) {
    final p = unit(progress);
    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          from,
          ClipPath(clipper: clipper(p), child: to),
        ],
      ),
    );
  }
}

class StripeWipe extends SceneTransition {
  const StripeWipe({
    super.key,
    required super.from,
    required super.to,
    required super.progress,
    this.count = 8,
    this.direction = WipeDirection.right,
  });
  final int count;
  final WipeDirection direction;
  @override
  CustomClipper<Path> clipper(double p) {
    if (count < 1 || count > 64) throw ArgumentError('count must be 1–64');
    return _RevealClip(p, 0, count, 1, direction);
  }
}

class DotIris extends SceneTransition {
  const DotIris({
    super.key,
    required super.from,
    required super.to,
    required super.progress,
    this.columns = 12,
    this.rows = 8,
    this.center = const Offset(.5, .5),
  });
  final int columns, rows;
  final Offset center;
  @override
  CustomClipper<Path> clipper(double p) {
    _grid(columns, rows);
    if (!center.dx.isFinite || !center.dy.isFinite)
      throw ArgumentError('center must be finite');
    return _RevealClip(
      p,
      1,
      columns,
      rows,
      WipeDirection.right,
      center: center,
    );
  }
}

class TileWave extends SceneTransition {
  const TileWave({
    super.key,
    required super.from,
    required super.to,
    required super.progress,
    this.columns = 8,
    this.rows = 5,
  });
  final int columns, rows;
  @override
  CustomClipper<Path> clipper(double p) {
    _grid(columns, rows);
    return _RevealClip(p, 2, columns, rows, WipeDirection.right);
  }
}

class AlternatingPanels extends SceneTransition {
  const AlternatingPanels({
    super.key,
    required super.from,
    required super.to,
    required super.progress,
    this.count = 6,
  });
  final int count;
  @override
  CustomClipper<Path> clipper(double p) {
    if (count < 1 || count > 64) throw ArgumentError('count must be 1–64');
    return _RevealClip(p, 3, count, 1, WipeDirection.right);
  }
}

class FramePushThrough extends StatelessWidget {
  const FramePushThrough({
    super.key,
    required this.from,
    required this.to,
    required this.progress,
    this.style,
  });
  final Widget from, to;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    final p = unit(progress);
    final s = VideoThemeScope.resolve(context, style);
    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          from,
          Center(
            child: FractionallySizedBox(
              widthFactor: p,
              heightFactor: p,
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(
                    color: s.foreground,
                    width: p == 0 || p == 1 ? 0 : s.borderWidth + 4,
                  ),
                ),
                child: ClipRect(child: to),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LetterboxReveal extends StatelessWidget {
  const LetterboxReveal({
    super.key,
    required this.from,
    required this.to,
    required this.progress,
  });
  final Widget from, to;
  final double progress;
  @override
  Widget build(BuildContext context) => ClipRect(
    child: Stack(
      fit: StackFit.expand,
      children: [
        from,
        ClipPath(
          clipper: _RevealClip(unit(progress), 4, 1, 1, WipeDirection.right),
          child: to,
        ),
      ],
    ),
  );
}

void _grid(int x, int y) {
  if (x < 1 || y < 1 || x > 32 || y > 32)
    throw ArgumentError('grid dimensions must be 1–32');
}

class _RevealClip extends CustomClipper<Path> {
  const _RevealClip(
    this.p,
    this.kind,
    this.columns,
    this.rows,
    this.direction, {
    this.center = const Offset(.5, .5),
  });
  final double p;
  final int kind, columns, rows;
  final WipeDirection direction;
  final Offset center;
  @override
  Path getClip(Size size) {
    final path = Path();
    final w = size.width, h = size.height;
    if (p == 0) return path;
    if (p == 1) return path..addRect(Offset.zero & size);
    if (kind == 4)
      return path..addRect(Rect.fromLTWH(0, h * (1 - p) / 2, w, h * p));
    if (kind == 0 || kind == 3) {
      final vertical =
          kind == 3 ||
          direction == WipeDirection.up ||
          direction == WipeDirection.down;
      for (var i = 0; i < columns; i++) {
        final q = (p * 1.35 - i / columns * .35).clamp(0.0, 1.0);
        final reverse = kind == 3
            ? i.isOdd
            : direction == WipeDirection.left || direction == WipeDirection.up;
        path.addRect(
          vertical
              ? Rect.fromLTWH(
                  i * w / columns,
                  reverse ? h * (1 - q) : 0,
                  w / columns + .5,
                  h * q,
                )
              : Rect.fromLTWH(
                  reverse ? w * (1 - q) : 0,
                  i * h / columns,
                  w * q,
                  h / columns + .5,
                ),
        );
      }
      return path;
    }
    final cw = w / columns, ch = h / rows;
    for (var y = 0; y < rows; y++)
      for (var x = 0; x < columns; x++) {
        final distance = Offset(
          (x + .5) / columns - center.dx,
          (y + .5) / rows - center.dy,
        ).distance;
        final delay = kind == 1
            ? distance * .45
            : (x / columns + y / rows) * .2;
        final q = (p * 1.6 - delay).clamp(0.0, 1.0);
        final c = Offset((x + .5) * cw, (y + .5) * ch);
        if (kind == 1) {
          path.addOval(
            Rect.fromCircle(
              center: c,
              radius: math.sqrt(cw * cw + ch * ch) / 2 * q,
            ),
          );
        } else {
          path.addRect(
            Rect.fromCenter(center: c, width: cw * q, height: ch * q),
          );
        }
      }
    return path;
  }

  @override
  bool shouldReclip(_RevealClip old) =>
      p != old.p ||
      kind != old.kind ||
      columns != old.columns ||
      rows != old.rows ||
      direction != old.direction ||
      center != old.center;
}

/// Transparent -> solid color -> transparent, moving onward in one direction.
/// Change the underlying chapter at progress .5 (fully covered from .45 to .55).
class ChapterWipe extends StatelessWidget {
  const ChapterWipe({
    super.key,
    required this.progress,
    this.count = 8,
    this.direction = WipeDirection.right,
    this.color,
    this.style,
  });
  final double progress;
  final int count;
  final WipeDirection direction;
  final Color? color;
  final VideoStyle? style;

  @override
  Widget build(BuildContext context) {
    if (!progress.isFinite || count < 1 || count > 64) {
      throw ArgumentError('Use finite progress and 1–64 stripes.');
    }
    final fill = color ?? VideoThemeScope.resolve(context, style).accent;
    return IgnorePointer(
      child: ClipPath(
        clipper: _ChapterClip(progress.clamp(0.0, 1.0), count, direction),
        child: ColoredBox(color: fill, child: const SizedBox.expand()),
      ),
    );
  }
}

class _ChapterClip extends CustomClipper<Path> {
  const _ChapterClip(this.p, this.count, this.direction);
  final double p;
  final int count;
  final WipeDirection direction;
  @override
  Path getClip(Size size) {
    final path = Path();
    if (p <= 0 || p >= 1) return path;
    final vertical =
        direction == WipeDirection.up || direction == WipeDirection.down;
    final reverse =
        direction == WipeDirection.up || direction == WipeDirection.left;
    final length = vertical ? size.height : size.width;
    final cross = (vertical ? size.width : size.height) / count;
    for (var i = 0; i < count; i++) {
      final delay = count == 1 ? 0.0 : i / (count - 1) * .12;
      final enter = Curves.easeInOutCubic.transform(
        ((p - delay) / .33).clamp(0.0, 1.0),
      );
      final leave = Curves.easeInOutCubic.transform(
        ((p - .55 - delay) / .33).clamp(0.0, 1.0),
      );
      final start = (reverse ? 1 - enter : leave) * length;
      final end = (reverse ? 1 - leave : enter) * length;
      if (end <= start) continue;
      path.addRect(
        vertical
            ? Rect.fromLTWH(i * cross, start, cross, end - start)
            : Rect.fromLTWH(start, i * cross, end - start, cross),
      );
    }
    return path;
  }

  @override
  bool shouldReclip(_ChapterClip old) =>
      old.p != p || old.count != count || old.direction != direction;
}
