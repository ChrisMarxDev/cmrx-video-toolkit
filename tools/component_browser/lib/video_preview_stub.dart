import 'package:flutter/widgets.dart';
import 'package:video_components/video_components.dart';
import 'demo_media.dart';

/// Native test host shows the actual clip's first frame. Browser owns playback.
Widget videoPreview(BoxFit fit) => demoImage == null
    ? const Center(child: Text('Video preview requires the web browser.'))
    : VideoImage(image: demoImage!.images.first, fit: fit);
