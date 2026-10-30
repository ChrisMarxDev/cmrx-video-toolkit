import 'selection.dart';
import 'download.dart';
import 'demo_style.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;
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

class ComponentBrowser extends StatefulWidget {
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
  State<ComponentBrowser> createState() => _ComponentBrowserState();
}

class _ComponentBrowserState extends State<ComponentBrowser> {
  final selection = ComponentSelection();
  @override
  void dispose() {
    selection.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'CMRX Video Toolkit · Components',
    debugShowCheckedModeBanner: false,
    initialRoute: widget.initialRoute,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: DemoPalette.white,
      colorScheme: ColorScheme.fromSeed(seedColor: DemoPalette.accent).copyWith(
        primary: DemoPalette.accent,
        onPrimary: DemoPalette.white,
        secondary: DemoPalette.accent,
        surface: DemoPalette.white,
        onSurface: DemoPalette.ink,
        outline: DemoPalette.rule,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(6)),
        ),
        isDense: true,
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(6)),
          ),
          minimumSize: const Size(44, 44),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: DemoPalette.accent,
          foregroundColor: DemoPalette.white,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(6)),
          ),
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
          catalog: widget.catalog,
          programs: widget.programs,
          componentId: id,
          selection: selection,
          initialVariant: uri.queryParameters['variant'],
          initialSidebarOffset: settings.arguments is Map
              ? (settings.arguments as Map)['offset'] as double
              : 0,
          initialPreviewTheme: settings.arguments is Map
              ? (settings.arguments as Map)['theme'] as String
              : 'Original',
        ),
      );
    },
  );
}

class BrowserPage extends StatefulWidget {
  const BrowserPage({
    super.key,
    required this.selection,
    required this.catalog,
    this.programs,
    this.componentId = '',
    this.initialVariant,
    this.initialSidebarOffset = 0,
    this.initialPreviewTheme = 'Original',
  });
  final ComponentSelection selection;
  final List<ComponentSpec> catalog;
  final DitherPrograms? programs;
  final String componentId;
  final String? initialVariant;
  final double initialSidebarOffset;
  final String initialPreviewTheme;
  @override
  State<BrowserPage> createState() => _BrowserPageState();
}

class _BrowserPageState extends State<BrowserPage>
    with SingleTickerProviderStateMixin {
  String query = '', category = 'All', format = '16:9';
  late String previewTheme;
  late final AnimationController clock;
  late final ScrollController sidebarController;
  ComponentSpec? selected;
  late String variant;
  Map<String, dynamic> props = {};
  bool playing = false;
  bool motionInitialized = false;
  @override
  void initState() {
    super.initState();
    previewTheme = widget.initialPreviewTheme;
    sidebarController = ScrollController(
      initialScrollOffset: widget.initialSidebarOffset,
    );
    for (final entry in widget.catalog) {
      if (entry.matchesId(widget.componentId)) selected = entry;
    }
    variant =
        selected?.variantForRoute(widget.componentId, widget.initialVariant) ??
        '';
    if (selected != null) props = selected!.props(variant);
    clock = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 10),
      value: .5,
    );
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
      if (selected != null &&
          (selected!.id == 'video.texture' ||
              selected!.id == 'video.dither-background' ||
              selected!.id == 'video.gif')) {
        playing = true;
        clock.repeat();
      }
    }
  }

  @override
  void dispose() {
    sidebarController.dispose();
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
      arguments: {
        'offset': sidebarController.hasClients
            ? sidebarController.offset
            : widget.initialSidebarOffset,
        'theme': previewTheme,
      },
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
    final base = demoStyle;
    final style = switch (previewTheme) {
      'Rounded' => base.copyWith(
        background: const Color(0xFFF6F9FF),
        foreground: const Color(0xFF102547),
        surface: const Color(0xFFDEE9FA),
        accent: const Color(0xFFFFCC65),
        onAccent: const Color(0xFF102547),
        radius: 24,
        borderWidth: 0,
        spacing: 28,
        body: const TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 24,
          color: Color(0xFF102547),
        ),
        mono: const TextStyle(fontFamily: 'monospace', fontSize: 20),
        caption: const TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 22,
          color: Color(0xFFFFFFFF),
        ),
      ),
      'Editorial' => base.copyWith(
        background: const Color(0xFFFFFAF0),
        foreground: const Color(0xFF37251C),
        surface: const Color(0xFFF0E2CC),
        accent: const Color(0xFFE7AD70),
        onAccent: const Color(0xFF37251C),
        radius: 4,
        borderWidth: 3,
        spacing: 32,
        body: const TextStyle(
          fontFamily: 'serif',
          fontSize: 26,
          color: Color(0xFF37251C),
        ),
        mono: const TextStyle(fontFamily: 'monospace', fontSize: 20),
        caption: const TextStyle(
          fontFamily: 'serif',
          fontSize: 24,
          color: Color(0xFFFFFFFF),
        ),
      ),
      _ => base,
    };
    return VideoThemeScope(
      style: style,
      child: Scaffold(
        appBar: AppBar(
          actions: [
            DropdownButton<String>(
              key: const ValueKey('preview-theme'),
              value: previewTheme,
              underline: const SizedBox.shrink(),
              items: ['Original', 'Rounded', 'Editorial']
                  .map(
                    (name) => DropdownMenuItem(value: name, child: Text(name)),
                  )
                  .toList(),
              onChanged: (value) => setState(() => previewTheme = value!),
            ),
            const SizedBox(width: 16),
          ],
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
                child: Text(
                  'Component browser',
                  style: TextStyle(fontSize: 18),
                ),
              ),
            ],
          ),
          bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1),
            child: Divider(height: 1),
          ),
        ),
        bottomNavigationBar: selectionBar(),
        body: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (wide) SizedBox(width: 232, child: navigation()),
            Expanded(child: selected != null ? detail(wide) : overview()),
          ],
        ),
      ),
    );
  }

  Widget navigation() => Container(
    decoration: const BoxDecoration(
      border: Border(right: BorderSide(color: DemoPalette.rule)),
    ),
    child: ListView(
      key: const ValueKey('component-sidebar'),
      controller: sidebarController,
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
              (category == 'All' ||
                  (category == 'New components' &&
                      s.data['expanded'] == true) ||
                  s.category == category) &&
              s.searchText.contains(query.toLowerCase()),
        )
        .toList();
    // Stable ordering keeps the new families discoverable without changing IDs.
    final ordered = [
      ...results.where((s) => s.data['expanded'] == true),
      ...results.where((s) => s.data['expanded'] != true),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = ((constraints.maxWidth - 56) / 300).floor().clamp(1, 3);
        return CustomScrollView(
          key: const ValueKey('component-overview'),
          scrollCacheExtent: const ScrollCacheExtent.pixels(0),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
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
                    SizedBox(
                      height: 48,
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            for (final group in [
                              'All',
                              'New components',
                              ...widget.catalog.map((e) => e.category).toSet(),
                            ])
                              TextButton(
                                onPressed: () =>
                                    setState(() => category = group),
                                style: TextButton.styleFrom(
                                  backgroundColor: category == group
                                      ? DemoPalette.surface
                                      : null,
                                  shape: const RoundedRectangleBorder(
                                    borderRadius: BorderRadius.all(
                                      Radius.circular(6),
                                    ),
                                  ),
                                ),
                                child: Text(group),
                              ),
                          ],
                        ),
                      ),
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
                          playing
                              ? 'Pause animated previews'
                              : 'Play animated previews',
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
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(28, 0, 28, 28),
              sliver: SliverGrid(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisExtent: 380,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, index) => overviewCard(ordered[index]),
                  childCount: ordered.length,
                  addAutomaticKeepAlives: false,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  double pausedProgress(ComponentSpec spec) =>
      spec.category == 'Transitions' ||
          spec.id == 'video.credits-roll' ||
          spec.id == 'video.timed-word-captions'
      ? .5
      : 1;

  Widget overviewCard(ComponentSpec spec) {
    final previewProps = spec.props(spec.variants.first['id']);
    return Material(
      color: DemoPalette.white,
      clipBehavior: Clip.antiAlias,
      shape: const RoundedRectangleBorder(
        side: BorderSide(color: DemoPalette.rule),
        borderRadius: BorderRadius.all(Radius.circular(6)),
      ),
      child: InkWell(
        onTap: () => navigate(spec.id),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 36,
              child: Align(
                alignment: Alignment.centerRight,
                child: ListenableBuilder(
                  listenable: widget.selection,
                  builder: (context, child) => Tooltip(
                    message: 'Select ${spec.name}',
                    child: Checkbox(
                      key: ValueKey('select-${spec.id}'),
                      value: widget.selection.contains(spec.id),
                      visualDensity: VisualDensity.compact,
                      onChanged: (checked) {
                        if (checked == true) {
                          widget.selection.put(
                            spec.id,
                            spec.variants.first['id'],
                            previewProps,
                          );
                        } else {
                          widget.selection.remove(spec.id);
                        }
                      },
                    ),
                  ),
                ),
              ),
            ),
            SizedBox(
              height: 180,
              width: double.infinity,
              child: IgnorePointer(
                child: RepaintBoundary(
                  child: AnimatedBuilder(
                    animation: spec.motion && playing
                        ? clock
                        : const AlwaysStoppedAnimation<double>(0),
                    builder: (context, child) => SpecimenFrame(
                      spec: spec,
                      props: previewProps,
                      progress: spec.motion && playing
                          ? clock.value
                          : pausedProgress(spec),
                      programs: widget.programs,
                    ),
                  ),
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
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(spec.id, style: DemoType.mono.copyWith(fontSize: 12)),
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
    );
  }

  Widget selectionBar() => ListenableBuilder(
    listenable: widget.selection,
    builder: (context, child) {
      final selection = widget.selection;
      if (selection.length == 0) return const SizedBox.shrink();
      return SafeArea(
        top: false,
        child: Material(
          elevation: 4,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${selection.length} selected',
                    key: const ValueKey('selection-count'),
                  ),
                ),
                IconButton(
                  tooltip: 'Clear selection',
                  onPressed: selection.clear,
                  icon: const Icon(Icons.clear_all, size: 20),
                ),
                IconButton(
                  tooltip: 'Copy selection',
                  onPressed: () => copySelection(),
                  icon: const Icon(Icons.copy, size: 20),
                ),
                IconButton(
                  tooltip: 'Export selection',
                  onPressed: () => exportSelection(),
                  icon: const Icon(Icons.download_outlined, size: 20),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );

  Future<void> copySelection() async {
    final json = widget.selection.encode(previewTheme: previewTheme);
    try {
      await Clipboard.setData(ClipboardData(text: json));
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Component selection copied')),
        );
    } catch (_) {
      if (mounted) showSelection(json);
    }
  }

  void exportSelection() {
    final json = widget.selection.encode(previewTheme: previewTheme);
    try {
      if (!downloadSelection(json)) showSelection(json);
    } catch (_) {
      showSelection(json);
    }
  }

  void showSelection(String json) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Component selection'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(child: SelectableText(json)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
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
            ListenableBuilder(
              listenable: widget.selection,
              builder: (context, child) => OutlinedButton.icon(
                onPressed: () => widget.selection.put(spec.id, variant, props),
                icon: Icon(
                  widget.selection.contains(spec.id)
                      ? Icons.check_box
                      : Icons.check_box_outline_blank,
                  size: 18,
                ),
                label: Text(
                  widget.selection.contains(spec.id)
                      ? 'Update selection'
                      : 'Select for video',
                ),
              ),
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
                  child: RepaintBoundary(
                    child: AnimatedBuilder(
                      animation: clock,
                      builder: (context, child) => SpecimenFrame(
                        spec: spec,
                        props: props,
                        progress: clock.value,
                        videoControls: true,
                        programs: widget.programs,
                        canvas: canvas,
                      ),
                    ),
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
                  AnimatedBuilder(
                    animation: clock,
                    builder: (context, child) => Row(
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
                              setState(() => playing = false);
                              clock.value = v;
                            },
                          ),
                        ),
                        Text('Frame ${(clock.value * 300).round()} / 300'),
                      ],
                    ),
                  ),
                  const Text(
                    '10-second live preview · scrubber shows 300 positions. Video timing comes from the edited timeline.',
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
          'Source: ${spec.presentation(props).source}\nWidget: ${spec.presentation(props).widget}',
          style: DemoType.mono.copyWith(fontSize: 12),
        ),
        const SizedBox(height: 8),
        const Text(
          'Import package:video_components/video_components.dart; Supply your own VideoStyle (demoStyle is local to this browser). Import Clip from package:fluvie/fluvie.dart for video. Preload images, GIF frames and DitherPrograms before capture; supply progress and outputSeconds from the composition.',
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
        isExpanded: true,
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
      for (final entry in spec.parametersFor(props).entries)
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
          isExpanded: true,
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
            if (selected!.presentation(props).id == 'video.code')
              props['focusLine'] = effectiveFocus(props);
          }),
        );
      default:
        final min = (meta['min'] as num).toDouble(),
            max = (meta['max'] as num).toDouble();
        final step = (meta['step'] as num?)?.toDouble();
        final display = (value as num)
            .toStringAsFixed(3)
            .replaceFirst(RegExp(r'\.?0+$'), '');
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${meta['label']} · $display'),
            Slider(
              value: value.toDouble(),
              min: min,
              max: max,
              divisions: step == null ? null : ((max - min) / step).round(),
              onChanged: (v) => setState(() {
                props[key] = step == null
                    ? v
                    : (min + ((v - min) / step).round() * step).clamp(min, max);
                if (step == 1) props[key] = (props[key] as num).round();
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
