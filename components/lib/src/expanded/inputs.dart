import 'package:flutter/widgets.dart';
import 'data.dart';
import 'developer.dart';
import 'endings.dart';
import 'overlays.dart';
import 'social.dart';

/// Pipe-separated, line-oriented browser/import helpers. Invalid input is
/// rejected rather than replaced with invented values.
List<List<String>> _fields(String text, int count) {
  final rows = text
      .split('\n')
      .where((line) => line.trim().isNotEmpty)
      .map((line) => line.split('|').map((s) => s.trim()).toList())
      .toList();
  if (rows.isEmpty || rows.any((row) => row.length != count))
    throw FormatException('Use $count fields separated by | on each line.');
  return rows;
}

double _number(String text) {
  final value = double.tryParse(text);
  if (value == null || !value.isFinite)
    throw FormatException('Expected a finite number: $text');
  return value;
}

List<CreditEntry> parseCredits(String text) =>
    _fields(text, 2).map((r) => CreditEntry(r[0], r[1])).toList();
List<CaptionWord> parseCaptionWords(String text) => _fields(
  text,
  3,
).map((r) => CaptionWord(r[0], _number(r[1]), _number(r[2]))).toList();
List<InformationRow> parseInformationRows(String text) => _fields(
  text,
  3,
).map((r) => InformationRow(r[0], r[1], symbol: r[2])).toList();
List<PipelineStep> parsePipelineSteps(String text) => _fields(text, 3)
    .map(
      (r) =>
          PipelineStep(r[0], PipelineState.values.byName(r[1]), detail: r[2]),
    )
    .toList();
List<SpecificationRow> parseSpecifications(String text) => _fields(
  text,
  3,
).map((r) => SpecificationRow(r[0], r[1], unit: r[2])).toList();
List<ChartDatum> parseChartValues(String text) =>
    _fields(text, 2).map((r) => ChartDatum(r[0], _number(r[1]))).toList();
List<HeatmapDatum> parseHeatmapValues(String text) => _fields(
  text,
  2,
).map((r) => HeatmapDatum(parseCalendarDate(r[0]), _number(r[1]))).toList();
List<RadarSeries> parseRadarSeries(String text) => _fields(
  text,
  2,
).map((r) => RadarSeries(r[0], r[1].split(',').map(_number).toList())).toList();
List<ScatterDatum> parseScatterPoints(String text) => _fields(
  text,
  3,
).map((r) => ScatterDatum(r[0], _number(r[1]), _number(r[2]))).toList();
List<Testimonial> parseTestimonials(String text) =>
    _fields(text, 2).map((r) => Testimonial(r[0], r[1])).toList();
List<Offset> parseRoutePoints(String text) =>
    _fields(text, 2).map((r) => Offset(_number(r[0]), _number(r[1]))).toList();

DateTime parseCalendarDate(String text) {
  final date = DateTime.tryParse(text);
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text) ||
      date == null ||
      date.toIso8601String().split('T').first != text)
    throw const FormatException('Use a valid calendar date: YYYY-MM-DD.');
  return date;
}
