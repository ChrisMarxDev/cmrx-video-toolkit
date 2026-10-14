import 'package:flutter/widgets.dart';

/// Pure, seek-safe timing. Values are seconds on the edited output timeline.
double cueProgress(double seconds, double start, double end) {
  if (end <= start) throw ArgumentError('Cue end must be after start');
  return ((seconds - start) / (end - start)).clamp(0.0, 1.0);
}

/// The parent supplies frame-derived progress. No AnimationController or timers.
class Reveal extends StatelessWidget {
  const Reveal({super.key, required this.progress, required this.child});
  final double progress;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final p = Curves.easeOutCubic.transform(progress.clamp(0.0, 1.0));
    return Opacity(
      opacity: p,
      child: Transform.translate(offset: Offset(0, (1 - p) * 32), child: child),
    );
  }
}
