import 'package:flutter/services.dart';
import 'package:video_components/video_components.dart';

VideoGifFrames? demoImage;
VideoGifFrames? demoGif;
Future<void> loadDemoMedia() async {
  demoImage ??= await VideoGifFrames.decode(
    (await rootBundle.load('assets/demo/image.png')).buffer.asUint8List(),
  );
  demoGif ??= await VideoGifFrames.decode(
    (await rootBundle.load('assets/demo/loop.gif')).buffer.asUint8List(),
  );
}
