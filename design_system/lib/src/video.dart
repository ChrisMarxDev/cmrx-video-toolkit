import 'package:fluvie/fluvie.dart';

/// Same scene/audio timing at half width and height (one quarter raw-frame disk).
Video draftVideo(Video video) => Video(
  size: VideoSize(video.width ~/ 2, video.height ~/ 2),
  fps: video.fps,
  scenes: video.scenes,
  audio: video.audio,
  captions: video.captions,
  motionDefaults: video.motionDefaults,
  transition: video.transition,
  export: video.export,
  poster: video.poster,
);
