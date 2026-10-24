import 'package:video_components/expanded_samples.dart';
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
  VideoStyle style = demoStyle,
}) {
  final rendered = spec.presentation(p);
  if (!identical(rendered, spec))
    return specimen(
      rendered,
      p,
      progress,
      programs,
      videoControls: videoControls,
      style: style,
    );
  if (spec.data['expanded'] == true) {
    return VideoThemeScope(
      style: style,
      child: ColoredBox(
        color: style.background,
        child: ExpandedSpecimen(id: spec.id, props: p, progress: progress),
      ),
    );
  }
  if (isTechnical(spec))
    return technicalSpecimen(spec, p, progress, style: style);
  double number(String key) => (p[key] as num).toDouble();
  Widget centered(Widget child) => Center(
    child: Padding(padding: const EdgeInsets.all(32), child: child),
  );
  final content = switch (spec.id) {
    'video.chapter-wipe' => Stack(
      fit: StackFit.expand,
      children: [
        Center(
          child: Text(
            progress < .5 ? 'Chapter 01' : 'Chapter 02',
            style: style.body.copyWith(color: style.foreground, fontSize: 36),
          ),
        ),
        ChapterWipe(
          progress: progress,
          count: (p['count'] as num).toInt(),
          direction: WipeDirection.values.byName(p['direction']),
          color: switch (p['tone']) {
            'accent' => style.accent,
            'surface' => style.surface,
            _ => style.foreground,
          },
        ),
      ],
    ),
    'video.camera-frame' =>
      cameraFrameProgram == null
          ? shaderUnavailable()
          : Center(
              child: FractionallySizedBox(
                widthFactor: .7,
                heightFactor: .8,
                child: CameraFrame(
                  program: cameraFrameProgram!,
                  shape: CameraFrameShape.values.byName(p['shape']),
                  feather: number('feather'),
                  dither: number('dither'),
                  pixelSize: number('pixelSize'),
                  child: const SyntheticPortrait(),
                ),
              ),
            ),
    'video.image' =>
      demoImage == null
          ? const SizedBox()
          : Padding(
              padding: const EdgeInsets.all(32),
              child: VideoImage(
                style: style,
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
                style: style,
                frames: demoGif!,
                seconds: progress * 10,
                fit: p['fit'] == 'cover' ? BoxFit.cover : BoxFit.contain,
                framed: p['framed'],
              ),
            ),
    'video.video' => Padding(
      padding: const EdgeInsets.all(32),
      child: VideoVideo(
        style: style,
        framed: p['framed'],
        child: videoControls
            ? videoPreview(p['fit'] == 'cover' ? BoxFit.cover : BoxFit.contain)
            : (demoImage == null
                  ? const SizedBox()
                  : VideoImage(
                      style: style,
                      image: demoImage!.images.first,
                      fit: p['fit'] == 'cover' ? BoxFit.cover : BoxFit.contain,
                    )),
      ),
    ),
    'video.stage' => VideoStage(
      style: style,
      theme: p['theme'] == 'dark' ? VideoTheme.dark : VideoTheme.light,
      child: centered(const Text('An idea takes shape.')),
    ),
    'video.block' => centered(
      VideoBlock(
        style: style,
        active: p['active'],
        padding: number('padding'),
        child: Text(p['text']),
      ),
    ),
    'video.caption' => centered(
      VideoCaption(style: style, p['text'], fontSize: number('fontSize')),
    ),
    'video.code' => centered(
      VideoCode(
        style: style,
        lines: (p['text'] as String).split('\n'),
        focusLine: effectiveFocus(p),
      ),
    ),
    'video.texture' =>
      programs == null
          ? shaderUnavailable()
          : Padding(
              padding: const EdgeInsets.all(32),
              child: VideoTexture(
                style: style,
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
              style: style,
              programs: programs,
              seconds: progress * 10,
              speed: number('speed'),
              accentPalette: p['accentPalette'],
              pixelSize: number('pixelSize'),
              child: centered(
                VideoBlock(style: style, child: const Text('Clean foreground')),
              ),
            ),
    'video.type' => centered(
      Text(
        p['text'],
        style: switch (p['role']) {
          'mono' => style.mono,
          'caption' => style.caption,
          _ => style.body,
        },
      ),
    ),
    'video.reveal' => centered(
      Reveal(
        progress: progress,
        child: VideoBlock(style: style, child: Text(p['text'])),
      ),
    ),
    _ => throw StateError('Missing specimen: ${spec.id}'),
  };
  return VideoStage(
    style: style,
    child: ColoredBox(
      color: spec.id == 'video.type' && p['role'] == 'caption'
          ? style.foreground
          : style.surface,
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
          style: VideoThemeScope.maybeOf(context) ?? demoStyle,
        ),
      ),
    ),
  );
}
