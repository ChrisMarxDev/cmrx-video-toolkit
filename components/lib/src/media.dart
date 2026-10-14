import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import 'style.dart';

/// Shared clean media surface. Caller owns the content's fit and playback.
class VideoVideo extends StatelessWidget {
  const VideoVideo({
    super.key,
    required this.style,
    required this.child,
    this.framed = false,
  });
  final VideoStyle style;
  final Widget child;
  final bool framed;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(framed ? 8 : 0),
    color: framed ? style.accent : style.foreground,
    child: ClipRect(child: child),
  );
}

/// Pass a predecoded image for deterministic capture; the caller disposes it.
class VideoImage extends StatelessWidget {
  const VideoImage({
    super.key,
    required this.style,
    required this.image,
    this.fit = BoxFit.contain,
    this.framed = false,
  });
  final VideoStyle style;
  final ui.Image image;
  final BoxFit fit;
  final bool framed;
  @override
  Widget build(BuildContext context) => VideoVideo(
    style: style,
    framed: framed,
    child: RawImage(
      image: image,
      fit: fit,
      width: double.infinity,
      height: double.infinity,
    ),
  );
}

/// Decode once before capture. Frame selection uses encoded GIF durations.
class VideoGifFrames {
  VideoGifFrames._(this.images, this.durations);
  final List<ui.Image> images;
  final List<Duration> durations;
  static Future<VideoGifFrames> decode(Uint8List bytes) async {
    final codec = await ui.instantiateImageCodec(bytes);
    final images = <ui.Image>[];
    final durations = <Duration>[];
    try {
      for (var i = 0; i < codec.frameCount; i++) {
        final frame = await codec.getNextFrame();
        images.add(frame.image);
        durations.add(
          frame.duration > Duration.zero
              ? frame.duration
              : const Duration(milliseconds: 100),
        );
      }
      return VideoGifFrames._(
        List.unmodifiable(images),
        List.unmodifiable(durations),
      );
    } catch (_) {
      for (final image in images) {
        image.dispose();
      }
      rethrow;
    } finally {
      codec.dispose();
    }
  }

  ui.Image at(double seconds) {
    if (!seconds.isFinite || seconds < 0)
      throw ArgumentError.value(seconds, 'seconds');
    final total = durations.fold<int>(0, (sum, d) => sum + d.inMicroseconds);
    var time = (seconds * Duration.microsecondsPerSecond).floor() % total;
    for (var i = 0; i < images.length; i++) {
      if (time < durations[i].inMicroseconds) return images[i];
      time -= durations[i].inMicroseconds;
    }
    return images.last;
  }

  void dispose() {
    for (final image in images) {
      image.dispose();
    }
  }
}

/// Looping, reverse-seek-safe GIF. No timer or asynchronous decoding in build.
class VideoGif extends StatelessWidget {
  const VideoGif({
    super.key,
    required this.style,
    required this.frames,
    required this.seconds,
    this.fit = BoxFit.contain,
    this.framed = false,
  });
  final VideoStyle style;
  final VideoGifFrames frames;
  final double seconds;
  final BoxFit fit;
  final bool framed;
  @override
  Widget build(BuildContext context) => VideoImage(
    style: style,
    image: frames.at(seconds),
    fit: fit,
    framed: framed,
  );
}
