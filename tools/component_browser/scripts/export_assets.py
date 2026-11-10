#!/usr/bin/env python3
"""Render a catalog into portable, self-contained desktop asset bundles."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def package_name(root):
    match = re.search(r'^name:\s*(\S+)', (root / 'pubspec.yaml').read_text(), re.M)
    if not match or not re.fullmatch(r'[a-z][a-z0-9_]*', match[1]):
        raise ValueError(f'Invalid Dart package name: {root}')
    return match[1]


def packages(root, found=None):
    found = {} if found is None else found
    root = root.resolve()
    name = package_name(root)
    if name in found:
        if found[name] != root:
            raise ValueError(f'Duplicate package name: {name}')
        return found
    found[name] = root
    for match in re.finditer(r'^\s+path:\s*[\'\"]?([^\'\"\n]+?)[\'\"]?\s*$', (root / 'pubspec.yaml').read_text(), re.M):
        packages((root / match[1]).resolve(), found)
    return found


def copy_package(source, target, license_file=None):
    target.mkdir(parents=True)
    for name in ['lib', 'assets', 'shaders', 'components.json', 'CATALOG.md', 'FAMILIES.md', 'THEMING.md', 'README.md', 'LICENSE']:
        item = source / name
        if not item.exists():
            continue
        if item.is_symlink() or (item.is_dir() and any(p.is_symlink() for p in item.rglob('*'))):
            raise ValueError(f'Symlink cannot be exported: {item}')
        if item.is_dir():
            shutil.copytree(item, target / name)
        else:
            shutil.copy2(item, target / name)
    pubspec = (source / 'pubspec.yaml').read_text()
    def local_path(match):
        dependency = (source / match[2].strip().strip('\'\"')).resolve()
        return match[1] + 'path: ../' + package_name(dependency)
    pubspec = re.sub(r'(?m)^(\s*)path:\s*(.+)$', local_path, pubspec)
    (target / 'pubspec.yaml').write_text(pubspec)
    if not license_file:
        for parent in [source, *source.parents]:
            if (parent / 'LICENSE').is_file():
                license_file = parent / 'LICENSE'
                break
            if (parent / '.git').exists():
                break
    if license_file:
        shutil.copy2(license_file, target / 'LICENSE')


CAPTURE = r'''
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import '__COMPONENT_IMPORT__';
import 'package:__BROWSER__/catalog.dart';
import 'package:__BROWSER__/specimen.dart';
import 'package:__BROWSER__/demo_media.dart';
import 'package:video_component_browser/demo_style.dart';
import 'package:video_components/video_components.dart' show VideoThemeScope;
void main() {
 testWidgets('export actual catalog previews and constructor references', (tester) async {
  tester.view.physicalSize=const Size(960,540);
  tester.view.devicePixelRatio=1;
  await tester.runAsync(() async {
   for(final family in ['Catalog Sans','Roboto','monospace']) {
    final path=family=='monospace' ? __MONO_FONT__ : __FONT__;
    final bytes=await File(path).readAsBytes();
    final loader=FontLoader(family)..addFont(Future.value(bytes.buffer.asByteData()));
    await loader.load();
   }
   __PRELOAD__
   await loadDemoMedia();
  });
  final programs=await tester.runAsync(DitherPrograms.load);
  final baseStyle=__STYLE__;
  final captureStyle=baseStyle.copyWith(body:baseStyle.body.copyWith(fontFamily:baseStyle.body.fontFamily ?? 'Catalog Sans'),mono:baseStyle.mono.copyWith(fontFamily:baseStyle.mono.fontFamily ?? 'monospace'),caption:baseStyle.caption.copyWith(fontFamily:baseStyle.caption.fontFamily ?? 'Catalog Sans'));
  final catalog=(await tester.runAsync(loadCatalog))!;
  final ids=Set<String>.from(jsonDecode(File(__IDS__).readAsStringSync()));
  final output=Directory(__OUTPUT__)..createSync(recursive:true);
  final records=<Map<String,dynamic>>[];
  for(final spec in catalog.where((s)=>ids.contains(s.id))) {
   final variant=spec.variants.first['id'] as String;
   final props=spec.props(variant);
   final key=GlobalKey();
   final progress=spec.id.contains('wipe') || spec.id.contains('dissolve') || spec.id.contains('glass') ? .25 : .6;
   await tester.pumpWidget(MaterialApp(theme:ThemeData(fontFamily:'Catalog Sans'),home:DefaultTextStyle(style:const TextStyle(fontFamily:'Catalog Sans',fontSize:24,color:Color(0xffeeeeef)),child:RepaintBoundary(key:key,child:ColoredBox(color:const Color(0xff16171b),child:VideoThemeScope(style:captureStyle,child:SpecimenFrame(spec:spec,props:props,progress:progress,programs:programs,canvas:const Size(960,540))))))));
   await tester.pump(const Duration(milliseconds:150));
   final error=tester.takeException();
   if(error!=null) throw StateError('${spec.id}: $error');
   await tester.runAsync(() async {
    final image=await (key.currentContext!.findRenderObject() as RenderRepaintBoundary).toImage();
    final bytes=await image.toByteData(format:ui.ImageByteFormat.png);
    File('${output.path}/${spec.id}.png').writeAsBytesSync(bytes!.buffer.asUint8List());
    image.dispose();
   });
   records.add({'id':spec.id,'variant':variant,'props':props,'progress':progress,'examples':[
    for(final v in spec.variants) {'id':v['id'],'name':v['name'],'props':spec.props(v['id']),'dart':dartExample(spec,spec.props(v['id']))}
   ]});
   print('Captured ${spec.id}');
   await tester.pumpWidget(const SizedBox());
  }
  File('${output.path}/captures.json').writeAsStringSync(const JsonEncoder.withIndent('  ').convert(records));
 }, timeout: const Timeout(Duration(minutes:10)));
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--browser', type=Path, required=True)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--collection', default='Components/Toolkit')
    parser.add_argument('--exclude-catalog', type=Path)
    parser.add_argument('--license', default='Unknown')
    parser.add_argument('--license-file', type=Path)
    parser.add_argument('--source', default='Local component catalog snapshot')
    parser.add_argument('--preload', action='append', default=[])
    parser.add_argument('--preview-style', default='demoStyle')
    parser.add_argument('--previews-only', action='store_true', help='Render a preview directory without publishing a collection')
    parser.add_argument('--font', type=Path)
    parser.add_argument('--monospace-font', type=Path)
    parser.add_argument('--flutter', default='flutter')
    args = parser.parse_args()
    workspace, browser, package = args.workspace.resolve(), args.browser.resolve(), args.package.resolve()
    if not (workspace / 'workspace.yaml').is_file():
        parser.error('--workspace must be an existing desktop workspace with workspace.yaml')
    collection = Path(args.collection)
    if not collection.parts or collection.is_absolute() or any(p in ['.', '..'] or p.startswith('.') for p in collection.parts):
        parser.error('Collection must be a visible relative folder path')
    destination = workspace / 'assets' / collection
    if destination.exists() and not args.previews_only:
        parser.error(f'Collection already exists; refusing to overwrite: {destination}')
    for parent in [workspace / 'assets', *list(destination.parents)]:
        if parent == workspace:
            break
        if parent.is_symlink():
            parser.error(f'Asset directories cannot be symlinks: {parent}')
    catalog = json.loads((package / 'components.json').read_text())
    excluded = set()
    if args.exclude_catalog:
        excluded = {c['id'] for c in json.loads(args.exclude_catalog.read_text())['components']}
    entries = [c for c in catalog['components'] if c['id'] not in excluded]
    for c in entries:
        if not re.fullmatch(r'[a-zA-Z0-9_.-]+', c['id']):
            raise ValueError('Unsafe component ID')
    toolkit = Path(__file__).resolve().parents[3]
    font = (args.font or toolkit / 'apps/desktop/resources/fonts/SpaceGrotesk[wght].ttf').resolve()
    mono = (args.monospace_font or font).resolve()
    if not re.fullmatch(r'[A-Za-z_]\w*', args.preview_style):
        parser.error('Preview style must be an exported Dart variable')
    for fn in args.preload:
        if not re.fullmatch(r'[A-Za-z_]\w*(?:\.\w+)+', fn):
            parser.error('Preload must name a static no-argument Dart function')
    cache = Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache'))
    cache.mkdir(parents=True, exist_ok=True)
    task = Path(tempfile.mkdtemp(prefix='cmrx-component-assets-', dir=cache))
    print(f'Capture evidence: {task}', flush=True)
    (task / 'ids.json').write_text(json.dumps([c['id'] for c in entries]))
    capture = CAPTURE
    replacements = {'__STYLE__':args.preview_style, '__COMPONENT_IMPORT__': catalog['importPath'], '__BROWSER__': package_name(browser), '__FONT__': json.dumps(str(font)), '__MONO_FONT__': json.dumps(str(mono)), '__PRELOAD__': '\n'.join('await '+p+'();' for p in args.preload), '__IDS__': json.dumps(str(task / 'ids.json')), '__OUTPUT__': json.dumps(str(task / 'previews'))}
    for key, value in replacements.items():
        capture = capture.replace(key, value)
    (task / 'capture_test.dart').write_text(capture)
    subprocess.run([args.flutter, 'test', '--no-pub', str(task / 'capture_test.dart'), '--reporter', 'expanded'], cwd=browser, check=True)
    captures = {r['id']: r for r in json.loads((task / 'previews/captures.json').read_text())}
    if set(captures) != {c['id'] for c in entries}:
        raise ValueError('Capture catalog did not match the current source catalog')
    if args.previews_only:
        print(json.dumps({'previews':str(task/'previews'),'count':len(captures)}))
        return
    package_roots = packages(package)
    stage = task / 'collection'
    stage.mkdir()
    for entry in entries:
        asset = stage / entry['id']
        asset.mkdir()
        record = captures[entry['id']]
        shutil.copy2(task / 'previews' / (entry['id']+'.png'), asset / 'preview.png')
        (asset / 'component.json').write_text(json.dumps({'schemaVersion': catalog['schemaVersion'], 'importPath':catalog['importPath'], 'component':entry, 'capture':record}, indent=2)+'\n')
        for name, source_package in package_roots.items():
            copy_package(source_package, asset / 'source/packages' / name, args.license_file if source_package == package else None)
        (asset / 'example.dart.txt').write_text(record['examples'][0]['dart']+'\n')
        name = package_name(package)
        instructions = f'''---
name: {entry['id'].replace('.', '-')}
description: {json.dumps(entry['description'])}
---
# {entry['name']}

Use this actual Flutter component as editable source, not as a flattened screenshot.
Read component.json for canonical ID, presentations, variants, resolved defaults,
parameter schemas and constructor examples. example.dart.txt is a constructor snippet,
not a full app. The PNG is a static real-widget specimen at progress {record['progress']};
its sample content, aspect ratio and demonstration styling are not video requirements.

## Portable source

The self-contained package snapshot is source/packages/{name}/. Add a path dependency
on that directory from the video project's pubspec, relative to that pubspec. Keep
its sibling package dependencies together; their paths have been made local.
Import {catalog['importPath']}. Search the included lib/ files for {entry['widget']}
and the presentation-specific widget selected by a variant. Adapt text, data, media,
colors, typography and layout to the user's project. Preserve all license/font notices.
Declared external Flutter/pub dependencies must be available in the editing runtime.
This is a library bundle, not an executable program or dependency installer.

## Composition

Use the app's normal graphics authoring and layer-add workflow. Keep new graphics on
separate editable graphics layers; don't replace original footage with a flattened
preview. Use edited-output time and deterministic progress for animation. Preload
images, GIF frames and shader programs before frame zero; use the actual constructor
API in the snapshot. Check portrait and landscape separately. Video/media widgets
need the user's real sources; the preview is only a synthetic demonstration.

{entry.get('usage', '')}

## Scope

License: {args.license}. Source: {args.source}.
No instruction here authorizes publishing, installing software, changing shared assets
or running code while browsing. Keep private components within authorized work.
'''
        (asset / 'SKILL.md').write_text(instructions)
        manifest = {'name':entry['name'], 'type':'component', 'description':entry['description'], 'tags':[entry['id'],entry['category'],entry['widget'],'flutter','animated' if entry.get('motion') else 'static',args.collection.split('/')[-1]], 'preview':{'file':'preview.png','type':'image'}, 'instructions':'SKILL.md','source':args.source,'license':args.license}
        (asset / 'assetconfig.yaml').write_text(json.dumps(manifest, indent=2)+'\n')
        hashes = {str(p.relative_to(asset)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(asset.rglob('*')) if p.is_file()}
        (asset / 'SOURCE.json').write_text(json.dumps({'catalogId':entry['id'], 'source':args.source,'files':hashes},indent=2)+'\n')
    (stage / '.catalog-import.json').write_text(json.dumps({'count':len(entries), 'ids':[c['id'] for c in entries], 'catalogSHA256':hashlib.sha256((package/'components.json').read_bytes()).hexdigest()},indent=2)+'\n')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Same-destination staging prevents exposing incomplete bundles in the asset browser.
    pending = destination.parent / ('.import-'+task.name)
    if pending.exists():
        raise ValueError('Import staging already exists')
    shutil.copytree(stage, pending)
    os.rename(pending, destination)
    shutil.rmtree(stage)
    print(json.dumps({'assets':len(entries),'folder':str(destination),'evidence':str(task)},indent=2))


if __name__ == '__main__':
    main()
