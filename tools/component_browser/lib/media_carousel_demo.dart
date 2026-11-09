import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_components/video_components.dart';
import 'carousel_click.dart';

/// Interaction is inspection-only. Changing the timeline restores frame control.
class MediaCarouselDemo extends StatefulWidget {
  const MediaCarouselDemo({
    super.key,
    required this.props,
    required this.progress,
    required this.style,
  });
  final Map<String, dynamic> props;
  final double progress;
  final VideoStyle style;
  @override
  State<MediaCarouselDemo> createState() => _MediaCarouselDemoState();
}

class _MediaCarouselDemoState extends State<MediaCarouselDemo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _snap = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 240),
  )..addListener(() => setState(() {}));
  double? _manual;
  double _from = 0, _to = 0;
  int _selection = 0;
  int get count => (widget.props['count'] as num).toInt();
  double get position => _snap.isAnimating
      ? _from + (_to - _from) * Curves.easeOutCubic.transform(_snap.value)
      : _manual ??
            mediaCarouselPosition(
              widget.progress,
              count,
              snapFraction: (widget.props['snapFraction'] as num).toDouble(),
            );
  @override
  void didUpdateWidget(MediaCarouselDemo old) {
    super.didUpdateWidget(old);
    if (old.progress != widget.progress ||
        old.props['count'] != widget.props['count']) {
      _snap.stop();
      _manual = null;
    }
  }

  void select(int target) {
    target = target.clamp(0, count - 1);
    final start = position;
    _snap.stop();
    _from = start;
    _to = target.toDouble();
    _manual = _to;
    if (target != _selection && widget.props['clickSound'] == true)
      playCarouselClick();
    _selection = target;
    if (MediaQuery.disableAnimationsOf(context)) {
      setState(() {});
      return;
    }
    _snap.forward(from: 0);
  }

  @override
  void dispose() {
    _snap.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final sideScale = (widget.props['sideScale'] as num).toDouble();
      final ratio = (widget.props['aspectRatio'] as num).toDouble();
      final width = math.min(box.maxWidth * .56, box.maxHeight * .86 * ratio);
      final stride =
          width * (1 + sideScale) / 2 + (widget.props['gap'] as num).toDouble();
      return Focus(
        onKeyEvent: (_, event) {
          if (event is KeyDownEvent &&
              (event.logicalKey == LogicalKeyboardKey.arrowRight ||
                  event.logicalKey == LogicalKeyboardKey.arrowLeft)) {
            select(
              position.round() +
                  (event.logicalKey == LogicalKeyboardKey.arrowRight ? 1 : -1),
            );
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: Listener(
          onPointerSignal: (event) {
            if (event is PointerScrollEvent) {
              GestureBinding.instance.pointerSignalResolver.register(event, (
                _,
              ) {
                final delta =
                    event.scrollDelta.dx.abs() > event.scrollDelta.dy.abs()
                    ? event.scrollDelta.dx
                    : event.scrollDelta.dy;
                if (delta != 0 && !_snap.isAnimating)
                  select(position.round() + delta.sign.toInt());
              });
            }
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: (_) {
              final p = position;
              _snap.stop();
              _manual = p;
              _selection = p.round();
            },
            onHorizontalDragUpdate: (event) => setState(() {
              _manual = (position - event.delta.dx / stride).clamp(
                0.0,
                (count - 1).toDouble(),
              );
            }),
            onHorizontalDragEnd: (event) {
              final velocity = event.primaryVelocity ?? 0;
              select(
                position.round() +
                    (velocity.abs() > 350 ? -velocity.sign.toInt() : 0),
              );
            },
            onHorizontalDragCancel: () => select(position.round()),
            child: MediaCarousel(
              position: position,
              aspectRatio: ratio,
              sideScale: sideScale,
              gap: (widget.props['gap'] as num).toDouble(),
              radius: (widget.props['radius'] as num).toDouble(),
              sideOpacity: (widget.props['sideOpacity'] as num).toDouble(),
              onSelect: select,
              children: [
                for (var i = 0; i < count; i++)
                  CustomPaint(
                    painter: _Landscape(
                      i,
                      widget.props['mixedMedia'] == true && i.isOdd
                          ? widget.progress * 10
                          : 0,
                      widget.style,
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

/// Original synthetic image/animated-frame samples. No remote or personal media.
class _Landscape extends CustomPainter {
  const _Landscape(this.index, this.seconds, this.style);
  final int index;
  final double seconds;
  final VideoStyle style;
  @override
  void paint(Canvas canvas, Size size) {
    final palettes = [
      [style.surface, style.foreground, style.accent],
      [style.darkBackground, style.surface, style.accent],
      [style.accent, style.foreground, style.background],
      [style.foreground, style.surface, style.accent],
      [style.surface, style.darkBackground, style.background],
    ];
    final c = palettes[index % palettes.length];
    canvas.drawRect(Offset.zero & size, Paint()..color = c[0]);
    canvas.drawCircle(
      Offset(size.width * (.65 + .08 * math.sin(seconds)), size.height * .28),
      size.width * .19,
      Paint()..color = c[2],
    );
    for (var layer = 0; layer < 4; layer++) {
      final path = Path()..moveTo(0, size.height);
      for (var x = 0; x <= 80; x++) {
        final dx = x / 80;
        final y =
            .52 +
            layer * .12 +
            .10 * math.sin(dx * 5 + index + layer * .7 + seconds * .4);
        path.lineTo(size.width * dx, size.height * y);
      }
      path
        ..lineTo(size.width, size.height)
        ..close();
      canvas.drawPath(
        path,
        Paint()..color = Color.lerp(c[1], c[0], layer * .19)!,
      );
    }
  }

  @override
  bool shouldRepaint(_Landscape old) =>
      index != old.index || seconds != old.seconds || style != old.style;
}

String mediaCarouselExample(Map<String, dynamic> p) =>
    '''// Supply decoded images or frame-synchronized Clip widgets in mediaItems.
MediaCarousel(
  children: mediaItems,
  position: mediaCarouselPosition(progress, mediaItems.length, snapFraction: ${p['snapFraction']}),
  aspectRatio: ${p['aspectRatio']}, sideScale: ${p['sideScale']},
  gap: ${p['gap']}, radius: ${p['radius']}, sideOpacity: ${p['sideOpacity']},
)
${p['clickSound'] == true ? '// Optional audio: write mediaCarouselClickWav() once, then mix at\n// startSeconds + cue * durationSeconds for each mediaCarouselClickCues(mediaItems.length).' : '// Selection click disabled.'}''';
