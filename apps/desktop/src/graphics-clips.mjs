// Generate static Dart imports for arbitrary authored graphics clip modules.
// This derived file exists only inside immutable render snapshots.
export function graphicsDispatcher(project, packageName) {
  const clips = project.clips.filter((c) => c.kind === "graphics");
  const sources = [...new Set(clips.map((c) => c.props?.source))];
  for (const source of sources)
    if (
      typeof source !== "string" ||
      !/^lib\/[a-zA-Z0-9_/.-]+\.dart$/.test(source) ||
      source.startsWith("lib/_cmrx_render/") ||
      source.split("/").some((p) => p === ".." || p.startsWith("."))
    )
      throw Error("Graphics source must be a Dart file under lib/");
  const literal = (s) =>
    "'" +
    s.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("$", "\\$") +
    "'";
  return `import 'package:flutter/widgets.dart';
import 'package:${packageName}/graphics.dart' as legacy;
export 'package:${packageName}/graphics.dart' hide buildGraphics;
${sources.map((source, i) => `import ${literal("package:" + packageName + "/" + source.slice(4))} as layer${i};`).join("\n")}
Widget buildGraphics(double time, Map<String,dynamic> manifest, {int? previewTrack}) {
 final clips=List<Map<String,dynamic>>.from(manifest['clips']).where((c)=>c['kind']=='graphics').toList()
 ..sort((a,b)=>(a['track'] as num).compareTo(b['track'] as num));
 if(clips.isEmpty) return ${project.graphicsMode === "instances" ? "const SizedBox.shrink()" : "legacy.buildGraphics(time,manifest)"};
 final layers=Map<String,dynamic>.from(manifest['layers']??{});
 return Stack(fit:StackFit.expand,clipBehavior:Clip.hardEdge,children:[
  for(final clip in clips)
   if((previewTrack==null || clip['track']==previewTrack) && layers['\${clip['track']}']?['disabled']!=true && time>=clip['start'] && time<clip['start']+clip['duration'])
    Positioned(left:(clip['x'] as num).toDouble(),top:(clip['y'] as num).toDouble(),width:(clip['width'] as num).toDouble(),height:(clip['height'] as num).toDouble(),
     child:Stack(fit:StackFit.expand,clipBehavior:Clip.none,children:[
      _graphic(clip['props']['source'],(clip['in']+time-clip['start']).toDouble(),{...manifest,'graphicsClip':clip})])),
 ]);
}
Widget _graphic(String source,double time,Map<String,dynamic> manifest) {
 switch(source) {
 ${sources.map((source, i) => `case ${literal(source)}: return layer${i}.buildGraphics(time,manifest);`).join("\n")}
 default:throw StateError('Unknown graphics source: '+source);
 }
}
`;
}
export function bindGraphicsComposition(source, packageName) {
  // Preserve authored source. Bind the standard graphics import in the snapshot
  // to the app's derived dispatcher; all other public legacy symbols stay exported.
  const names = ["graphics.dart", `package:${packageName}/graphics.dart`];
  let replaced = false;
  const result = source.replace(
    /import\s+(['"])([^'"\n]+)\1/g,
    (match, quote, name) => {
      if (!names.includes(name)) return match;
      replaced = true;
      return `import ${quote}package:${packageName}/_cmrx_render/graphics_stack.dart${quote}`;
    },
  );
  return { source: result, bound: replaced };
}
