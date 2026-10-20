import 'dart:ui' as ui;
import 'package:flutter/services.dart';
import 'package:video_components/video_components.dart';

VideoGifFrames? demoImage;
VideoGifFrames? demoGif;
ui.FragmentProgram? cameraFrameProgram;
Future<void> loadDemoMedia() async {
  try {
    cameraFrameProgram ??= await CameraFrame.loadProgram();
  } catch (_) {
    // The camera specimen shows the shader-unavailable state on unsupported hosts.
  }
  demoImage ??= await VideoGifFrames.decode(
    (await rootBundle.load('assets/demo/image.png')).buffer.asUint8List(),
  );
  demoGif ??= await VideoGifFrames.decode(
    (await rootBundle.load('assets/demo/loop.gif')).buffer.asUint8List(),
  );
}
