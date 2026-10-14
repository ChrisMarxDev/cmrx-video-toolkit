import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

/// Browser-only inspection; video exports use the composition's Fluvie Clip.
Widget videoPreview(BoxFit fit) => _VideoPreview(fit: fit);

class _VideoPreview extends StatefulWidget {
  const _VideoPreview({required this.fit});
  final BoxFit fit;
  @override
  State<_VideoPreview> createState() => _VideoPreviewState();
}

class _VideoPreviewState extends State<_VideoPreview> {
  web.HTMLVideoElement? video;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Navigator keeps older pages mounted: do not leave hidden videos playing.
    if (!TickerMode.valuesOf(context).enabled) video?.pause();
  }

  @override
  void didUpdateWidget(_VideoPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    video?.style.objectFit = widget.fit == BoxFit.cover ? 'cover' : 'contain';
  }

  @override
  void dispose() {
    video?.pause();
    video?.removeAttribute('src');
    video?.load();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => HtmlElementView.fromTagName(
    tagName: 'video',
    onElementCreated: (element) {
      final player = element as web.HTMLVideoElement;
      video = player;
      player.src = 'assets/assets/demo/clip.mp4';
      player.poster = 'assets/assets/demo/image.png';
      player.controls = true;
      player.muted = true;
      player.loop = true;
      player.playsInline = true;
      player.preload = 'metadata';
      player.setAttribute(
        'aria-label',
        'Original CMRX Video Toolkit demo video. Use the playback controls to play or seek.',
      );
      player.style.width = '100%';
      player.style.height = '100%';
      player.style.objectFit = widget.fit == BoxFit.cover ? 'cover' : 'contain';
    },
  );
}
