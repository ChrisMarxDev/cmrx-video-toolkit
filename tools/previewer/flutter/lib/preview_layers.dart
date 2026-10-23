import 'package:flutter/material.dart';

/// Authored metadata, in front-to-back order. Active means included at this
/// frame; it does not imply unoccluded pixels or an audible/unmuted audio track.
@immutable
class PreviewLayer {
  const PreviewLayer({required this.name, required this.active, this.detail});
  final String name;
  final bool active;
  final String? detail;
}

/// Preview-only chrome. Wrap the composition in its preview adapter, never in
/// the production export entrypoint. Does not inspect or mutate the widget tree.
class PreviewLayers extends StatefulWidget {
  const PreviewLayers({
    super.key,
    required this.child,
    required this.layers,
    required this.seconds,
    this.uiScale = 1,
  }) : assert(uiScale > 0);
  final Widget child;
  final List<PreviewLayer> layers;
  final double seconds;

  /// Scale chrome when wrapping a fixed-resolution composition canvas.
  final double uiScale;
  @override
  State<PreviewLayers> createState() => _PreviewLayersState();
}

class _PreviewLayersState extends State<PreviewLayers> {
  bool expanded = false;
  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      widget.child,
      Positioned.fill(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = (constraints.maxWidth / widget.uiScale - 24).clamp(
              1.0,
              280.0,
            );
            final height = (constraints.maxHeight / widget.uiScale - 24).clamp(
              1.0,
              double.infinity,
            );
            return Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: EdgeInsets.all(12 * widget.uiScale),
                child: Transform.scale(
                  scale: widget.uiScale,
                  alignment: Alignment.topRight,
                  child: SizedBox(
                    width: expanded ? width : width.clamp(1.0, 108.0),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxHeight: height),
                      child: Material(
                        color: const Color(0xf2222228),
                        borderRadius: BorderRadius.circular(12),
                        clipBehavior: Clip.antiAlias,
                        child: DefaultTextStyle(
                          style: const TextStyle(
                            fontSize: 13,
                            color: Colors.white,
                            height: 1.35,
                          ),
                          child: SingleChildScrollView(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: Semantics(
                                    expanded: expanded,
                                    child: TextButton.icon(
                                      onPressed: () =>
                                          setState(() => expanded = !expanded),
                                      style: TextButton.styleFrom(
                                        foregroundColor: Colors.white,
                                        minimumSize: const Size(0, 44),
                                      ),
                                      icon: Icon(
                                        expanded
                                            ? Icons.close
                                            : Icons.layers_outlined,
                                        size: 18,
                                      ),
                                      label: const Text('Layers'),
                                    ),
                                  ),
                                ),
                                if (expanded)
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      14,
                                      0,
                                      14,
                                      14,
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${widget.seconds.toStringAsFixed(1)}s · front to back',
                                          style: const TextStyle(
                                            color: Color(0xffc4c4cc),
                                            fontSize: 12,
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        if (widget.layers.isEmpty)
                                          const Text(
                                            'No layer metadata provided.',
                                          ),
                                        for (final layer in widget.layers)
                                          Padding(
                                            padding: const EdgeInsets.symmetric(
                                              vertical: 5,
                                            ),
                                            child: Row(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Padding(
                                                  padding:
                                                      const EdgeInsets.only(
                                                        top: 4,
                                                        right: 8,
                                                      ),
                                                  child: Icon(
                                                    layer.active
                                                        ? Icons.circle
                                                        : Icons.circle_outlined,
                                                    size: 9,
                                                    color: layer.active
                                                        ? const Color(
                                                            0xffb8e5b9,
                                                          )
                                                        : const Color(
                                                            0xff9999a0,
                                                          ),
                                                  ),
                                                ),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Text(layer.name),
                                                      if (layer.detail != null)
                                                        Text(
                                                          layer.detail!,
                                                          style:
                                                              const TextStyle(
                                                                fontSize: 11,
                                                                color: Color(
                                                                  0xffc4c4cc,
                                                                ),
                                                              ),
                                                        ),
                                                    ],
                                                  ),
                                                ),
                                                const SizedBox(width: 8),
                                                Text(
                                                  layer.active
                                                      ? 'Active'
                                                      : 'Inactive',
                                                  style: const TextStyle(
                                                    fontSize: 11,
                                                    color: Color(0xffc4c4cc),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        const SizedBox(height: 8),
                                        const Text(
                                          'Read-only · active means included, not necessarily visible or audible.',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Color(0xffc4c4cc),
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
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    ],
  );
}
