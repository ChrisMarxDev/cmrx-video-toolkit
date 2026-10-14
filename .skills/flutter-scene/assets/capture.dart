import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_scene/scene.dart' as fs;
import 'package:vector_math/vector_math.dart' as vm;

const width = 720, height = 1280, fps = 30, frames = 240;
final output =
    Platform.environment['SCENE_OUTPUT'] ?? '${Directory.current.path}/renders';
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SizedBox.expand());
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    try {
      await capture();
      exit(0);
    } catch (e, stack) {
      File('$output/error.txt').writeAsStringSync('$e\n$stack');
      exit(1);
    }
  });
}

fs.PhysicallyBasedMaterial material(
  double r,
  double g,
  double b, {
  double metal = .35,
  double rough = .3,
}) => fs.PhysicallyBasedMaterial()
  ..baseColorFactor = vm.Vector4(r, g, b, 1)
  ..metallicFactor = metal
  ..roughnessFactor = rough;

class Piece {
  Piece(this.node, this.x, this.y, this.z);
  final fs.Node node;
  final int x, y, z;
}

class Assembly {
  final scene = fs.Scene();
  final root = fs.Node();
  final pieces = <Piece>[];
  final rings = <fs.Node>[];
  final beads = <fs.Node>[];
  late fs.Node core, movingLight;
  late fs.PointLight light;
  Assembly() {
    final lavender = material(.70, .61, .88, metal: .45);
    final mint = material(.53, .95, .40, metal: .30);
    final ink = material(.035, .052, .09, metal: .45, rough: .38);
    final silver = material(.78, .83, .90, metal: .8, rough: .24);
    final block = fs.CuboidGeometry(vm.Vector3(.69, .37, .69));
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        for (var z = -1; z <= 1; z++) {
          if (x == 0 && y == 0 && z == 0) continue;
          final node = fs.Node(
            mesh: fs.Mesh(block, (x == 0 && z == 0) ? mint : lavender),
          );
          root.add(node);
          pieces.add(Piece(node, x, y, z));
        }
      }
    }
    core = fs.Node(mesh: fs.Mesh(fs.SphereGeometry(radius: .43), mint));
    root.add(core);
    for (var i = 0; i < 2; i++) {
      final ring = fs.Node(
        mesh: fs.Mesh(
          fs.TorusGeometry(
            radius: 3.05 + i * .23,
            tubeRadius: .025,
            radialSegments: 96,
            tubularSegments: 8,
          ),
          silver,
        ),
      );
      root.add(ring);
      rings.add(ring);
    }
    for (var i = 0; i < 12; i++) {
      final bead = fs.Node(
        mesh: fs.Mesh(
          fs.SphereGeometry(radius: i % 3 == 0 ? 0.12 : 0.065),
          i % 3 == 0 ? mint : silver,
        ),
      );
      root.add(bead);
      beads.add(bead);
    }
    scene.add(root);
    final pedestal = fs.Node(
      mesh: fs.Mesh(
        fs.CylinderGeometry(
          topRadius: 3.25,
          bottomRadius: 3.25,
          height: .14,
          radialSegments: 96,
        ),
        ink,
      ),
    )..position = vm.Vector3(0, -3.15, 0);
    scene.add(pedestal);
    scene.directionalLight = fs.DirectionalLight(
      direction: vm.Vector3(-.6, -1, .4),
      intensity: 2.4,
      castsShadow: true,
      shadowMapResolution: 2048,
      shadowSoftness: .10,
    );
    light = fs.PointLight(
      color: vm.Vector3(.62, 1, .52),
      intensity: 22,
      range: 12,
    );
    movingLight = fs.Node()..addComponent(fs.PointLightComponent(light));
    scene.add(movingLight);
  }
  fs.PerspectiveCamera pose(double seconds) {
    final phase = seconds / 8 * math.pi * 2;
    // Closed -> exploded -> closed, all sampled from absolute output time.
    final open = math.pow(math.sin(phase * .5), 2).toDouble();
    root.rotation = vm.Quaternion.axisAngle(vm.Vector3(0, 1, 0), phase * .5);
    for (final p in pieces) {
      p.node.position = vm.Vector3(
        p.x * (.76 + .40 * open),
        p.y * (.43 + 1.02 * open),
        p.z * (.76 + .40 * open),
      );
      p.node.rotation = vm.Quaternion.axisAngle(
        vm.Vector3(0, 1, 0),
        p.y * open * .32,
      );
    }
    core.scale = vm.Vector3.all(.02 + .98 * open);
    for (var i = 0; i < rings.length; i++) {
      rings[i].rotation = vm.Quaternion.euler(
        .4 + open * .45,
        phase * (i == 0 ? 1 : -.65),
        i == 0 ? 0.35 : -0.45,
      );
    }
    for (var i = 0; i < beads.length; i++) {
      final a = phase + i * math.pi * 2 / beads.length;
      beads[i].position = vm.Vector3(
        3.05 * math.cos(a),
        .8 * math.sin(a * 2 + phase),
        3.05 * math.sin(a),
      );
    }
    movingLight.position = vm.Vector3(
      4 * math.cos(phase),
      3.8,
      4 * math.sin(phase),
    );
    light.intensity = 18 + 6 * math.sin(phase);
    final a = -.45 + .90 * (seconds / 8);
    return fs.PerspectiveCamera(
      position: vm.Vector3(15.5 * math.sin(a), 8.0, -15.5 * math.cos(a)),
      target: vm.Vector3(0, -.6, 0),
      fovRadiansY: 46 * math.pi / 180,
    );
  }
}

Future<void> capture() async {
  final dir = Directory(output)..createSync(recursive: true);
  await fs.Scene.initializeStaticResources();
  final a = Assembly();
  await fs.Scene.preload();
  await a.scene.warmUp([fs.RenderView(camera: a.pose(0))]);
  final file = File('${dir.path}/frames.rgba').openSync(mode: FileMode.write);
  final count =
      int.tryParse(Platform.environment['SCENE_FRAMES'] ?? '') ?? frames;
  if (count < 1 || count > frames)
    throw ArgumentError('SCENE_FRAMES must be 1..$frames');
  for (var frame = 0; frame < count; frame++) {
    final camera = a.pose(frame / fps);
    a.scene.update(1 / fps);
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawColor(const Color(0xFF293347), BlendMode.src);
    a.scene.render(
      camera,
      canvas,
      viewport: const Rect.fromLTWH(0, 0, 720, 1280),
      pixelRatio: 1,
    );
    final picture = recorder.endRecording();
    final image = await picture.toImage(width, height);
    final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) throw StateError('Missing frame $frame');
    file.writeFromSync(
      data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
    );
    if (frame % 30 == 0) {
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      File('${dir.path}/frame-$frame.png')
          .writeAsBytesSync(png!.buffer.asUint8List());
      File('${dir.path}/progress.txt').writeAsStringSync('$frame / $count');
    }
    image.dispose();
    picture.dispose();
  }
  file.closeSync();
  a.scene.dispose();
  File('${dir.path}/complete.txt').writeAsStringSync('$count frames');
}
