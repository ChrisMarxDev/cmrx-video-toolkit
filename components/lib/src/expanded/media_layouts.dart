import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

Widget screen(
  VideoStyle s,
  Widget child, {
  double width = 360,
  double height = 240,
}) => SizedBox(
  width: width,
  height: height,
  child: panel(s, ClipRect(child: child), padding: 8),
);

class ScreenshotRail extends StatelessWidget {
  const ScreenshotRail({
    super.key,
    required this.screens,
    this.position = 0,
    this.perspective = .1,
    this.style,
  });
  final List<Widget> screens;
  final double position, perspective;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(screens, 'screens', max: 12);
    if (!position.isFinite || !perspective.isFinite)
      throw ArgumentError('Rail inputs must be finite');
    return SceneCanvas(
      style: style,
      padding: false,
      builder: (s) => ClipRect(
        child: Stack(
          children: [
            for (var i = 0; i < screens.length; i++)
              Positioned(
                left: 220 + (i - position.clamp(0, screens.length - 1)) * 390,
                top: 105,
                child: Transform(
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, .001)
                    ..rotateY(perspective.clamp(-.6, .6)),
                  alignment: Alignment.center,
                  child: screen(s, screens[i], height: 290),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ScreenshotStack extends StatelessWidget {
  const ScreenshotStack({
    super.key,
    required this.screens,
    this.activeIndex = 0,
    this.progress = 1,
    this.style,
  });
  final List<Widget> screens;
  final int activeIndex;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(screens, 'screens', max: 8);
    final active = activeIndex.clamp(0, screens.length - 1);
    final order = [
      for (var i = 0; i < screens.length; i++)
        if (i != active) i,
      active,
    ];
    return SceneCanvas(
      style: style,
      padding: false,
      builder: (s) => Stack(
        children: [
          for (var n = 0; n < order.length; n++)
            Positioned(
              left: 150 + n * 22 * unit(progress),
              top: 70 + n * 18 * unit(progress),
              child: Transform.rotate(
                angle: (n - order.length + 1) * -.035 * unit(progress),
                child: screen(s, screens[order[n]], width: 440, height: 300),
              ),
            ),
        ],
      ),
    );
  }
}

class ScreenshotFan extends StatelessWidget {
  const ScreenshotFan({
    super.key,
    required this.screens,
    this.spread = .28,
    this.focus = 0,
    this.progress = 1,
    this.style,
  });
  final List<Widget> screens;
  final double spread, progress;
  final int focus;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(screens, 'screens', max: 7);
    if (!spread.isFinite) throw ArgumentError('spread must be finite');
    final order = [
      for (var i = 0; i < screens.length; i++)
        if (i != focus) i,
      if (focus >= 0 && focus < screens.length) focus,
    ];
    return SceneCanvas(
      style: style,
      padding: false,
      builder: (s) => Stack(
        children: [
          for (final i in order)
            Positioned(
              left: 220 + (i - (screens.length - 1) / 2) * 65 * unit(progress),
              top: 100,
              child: Transform.rotate(
                angle:
                    (i - (screens.length - 1) / 2) *
                    spread.clamp(0, .6) *
                    unit(progress),
                alignment: Alignment.bottomCenter,
                child: screen(s, screens[i], height: 270),
              ),
            ),
        ],
      ),
    );
  }
}

class DeviceScreenSwap extends StatelessWidget {
  const DeviceScreenSwap({
    super.key,
    required this.from,
    required this.to,
    this.progress = 0,
    this.portrait = true,
    this.style,
  });
  final Widget from, to;
  final double progress;
  final bool portrait;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    padding: false,
    builder: (s) => Center(
      child: Container(
        width: portrait ? 230 : 650,
        height: portrait ? 450 : 390,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: s.foreground,
          borderRadius: BorderRadius.circular(math.max(12, s.radius)),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(math.max(4, s.radius - 8)),
          child: Stack(
            fit: StackFit.expand,
            children: [
              from,
              Opacity(opacity: unit(progress), child: to),
            ],
          ),
        ),
      ),
    ),
  );
}

class EditorialImageGrid extends StatelessWidget {
  const EditorialImageGrid({
    super.key,
    required this.media,
    this.activeTile = -1,
    this.progress = 1,
    this.style,
  });
  final List<Widget> media;
  final int activeTile;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    if (media.length < 3 || media.length > 5)
      throw ArgumentError('Grid requires 3–5 media slots');
    return SceneCanvas(
      style: style,
      builder: (s) => Row(
        children: [
          Expanded(
            flex: 3,
            child: enter(
              panel(
                s,
                media.first,
                accent: activeTile == 0,
                padding: activeTile == 0 ? 8 : 0,
              ),
              progress,
            ),
          ),
          SizedBox(width: s.spacing),
          Expanded(
            flex: 2,
            child: Column(
              children: [
                for (var i = 1; i < media.length; i++)
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        bottom: i == media.length - 1 ? 0 : s.spacing,
                      ),
                      child: enter(
                        panel(
                          s,
                          media[i],
                          accent: activeTile == i,
                          padding: activeTile == i ? 8 : 0,
                        ),
                        (unit(progress) * media.length - i).clamp(0.0, 1.0),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class FocusCarousel extends StatelessWidget {
  const FocusCarousel({
    super.key,
    required this.items,
    this.position = 0,
    this.style,
  });
  final List<Widget> items;
  final double position;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(items, 'items', max: 12);
    if (!position.isFinite) throw ArgumentError('position must be finite');
    final p = position.clamp(0, items.length - 1);
    final order = List.generate(items.length, (i) => i)
      ..sort((a, b) => (b - p).abs().compareTo((a - p).abs()));
    return SceneCanvas(
      style: style,
      padding: false,
      builder: (s) => Stack(
        children: [
          for (final i in order)
            Positioned(
              left: 220 + (i - p) * 275,
              top: 100,
              child: Opacity(
                opacity: (1 - (i - p).abs() * .25).clamp(.15, 1.0),
                child: Transform.scale(
                  scale: (1 - (i - p).abs() * .18).clamp(.5, 1.0),
                  child: screen(s, items[i], height: 300),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
