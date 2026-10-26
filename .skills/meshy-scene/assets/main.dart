import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_scene/scene.dart' as fs;
import 'package:vector_math/vector_math.dart' as vm;

// This is a disposable capture app, not a widget or plugin in the video pipeline.
// Configure through --dart-define. A new output directory is required each run.
final output =
    Platform.environment['SCENE_OUTPUT'] ??
    const String.fromEnvironment('OUTPUT');
const width = int.fromEnvironment('WIDTH', defaultValue: 720);
const height = int.fromEnvironment('HEIGHT', defaultValue: 1280);
const fps = int.fromEnvironment('FPS', defaultValue: 30);
const frames = int.fromEnvironment('FRAMES', defaultValue: 90);
const clipIndex = int.fromEnvironment('CLIP', defaultValue: -1);
const loop = bool.fromEnvironment('LOOP', defaultValue: true);
const transparent = bool.fromEnvironment('TRANSPARENT', defaultValue: true);
final speed = double.parse(
  const String.fromEnvironment('SPEED', defaultValue: '1'),
);
final scale = double.parse(
  const String.fromEnvironment('SCALE', defaultValue: '1'),
);
final orbit = double.parse(
  const String.fromEnvironment('ORBIT', defaultValue: '0'),
);
final cameraDistance = double.parse(
  const String.fromEnvironment('CAMERA_DISTANCE', defaultValue: '4'),
);
final targetY = double.parse(
  const String.fromEnvironment('TARGET_Y', defaultValue: '0.9'),
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SizedBox.expand());
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    try {
      await capture();
      exit(0);
    } catch (error, stack) {
      stderr.writeln('$error\n$stack');
      exit(1);
    }
  });
}

Future<void> capture() async {
  if (output.isEmpty ||
      !output.startsWith('/') ||
      Directory(output).existsSync()) {
    throw ArgumentError('OUTPUT must be an absolute, new directory');
  }
  if (width <= 0 ||
      height <= 0 ||
      fps <= 0 ||
      frames <= 0 ||
      !speed.isFinite ||
      speed < 0 ||
      !scale.isFinite ||
      scale <= 0 ||
      !orbit.isFinite ||
      !cameraDistance.isFinite ||
      cameraDistance <= 0 ||
      !targetY.isFinite) {
    throw ArgumentError(
      'Invalid capture dimensions, timing or camera parameters',
    );
  }
  final dir = Directory(output)..createSync(recursive: true);
  await fs.Scene.initializeStaticResources();
  final scene = fs.Scene();
  try {
    final model = await fs.Node.fromGlbAsset('assets/model.glb');
    // Put placement on a parent so imported animation cannot overwrite it.
    final placement = fs.Node()..scale = vm.Vector3.all(scale);
    placement.add(model);
    scene.add(placement);
    final animations = model.parsedAnimations;
    stdout.writeln(
      jsonEncode({
        'animations': [
          for (var i = 0; i < animations.length; i++)
            {
              'index': i,
              'name': animations[i].name,
              'seconds': animations[i].endTime,
            },
        ],
      }),
    );
    if (clipIndex < -1 || clipIndex >= animations.length) {
      throw ArgumentError(
        'CLIP is -1 for static or an imported animation index',
      );
    }
    final animation = clipIndex < 0 ? null : animations[clipIndex];
    final clip = animation == null
        ? null
        : model.createAnimationClip(animation);
    clip?.pause();
    scene.directionalLight = fs.DirectionalLight(
      direction: vm.Vector3(-0.5, -1, -0.5),
      intensity: 2,
    );
    fs.PerspectiveCamera cameraAt(double t) => fs.PerspectiveCamera(
      position: vm.Vector3(
        cameraDistance * math.sin(orbit * t),
        targetY + 0.3,
        cameraDistance * math.cos(orbit * t),
      ),
      target: vm.Vector3(0, targetY, 0),
      fovRadiansY: math.pi / 4,
    );
    void sample(int frame) {
      if (clip != null && animation != null) {
        final t = frame / fps * speed;
        final end = animation.endTime;
        clip.seek(loop && end > 0 ? t % end : math.min(t, end));
      }
      // Paused clips still apply sampled transforms. No wall-clock advancement.
      scene.update(0);
    }

    sample(0);
    await fs.Scene.preload();
    await scene.warmUp([fs.RenderView(camera: cameraAt(0))]);
    for (var frame = 0; frame < frames; frame++) {
      sample(frame);
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      canvas.drawColor(
        Color(transparent ? 0x00000000 : 0xFF202020),
        BlendMode.src,
      );
      scene.render(
        cameraAt(frame / fps),
        canvas,
        viewport: Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
        pixelRatio: 1,
      );
      final picture = recorder.endRecording();
      final image = await picture.toImage(width, height);
      try {
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        if (data == null) throw StateError('Missing pixels for frame $frame');
        File('${dir.path}/frame-${frame.toString().padLeft(6, '0')}.png')
            .writeAsBytesSync(
              data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
            );
      } finally {
        image.dispose();
        picture.dispose();
      }
    }
    // Written only after every frame succeeds. Partial sequences cannot encode.
    File('${dir.path}/complete.json').writeAsStringSync(
      jsonEncode({
        'frames': frames,
        'fps': fps,
        'width': width,
        'height': height,
        'clip': clipIndex,
        'speed': speed,
        'loop': loop,
        'transparent': transparent,
        'scale': scale,
        'orbit': orbit,
        'cameraDistance': cameraDistance,
        'targetY': targetY,
        'flutterScene': '0.24.3',
      }),
    );
  } finally {
    scene.dispose();
  }
}
