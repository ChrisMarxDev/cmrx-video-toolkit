import 'demo_style.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_components/video_components.dart';
import 'catalog.dart';
import 'specimen.dart';
import 'demo_media.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    final catalog = await loadCatalog();
    await loadDemoMedia();
    DitherPrograms? programs;
    try {
      programs = await DitherPrograms.load();
    } catch (_) {
      /* Visible fallback in specimens. */
    }
    runApp(ComponentBrowser(catalog: catalog, programs: programs));
  } catch (error) {
    runApp(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SelectableText(
              'Could not load the component catalog.\nRun make components from the repository root to generate demo media and rebuild.\n$error',
            ),
          ),
        ),
      ),
    );
  }
}

class ComponentBrowser extends StatelessWidget {
  const ComponentBrowser({
    super.key,
    required this.catalog,
    this.programs,
    this.initialRoute,
  });
  final List<ComponentSpec> catalog;
  final DitherPrograms? programs;
  final String? initialRoute;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'CMRX Video Toolkit · Components',
    debugShowCheckedModeBanner: false,
    initialRoute: initialRoute,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: DemoPalette.white,
      colorScheme: ColorScheme.fromSeed(seedColor: DemoPalette.ink).copyWith(
        primary: DemoPalette.ink,
        onPrimary: DemoPalette.white,
        secondary: DemoPalette.accent,
        surface: DemoPalette.white,
        onSurface: DemoPalette.ink,
        outline: DemoPalette.rule,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.zero),
        isDense: true,
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: const RoundedRectangleBorder(),
          minimumSize: const Size(44, 44),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: DemoPalette.accent,
          foregroundColor: DemoPalette.ink,
          shape: const RoundedRectangleBorder(),
          minimumSize: const Size(44, 44),
        ),
      ),
    ),
    onGenerateRoute: (settings) {
      final uri = Uri.tryParse(settings.name ?? '/') ?? Uri(path: '/');
      final id = uri.path.replaceFirst(RegExp(r'^/'), '');
      return MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => BrowserPage(
          key: ValueKey(settings.name),
          catalog: catalog,
          programs: programs,
          componentId: id,
          initialVariant: uri.queryParameters['variant'],
        ),
      );
    },
  );
}

class BrowserPage extends StatefulWidget {
  const BrowserPage({
    super.key,
    required this.catalog,
    this.programs,
    this.componentId = '',
    this.initialVariant,
  });
  final List<ComponentSpec> catalog;
  final DitherPrograms? programs;
  final String componentId;
  final String? initialVariant;
  @override
  State<BrowserPage> createState() => _BrowserPageState();
}

class _BrowserPageState extends State<BrowserPage>
    with SingleTickerProviderStateMixin {
  String query = '', category = 'All', format = '16:9';
  late final AnimationController clock;
  ComponentSpec? selected;
  late String variant;
  Map<String, dynamic> props = {};
  bool playing = false;
  bool motionInitialized = false;
  @override
  void initState() {
    super.initState();
    for (final entry in widget.catalog) {
      if (entry.id == widget.componentId) selected = entry;
    }
    variant = selected?.variants.first['id'] ?? '';
    if (selected != null) {
      if (selected!.variants.any((v) => v['id'] == widget.initialVariant)) {
        variant = widget.initialVariant!;
      }
      props = selected!.props(variant);
    }
    clock = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 10),
      value: .5,
    )..addListener(() => setState(() {}));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      clock.stop();
      playing = false;
      motionInitialized = true;
    } else if (!motionInitialized) {
      motionInitialized = true;
      if (selected == null ||
          selected!.id == 'video.texture' ||
          selected!.id == 'video.dither-background' ||
          selected!.id == 'video.gif') {
        playing = true;
        clock.repeat();
      }
    }
  }

  @override
  void dispose() {
    clock.dispose();
    super.dispose();
  }

  void navigate(String id, {String? variant}) {
    clock.stop();
    playing = false;
    Navigator.of(context).pushNamed(
      Uri(
        path: '/$id',
        queryParameters: variant == null ? null : {'variant': variant},
      ).toString(),
    );
  }

  Future<void> copy(String value) async {
    try {
      await Clipboard.setData(ClipboardData(text: value));
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Copied')));
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Clipboard unavailable. Select and copy the reference below.',
            ),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 980;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: DemoPalette.white,
        surfaceTintColor: Colors.transparent,
        toolbarHeight: 80,
        title: Row(
          children: [
            const Flexible(
              child: Text(
                'CMRX Video Toolkit',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 16),
            const Flexible(
              child: Text('Component browser', style: TextStyle(fontSize: 18)),
            ),
          ],
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1),
        ),
      ),
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (wide) SizedBox(width: 232, child: navigation()),
          Expanded(child: selected != null ? detail(wide) : overview()),
        ],
      ),
    );
  }

  Widget navigation() => Container(
    decoration: const BoxDecoration(
      border: Border(right: BorderSide(color: DemoPalette.rule)),
    ),
    child: ListView(
      padding: const EdgeInsets.symmetric(vertical: 20),
      children: [
        ListTile(
          title: const Text('All components'),
          leading: const Icon(Icons.grid_view_outlined),
          selected: selected == null && widget.componentId.isEmpty,
          onTap: () => navigate(''),
        ),
        for (final group in widget.catalog.map((e) => e.category).toSet()) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 16, 4),
            child: Text(
              group,
              style: const TextStyle(color: DemoPalette.muted, fontSize: 13),
            ),
          ),
          for (final spec in widget.catalog.where((e) => e.category == group))
            ListTile(
              dense: true,
              title: Text(spec.name),
              selected: selected?.id == spec.id,
              selectedTileColor: DemoPalette.surface,
              onTap: () => navigate(spec.id),
            ),
        ],
      ],
    ),
  );

  Widget overview() {
    final results = widget.catalog
        .where(
          (s) =>
              (category == 'All' || s.category == category) &&
              '${s.name} ${s.id} ${s.widget} ${s.description}'
                  .toLowerCase()
                  .contains(query.toLowerCase()),
        )
        .toList();
    return ListView(
      padding: const EdgeInsets.all(28),
      children: [
        if (widget.componentId.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              'Unknown component “${widget.componentId}”. Choose one below.',
            ),
          ),
        const Text(
          'The pieces of a video',
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w500,
            letterSpacing: -1,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Inspect a widget. Try a variant. Use its name in the next brief.',
        ),
        const SizedBox(height: 24),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search components',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (v) => setState(() => query = v),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final group in [
              'All',
              ...widget.catalog.map((e) => e.category).toSet(),
            ])
              TextButton(
                onPressed: () => setState(() => category = group),
                style: TextButton.styleFrom(
                  backgroundColor: category == group
                      ? DemoPalette.surface
                      : null,
                  shape: const RoundedRectangleBorder(),
                ),
                child: Text(group),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          '${results.length} ${results.length == 1 ? 'component' : 'components'}',
          style: const TextStyle(color: DemoPalette.muted),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () {
              setState(() => playing = !playing);
              if (playing) {
                clock.repeat();
              } else {
                clock.stop();
              }
            },
            icon: Icon(playing ? Icons.pause : Icons.play_arrow),
            label: Text(
              playing ? 'Pause animated previews' : 'Play animated previews',
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (results.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 48),
            child: Text(
              'No matching components. Try a widget name, like caption or layers.',
            ),
          ),
        LayoutBuilder(
          builder: (context, constraints) {
            final columns = (constraints.maxWidth / 300).floor().clamp(1, 3);
            return Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                for (final spec in results)
                  SizedBox(
                    width:
                        (constraints.maxWidth - (columns - 1) * 16) / columns,
                    child: Material(
                      color: DemoPalette.white,
                      shape: const RoundedRectangleBorder(
                        side: BorderSide(color: DemoPalette.rule),
                      ),
                      child: InkWell(
                        onTap: () => navigate(spec.id),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              height: 180,
                              width: double.infinity,
                              child: IgnorePointer(
                                child: SpecimenFrame(
                                  spec: spec,
                                  props: spec.props(spec.variants.first['id']),
                                  progress:
                                      (spec.id == 'video.texture' ||
                                          spec.id ==
                                              'video.dither-background' ||
                                          spec.id == 'video.gif')
                                      ? clock.value
                                      : .65,
                                  programs: widget.programs,
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    spec.name,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    spec.id,
                                    style: DemoType.mono.copyWith(fontSize: 12),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    '${spec.variants.length} variants · ${spec.category}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: DemoPalette.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget detail(bool wide) {
    final spec = selected!;
    final canvas = switch (format) {
      '9:16' => const Size(540, 960),
      '1:1' => const Size(540, 540),
      _ => const Size(960, 540),
    };
    return ListView(
      padding: const EdgeInsets.all(28),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => navigate(''),
            icon: const Icon(Icons.arrow_back),
            label: const Text('All components'),
          ),
        ),
        const SizedBox(height: 12),
        SelectableText(
          spec.name,
          style: const TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w500,
            letterSpacing: -1,
          ),
        ),
        const SizedBox(height: 8),
        SelectableText(spec.description),
        const SizedBox(height: 20),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SelectableText(
              spec.id,
              style: DemoType.mono.copyWith(fontSize: 15),
            ),
            FilledButton.icon(
              onPressed: () => copy(flowReference(spec, variant, props)),
              icon: const Icon(Icons.copy, size: 18),
              label: const Text('Copy flow reference'),
            ),
            OutlinedButton(
              onPressed: () => copy(
                Uri.base
                    .replace(
                      fragment: Uri(
                        path: '/${spec.id}',
                        queryParameters: {'variant': variant},
                      ).toString(),
                    )
                    .toString(),
              ),
              child: const Text('Copy variant link'),
            ),
          ],
        ),
        const SizedBox(height: 24),
        LayoutBuilder(
          builder: (context, constraints) {
            final split = constraints.maxWidth >= 760;
            final preview = Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  height: 390,
                  color: DemoPalette.mist,
                  padding: const EdgeInsets.all(16),
                  child: SpecimenFrame(
                    spec: spec,
                    props: props,
                    progress: clock.value,
                    videoControls: true,
                    programs: widget.programs,
                    canvas: canvas,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final ratio in ['16:9', '9:16', '1:1'])
                      OutlinedButton(
                        onPressed: () => setState(() => format = ratio),
                        style: OutlinedButton.styleFrom(
                          backgroundColor: format == ratio
                              ? DemoPalette.surface
                              : null,
                        ),
                        child: Text(ratio),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '${canvas.width.toInt()} × ${canvas.height.toInt()} · fitted preview',
                  style: const TextStyle(
                    fontSize: 12,
                    color: DemoPalette.muted,
                  ),
                ),
                if (spec.motion) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      IconButton(
                        tooltip: playing ? 'Pause preview' : 'Play preview',
                        onPressed: () {
                          setState(() => playing = !playing);
                          if (playing) {
                            clock.repeat();
                          } else {
                            clock.stop();
                          }
                        },
                        icon: Icon(playing ? Icons.pause : Icons.play_arrow),
                      ),
                      Expanded(
                        child: Slider(
                          value: clock.value,
                          divisions: 300,
                          label: '${(clock.value * 300).round()} / 300',
                          onChanged: (v) {
                            clock.stop();
                            playing = false;
                            clock.value = v;
                          },
                        ),
                      ),
                      Text('Frame ${(clock.value * 300).round()} / 300'),
                    ],
                  ),
                  const Text(
                    '10-second inspection loop · 30 fps. Video timing comes from the edited timeline.',
                    style: TextStyle(fontSize: 12, color: DemoPalette.muted),
                  ),
                ],
              ],
            );
            return split
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: preview),
                      const SizedBox(width: 24),
                      SizedBox(width: 280, child: controls(spec)),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      preview,
                      const SizedBox(height: 24),
                      controls(spec),
                    ],
                  );
          },
        ),
        const SizedBox(height: 32),
        const Text(
          'Use in the flow',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        const Text(
          'Paste this into a brief or animation note. Add the narration phrase and placement; resolve timing from the timeline.',
        ),
        const SizedBox(height: 12),
        codeBox(flowReference(spec, variant, props)),
        const SizedBox(height: 24),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Flutter',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
              ),
            ),
            TextButton(
              onPressed: () => copy(dartExample(spec, props)),
              child: const Text('Copy code'),
            ),
          ],
        ),
        codeBox(dartExample(spec, props)),
        if (spec.data['usage'] != null) ...[
          const SizedBox(height: 24),
          Text(spec.data['usage'] as String),
        ],
        if ((spec.data['examples'] as List? ?? []).isNotEmpty) ...[
          const SizedBox(height: 24),
          const Text(
            'Examples in context',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
          ),
          for (final example in spec.data['examples'] as List) ...[
            const SizedBox(height: 16),
            Text(
              example['title'] as String,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            Text(example['description'] as String),
            SizedBox(
              height: 260,
              child: SpecimenFrame(
                spec: spec,
                props: spec.props(example['variant'] as String),
                progress: 1,
                programs: widget.programs,
                canvas: const Size(960, 540),
              ),
            ),
          ],
        ],
        const SizedBox(height: 12),
        SelectableText(
          'Source: ${spec.source}\nWidget: ${spec.widget}',
          style: DemoType.mono.copyWith(fontSize: 12),
        ),
        const SizedBox(height: 8),
        const Text(
          'Import package:video_components/video_components.dart; for diagram recipes also import package:video_components/technical_samples.dart. Supply your own VideoStyle (demoStyle is local to this browser). Import Clip from package:fluvie/fluvie.dart for video. Preload images, GIF frames and DitherPrograms before capture; supply progress and outputSeconds from the composition.',
          style: TextStyle(fontSize: 12, color: DemoPalette.muted),
        ),
      ],
    );
  }

  Widget controls(ComponentSpec spec) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        'Variant & properties',
        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        key: ValueKey('${spec.id}:$variant'),
        initialValue: variant,
        decoration: const InputDecoration(labelText: 'Variant'),
        items: [
          for (final v in spec.variants)
            DropdownMenuItem(value: v['id'] as String, child: Text(v['id'])),
        ],
        onChanged: (v) => setState(() {
          variant = v!;
          props = spec.props(variant);
        }),
      ),
      const SizedBox(height: 16),
      for (final entry in spec.parameters.entries)
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: control(entry.key, entry.value),
        ),
      OutlinedButton(
        onPressed: () => setState(() {
          props = spec.props(variant);
          clock.stop();
          playing = false;
          clock.value = .5;
        }),
        child: const Text('Reset properties'),
      ),
      const SizedBox(height: 12),
      const Text(
        'Variant links open the preset. The flow reference includes your edited properties.',
        style: TextStyle(fontSize: 12, color: DemoPalette.muted),
      ),
    ],
  );

  Widget control(String key, Map<String, dynamic> meta) {
    final value = props[key];
    switch (meta['type']) {
      case 'bool':
        return SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(meta['label']),
          value: value,
          onChanged: (v) => setState(() => props[key] = v),
        );
      case 'choice':
        return DropdownButtonFormField<String>(
          key: ValueKey('$variant:$key:$value'),
          initialValue: value,
          decoration: InputDecoration(labelText: meta['label']),
          items: [
            for (final v in meta['options'])
              DropdownMenuItem(value: v as String, child: Text(v)),
          ],
          onChanged: (v) => setState(() => props[key] = v),
        );
      case 'text':
        return TextFormField(
          key: ValueKey('$variant:$key:${props.hashCode}'),
          initialValue: value,
          maxLines: key == 'text' ? 4 : 1,
          decoration: InputDecoration(labelText: meta['label']),
          onChanged: (v) => setState(() {
            props[key] = v;
            if (selected!.id == 'video.code')
              props['focusLine'] = effectiveFocus(props);
          }),
        );
      default:
        final min = (meta['min'] as num).toDouble(),
            max = (meta['max'] as num).toDouble();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${meta['label']} · ${value is double ? value.toStringAsFixed(key == 'speed' ? 2 : 0) : value}',
            ),
            Slider(
              value: (value as num).toDouble(),
              min: min,
              max: max,
              divisions: key == 'speed' ? 16 : (max - min).round(),
              onChanged: (v) => setState(() {
                props[key] = key == 'speed'
                    ? double.parse(v.toStringAsFixed(2))
                    : v.round();
                if (key == 'focusLine') props[key] = effectiveFocus(props);
              }),
            ),
          ],
        );
    }
  }

  Widget codeBox(String value) => Container(
    width: double.infinity,
    color: DemoPalette.mist,
    padding: const EdgeInsets.all(20),
    child: SelectableText(value, style: DemoType.mono.copyWith(fontSize: 13)),
  );
}
