import 'package:flutter/widgets.dart';
import 'package:fluvie/fluvie.dart' as fluvie;

import 'style.dart';
import 'diagrams/diagram.dart' show checkProgress;

enum TechnicalChartKind { bar, line, area, donut }

/// Fluvie's chart engine in a plain Flutter, explicitly seekable wrapper.
/// The synthetic local frame scope is driven only by [progress], so it also
/// works in slides/browser specimens without a mounted video renderer.
class TechnicalChart extends StatelessWidget {
  TechnicalChart({
    super.key,
    required Map<String, num> data,
    this.style,
    required this.kind,
    this.progress = 1,
    this.unit = '',
    this.source = '',
    List<Color>? seriesColors,
  }) : data = Map.unmodifiable(data),
       seriesColors = List.unmodifiable(seriesColors ?? const <Color>[]) {
    checkProgress(progress);
    if (data.isEmpty ||
        data.length > 8 ||
        data.values.any((v) => !v.isFinite || v < 0)) {
      throw ArgumentError('Provide 1..8 finite nonnegative values');
    }
    if ((kind == TechnicalChartKind.line || kind == TechnicalChartKind.area) &&
        data.length < 2) {
      throw ArgumentError('Line/area charts require at least two points');
    }
    if (kind == TechnicalChartKind.donut && data.values.every((v) => v == 0)) {
      throw ArgumentError('A donut requires a positive total');
    }
    if (seriesColors != null && seriesColors.isEmpty)
      throw ArgumentError('A chart palette cannot be empty');
  }
  final Map<String, num> data;
  final VideoStyle? style;
  final TechnicalChartKind kind;
  final double progress;
  final String unit, source;
  final List<Color> seriesColors;
  @override
  Widget build(BuildContext context) {
    final style = VideoThemeScope.resolve(context, this.style);
    final seriesColors = this.seriesColors.isEmpty
        ? [style.foreground, style.accent, style.surface]
        : this.seriesColors;
    final chart = switch (kind) {
      TechnicalChartKind.bar => fluvie.Chart.bar(
        data: data,
        reveal: const fluvie.Time.seconds(1),
      ),
      TechnicalChartKind.line => fluvie.Chart.line(
        data: data,
        reveal: const fluvie.Time.seconds(1),
      ),
      TechnicalChartKind.area => fluvie.Chart.area(
        data: data,
        reveal: const fluvie.Time.seconds(1),
      ),
      TechnicalChartKind.donut => fluvie.Chart.donut(
        data: data,
        reveal: const fluvie.Time.seconds(1),
      ),
    };
    return Semantics(
      label:
          '${kind.name} chart${unit.isEmpty ? '' : ' in $unit'}: ${data.entries.map((e) => '${e.key}: ${e.value}').join(', ')}',
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: 700,
          height: 440,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (unit.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    unit,
                    style: style.mono.copyWith(
                      fontSize: 19,
                      color: style.foreground,
                    ),
                  ),
                ),
              Expanded(
                child: fluvie.FluvieTokensScope(
                  tokens: fluvie.FluvieTokens(
                    palette: fluvie.ChartPalette(seriesColors),
                    axisColor: style.foreground,
                    gridColor: style.foreground.withValues(alpha: .12),
                    labelColor: style.foreground,
                  ),
                  child: fluvie.VideoScope(
                    fps: 1000,
                    duration: const fluvie.Time.seconds(1),
                    child: fluvie.FrameProvider(
                      frame: (progress * 1000).round(),
                      child: chart,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Fluvie 0.3.1 paints geometry/grid but no readable category/value
              // labels. Supply an explicit keyed value legend; never invent ticks.
              Wrap(
                spacing: 24,
                runSpacing: 10,
                children: [
                  for (var i = 0; i < data.length; i++)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            color:
                                seriesColors[(kind == TechnicalChartKind.line ||
                                        kind == TechnicalChartKind.area)
                                    ? 0
                                    : i % seriesColors.length],
                            border: Border.all(color: style.foreground),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${data.keys.elementAt(i)}  ${data.values.elementAt(i)}',
                          style: style.mono.copyWith(
                            fontSize: 18,
                            color: style.foreground,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
              if (source.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text(
                    source,
                    style: style.mono.copyWith(
                      fontSize: 15,
                      color: style.foreground,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Plain-text catalog editing format: one `label: value` per line.
/// Reject invalid/duplicate data instead of quietly changing the plotted story.
Map<String, num> parseTechnicalChartData(String text) {
  final result = <String, num>{};
  for (final line in text.split('\n').where((line) => line.trim().isNotEmpty)) {
    final split = line.lastIndexOf(':');
    if (split <= 0)
      throw const FormatException('Use one Label: value per line.');
    final label = line.substring(0, split).trim();
    final value = num.tryParse(line.substring(split + 1).trim());
    if (label.isEmpty ||
        result.containsKey(label) ||
        value == null ||
        !value.isFinite ||
        value < 0) {
      throw const FormatException(
        'Use unique labels and finite nonnegative numbers.',
      );
    }
    result[label] = value;
  }
  if (result.isEmpty || result.length > 8)
    throw const FormatException('Provide 1–8 labeled values.');
  return Map.unmodifiable(result);
}
