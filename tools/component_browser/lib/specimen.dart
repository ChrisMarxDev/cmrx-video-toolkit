import 'technical_specimens.dart';
import 'demo_style.dart';
import 'package:flutter/widgets.dart';
import 'package:video_components/video_components.dart';
import 'catalog.dart';
import 'demo_media.dart';
import 'video_preview.dart';

Widget specimen(
  ComponentSpec spec,
  Map<String, dynamic> p,
  double progress,
  DitherPrograms? programs, {
  bool videoControls = false,
}) {
  if (isTechnical(spec)) return technicalSpecimen(spec, p, progress);
  double number(String key) => (p[key] as num).toDouble();
  Widget centered(Widget child) => Center(
    child: Padding(padding: const EdgeInsets.all(32), child: child),
  );
  final content = switch (spec.id) {
    'video.image' =>
      demoImage == null
          ? const SizedBox()
          : Padding(
              padding: const EdgeInsets.all(32),
              child: VideoImage(
                style: demoStyle,
                image: demoImage!.images.first,
                fit: p['fit'] == 'cover' ? BoxFit.cover : BoxFit.contain,
                framed: p['framed'],
              ),
            ),
    'video.gif' =>
      demoGif == null
          ? const SizedBox()
          : Padding(
              padding: const EdgeInsets.all(32),
              child: VideoGif(
                style: demoStyle,
                frames: demoGif!,
                seconds: progress * 10,
                fit: p['fit'] == 'cover' ? BoxFit.cover : BoxFit.contain,
                framed: p['framed'],
              ),
            ),
    'video.video' => Padding(
      padding: const EdgeInsets.all(32),
      child: VideoVideo(
        style: demoStyle,
        framed: p['framed'],
        child: videoControls
            ? videoPreview(p['fit'] == 'cover' ? BoxFit.cover : BoxFit.contain)
            : (demoImage == null
                  ? const SizedBox()
                  : VideoImage(
                      style: demoStyle,
                      image: demoImage!.images.first,
                      fit: p['fit'] == 'cover' ? BoxFit.cover : BoxFit.contain,
                    )),
      ),
    ),
    'video.stage' => VideoStage(
      style: demoStyle,
      theme: p['theme'] == 'dark' ? VideoTheme.dark : VideoTheme.light,
      child: centered(const Text('An idea takes shape.')),
    ),
    'video.block' => centered(
      VideoBlock(
        style: demoStyle,
        active: p['active'],
        padding: number('padding'),
        child: Text(p['text']),
      ),
    ),
    'video.caption' => centered(
      VideoCaption(style: demoStyle, p['text'], fontSize: number('fontSize')),
    ),
    'video.code' => centered(
      VideoCode(
        style: demoStyle,
        lines: (p['text'] as String).split('\n'),
        focusLine: effectiveFocus(p),
      ),
    ),
    'video.layers' => Padding(
      padding: const EdgeInsets.all(24),
      child: VideoLayers(
        style: demoStyle,
        expansion: progress,
        activeLayer: (p['activeLayer'] as num).toInt(),
      ),
    ),
    'video.texture' =>
      programs == null
          ? shaderUnavailable()
          : Padding(
              padding: const EdgeInsets.all(32),
              child: VideoTexture(
                style: demoStyle,
                programs: programs,
                seconds: progress * 10,
                animated: p['animated'],
                strong: p['strong'],
                accentPalette: p['accentPalette'],
              ),
            ),
    'video.dither-background' =>
      programs == null
          ? shaderUnavailable()
          : VideoDitherBackground(
              style: demoStyle,
              programs: programs,
              seconds: progress * 10,
              speed: number('speed'),
              accentPalette: p['accentPalette'],
              pixelSize: number('pixelSize'),
              child: centered(
                const VideoBlock(
                  style: demoStyle,
                  child: Text('Clean foreground'),
                ),
              ),
            ),
    'video.type' => centered(
      Text(
        p['text'],
        style: switch (p['role']) {
          'mono' => DemoType.mono,
          'caption' => DemoType.caption,
          _ => DemoType.body,
        },
      ),
    ),
    'video.reveal' => centered(
      Reveal(
        progress: progress,
        child: VideoBlock(style: demoStyle, child: Text(p['text'])),
      ),
    ),
    _ => throw StateError('Missing specimen: ${spec.id}'),
  };
  return VideoStage(
    style: demoStyle,
    child: ColoredBox(
      color: spec.id == 'video.type' && p['role'] == 'caption'
          ? DemoPalette.ink
          : DemoPalette.surface,
      child: content,
    ),
  );
}

Widget shaderUnavailable() => const Center(
  child: Padding(
    padding: EdgeInsets.all(24),
    child: Text(
      'Shader preview unavailable.\nUse the native gallery to inspect this component.',
      textAlign: TextAlign.center,
    ),
  ),
);

class SpecimenFrame extends StatelessWidget {
  const SpecimenFrame({
    super.key,
    required this.spec,
    required this.props,
    required this.progress,
    this.programs,
    this.videoControls = false,
    this.canvas = const Size(540, 360),
  });
  final ComponentSpec spec;
  final Map<String, dynamic> props;
  final double progress;
  final DitherPrograms? programs;
  final Size canvas;
  final bool videoControls;
  @override
  Widget build(BuildContext context) => ClipRect(
    child: FittedBox(
      fit: BoxFit.contain,
      child: SizedBox(
        width: canvas.width,
        height: canvas.height,
        child: specimen(
          spec,
          props,
          progress,
          programs,
          videoControls: videoControls,
        ),
      ),
    ),
  );
}
