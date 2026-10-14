import 'technical_specimens.dart';
import 'dart:convert';
import 'package:flutter/services.dart';

class ComponentSpec {
  ComponentSpec(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'];
  String get name => data['name'];
  String get widget => data['widget'];
  String get category => data['category'];
  String get description => data['description'];
  String get source => data['source'];
  bool get motion => data['motion'];
  Map<String, dynamic> get parameters => data['parameters'];
  List<dynamic> get variants => data['variants'];
  Map<String, dynamic> props(String variant) {
    final selected = variants.firstWhere(
      (v) => v['id'] == variant,
      orElse: () => variants.first,
    );
    return {
      for (final p in parameters.entries) p.key: p.value['default'],
      ...Map<String, dynamic>.from(selected['props']),
    };
  }
}

Future<List<ComponentSpec>> loadCatalog() async {
  final data =
      jsonDecode(
            await rootBundle.loadString(
              'packages/video_components/components.json',
            ),
          )
          as Map<String, dynamic>;
  return (data['components'] as List).map((v) => ComponentSpec(v)).toList();
}

String flowReference(
  ComponentSpec spec,
  String variant,
  Map<String, dynamic> props,
) => const JsonEncoder.withIndent(
  '  ',
).convert({'component': spec.id, 'variant': variant, 'props': props});

String literal(Object? value) => jsonEncode(value).replaceAll(r'$', r'\$');

String dartExample(ComponentSpec spec, Map<String, dynamic> p) {
  if (isTechnical(spec)) return technicalDartExample(spec, p);
  final text = literal(p['text']);
  return switch (spec.id) {
    'video.image' =>
      'VideoImage(style: demoStyle, image: decodedImage, fit: BoxFit.${p['fit']}, framed: ${p['framed']})',
    'video.gif' =>
      'VideoGif(style: demoStyle, frames: decodedGif, seconds: outputSeconds,\n  fit: BoxFit.${p['fit']}, framed: ${p['framed']})',
    'video.video' =>
      "VideoVideo(style: demoStyle, framed: ${p['framed']},\n  child: Clip.asset('assets/clip.mp4', fit: BoxFit.${p['fit']}))",
    'video.stage' =>
      'VideoStage(style: demoStyle, theme: VideoTheme.${p['theme']}, child: content)',
    'video.block' =>
      'VideoBlock(style: demoStyle, active: ${p['active']}, padding: ${p['padding']},\n  child: Text($text))',
    'video.caption' =>
      'VideoCaption(style: demoStyle, $text, fontSize: ${p['fontSize']})',
    'video.code' =>
      'VideoCode(style: demoStyle, lines: ${literal((p['text'] as String).split('\n'))},\n  focusLine: ${effectiveFocus(p)})',
    'video.layers' =>
      'VideoLayers(style: demoStyle, expansion: progress, activeLayer: ${p['activeLayer']})',
    'video.texture' =>
      'VideoTexture(style: demoStyle, programs: programs, seconds: outputSeconds,\n  animated: ${p['animated']}, strong: ${p['strong']}, accentPalette: ${p['accentPalette']})',
    'video.dither-background' =>
      'VideoDitherBackground(style: demoStyle, programs: programs, seconds: outputSeconds,\n  speed: ${p['speed']}, pixelSize: ${p['pixelSize']}, accentPalette: ${p['accentPalette']}, child: content)',
    'video.type' => 'Text($text, style: demoStyle.${p['role']})',
    'video.reveal' =>
      'Reveal(progress: progress, child: VideoBlock(style: demoStyle, child: Text($text)))',
    _ => throw StateError('Missing example: ${spec.id}'),
  };
}

int effectiveFocus(Map<String, dynamic> p) => (p['focusLine'] as num)
    .toInt()
    .clamp(0, (p['text'] as String).split('\n').length - 1);
