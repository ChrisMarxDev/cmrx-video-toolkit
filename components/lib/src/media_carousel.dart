import 'dart:math' as math;
import 'dart:typed_data';
import 'package:flutter/widgets.dart';

/// Hold each item, then snap to the next with a fast ease-out. Pure and seekable.
/// [progress] spans the whole sequence, including a final-item hold.
double mediaCarouselPosition(
  double progress,
  int count, {
  double snapFraction = .18,
}) {
  assert(progress.isFinite);
  assert(snapFraction > 0 && snapFraction <= 1);
  if (count <= 1) return 0;
  final step = progress.clamp(0.0, 1.0) * count;
  final index = step.floor();
  if (index >= count - 1) return (count - 1).toDouble();
  final t = ((step - index - (1 - snapFraction)) / snapFraction).clamp(
    0.0,
    1.0,
  );
  return index + 1 - math.pow(1 - t, 3).toDouble();
}

/// Settled-selection cues, in normalized sequence time; no click for item zero.
List<double> mediaCarouselClickCues(int count) => [
  for (var i = 1; i < count; i++) i / count,
];

/// Original quiet 22ms PCM click for optional timeline mixing (48kHz mono WAV).
/// No asset download, randomness, playback or audio side effect in the widget.
Uint8List mediaCarouselClickWav() {
  const rate = 48000, samples = 1056;
  final data = ByteData(44 + samples * 2);
  void label(int at, String s) {
    for (var i = 0; i < s.length; i++) data.setUint8(at + i, s.codeUnitAt(i));
  }

  label(0, 'RIFF');
  data.setUint32(4, 36 + samples * 2, Endian.little);
  label(8, 'WAVE');
  label(12, 'fmt ');
  data.setUint32(16, 16, Endian.little);
  data.setUint16(20, 1, Endian.little);
  data.setUint16(22, 1, Endian.little);
  data.setUint32(24, rate, Endian.little);
  data.setUint32(28, rate * 2, Endian.little);
  data.setUint16(32, 2, Endian.little);
  data.setUint16(34, 16, Endian.little);
  label(36, 'data');
  data.setUint32(40, samples * 2, Endian.little);
  for (var i = 0; i < samples; i++) {
    final t = i / rate;
    final envelope = math.sin(math.pi * i / (samples - 1)) * math.exp(-t * 220);
    final wave = math.sin(2 * math.pi * 1800 * t) * envelope * .16;
    data.setInt16(44 + i * 2, (wave * 32767).round(), Endian.little);
  }
  return data.buffer.asUint8List();
}

/// A deterministic media selector. Supply images, decoded frames or Fluvie Clips
/// as [children]. No implicit animation, file loading or media playback occurs.
/// Integer [position] centers an item; fractional values interpolate between them.
class MediaCarousel extends StatelessWidget {
  const MediaCarousel({
    super.key,
    required this.children,
    required this.position,
    this.aspectRatio = .8,
    this.sideScale = .62,
    this.itemFraction = .56,
    this.gap = 16,
    this.radius = 24,
    this.sideOpacity = .65,
    this.onSelect,
  }) : assert(position > -double.infinity && position < double.infinity),
       assert(aspectRatio > 0 && aspectRatio < double.infinity),
       assert(sideScale > 0 && sideScale <= 1),
       assert(itemFraction > 0 && itemFraction <= 1),
       assert(gap >= 0 && gap < double.infinity),
       assert(radius >= 0 && radius < double.infinity),
       assert(sideOpacity >= 0 && sideOpacity <= 1);

  final List<Widget> children;
  final double position,
      aspectRatio,
      sideScale,
      itemFraction,
      gap,
      radius,
      sideOpacity;
  final ValueChanged<int>? onSelect;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      if (children.isEmpty) return const SizedBox.expand();
      final p = position.clamp(0.0, (children.length - 1).toDouble());
      final width = math.min(
        box.maxWidth * itemFraction,
        box.maxHeight * .86 * aspectRatio,
      );
      final height = width / aspectRatio;
      final stride = width * (1 + sideScale) / 2 + gap;
      final order = List.generate(children.length, (i) => i)
        ..sort((a, b) => (b - p).abs().compareTo((a - p).abs()));
      return ClipRect(
        child: Stack(
          children: [
            for (final i in order)
              if ((i - p).abs() * stride < box.maxWidth / 2 + width)
                Positioned(
                  key: ValueKey('carousel-item-$i'),
                  left: box.maxWidth / 2 + (i - p) * stride - width / 2,
                  top: (box.maxHeight - height) / 2,
                  width: width,
                  height: height,
                  child: Transform.scale(
                    scale: 1 - (1 - sideScale) * (i - p).abs().clamp(0.0, 1.0),
                    child: Opacity(
                      opacity:
                          1 - (1 - sideOpacity) * (i - p).abs().clamp(0.0, 1.0),
                      child: Semantics(
                        label: 'Item ${i + 1} of ${children.length}',
                        selected: i == p.round(),
                        button: onSelect != null,
                        child: GestureDetector(
                          onTap: onSelect == null ? null : () => onSelect!(i),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(radius),
                            child: children[i],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
          ],
        ),
      );
    },
  );
}
