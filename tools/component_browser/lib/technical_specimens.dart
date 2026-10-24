import 'package:flutter/widgets.dart';
import 'package:video_components/video_components.dart';
import 'package:video_components/technical_samples.dart';
import 'demo_style.dart';
import 'catalog.dart';

bool isTechnical(ComponentSpec spec) =>
    spec.category == 'Technical diagrams' || spec.category == 'Charts';
List<List<String>> technicalCells(String example) => List.generate(
  4,
  (r) => List.generate(
    4,
    (c) => switch (example) {
      'memory' => '0x${(r * 4 + c).toRadixString(16).padLeft(2, '0')}',
      'weights' => ((r * 4 + c - 8) / 10).toStringAsFixed(1),
      _ => '${r * 4 + c + 1}',
    },
  ),
);
List<String> sequenceActors(String example) =>
    example == 'tool' ? ['User', 'Agent', 'Tool'] : ['Client', 'API', 'Store'];
List<SequenceMessage> sequenceSteps(String example) => [
  SequenceMessage(
    from: 0,
    to: 1,
    label: example == 'tool' ? 'Question' : 'Request',
  ),
  SequenceMessage(
    from: 1,
    to: 2,
    label: example == 'tool' ? 'Call tool' : 'Query',
  ),
  SequenceMessage(from: 2, to: 1, label: 'Result', response: true),
  SequenceMessage(from: 1, to: 0, label: 'Response', response: true),
];
Widget technicalSpecimen(
  ComponentSpec spec,
  Map<String, dynamic> p,
  double progress, {
  VideoStyle style = demoStyle,
}) {
  final id = spec.id.split('.').last;
  Widget content;
  try {
    content = switch (id) {
      'diagram-node' => Center(
        child: SizedBox(
          width: 280,
          height: 140,
          child: TechnicalNode(
            style: style,
            label: p['label'],
            shape: DiagramShape.values.byName(p['shape']),
            active: p['active'],
          ),
        ),
      ),
      'connector' => TechnicalDiagram(
        style: style,
        designSize: const Size(800, 280),
        nodes: [
          DiagramNode(
            id: 'a',
            label: 'Producer',
            bounds: const Rect.fromLTWH(20, 100, 200, 80),
          ),
          DiagramNode(
            id: 'b',
            label: 'Consumer',
            bounds: const Rect.fromLTWH(580, 100, 200, 80),
            active: true,
          ),
        ],
        edges: [
          DiagramEdge(
            from: 'a',
            to: 'b',
            label: p['label'],
            dashed: p['dashed'],
            active: true,
          ),
        ],
        progress: progress,
      ),
      'flowchart' || 'architecture' => technicalDiagramExample(
        DiagramExample.values.byName(p['example']),
        style: style,
        vertical: p['vertical'] == true,
        progress: progress,
      ),
      'tensor-grid' => TechnicalGrid(
        style: style,
        cells: technicalCells(p['example']),
        activeRow: p['axis'] == 'row' ? (p['active'] as num).toInt() : null,
        activeColumn: p['axis'] == 'column'
            ? (p['active'] as num).toInt()
            : null,
      ),
      'sequence' => TechnicalSequence(
        style: style,
        participants: sequenceActors(p['example']),
        messages: sequenceSteps(p['example']),
        progress: progress,
      ),
      'annotation' => TechnicalAnnotation(
        style: style,
        notes: [
          TechnicalNote(
            target: const Offset(370, 300),
            labelPosition: const Offset(480, 65),
            text: p['label'],
          ),
        ],
        progress: progress,
        child: TechnicalGrid(
          style: style,
          cells: const [
            ['Input', 'Output'],
            ['Raw', 'Edited'],
          ],
          activeRow: 1,
        ),
      ),
      _ => TechnicalChart(
        style: style,
        kind: TechnicalChartKind.values.byName(id.substring(6)),
        data: parseTechnicalChartData(p['text']),
        unit: p['unit'],
        source: p['source'],
        progress: progress,
      ),
    };
  } on FormatException catch (e) {
    content = Center(
      child: Text(
        'Enter one Label: value per line.\n${e.message}',
        textAlign: TextAlign.center,
      ),
    );
  } on ArgumentError catch (e) {
    content = Center(
      child: Text(
        'Check the sample data: ${e.message}',
        textAlign: TextAlign.center,
      ),
    );
  }
  return ColoredBox(
    color: const Color(0xFFFFFFFF),
    child: DefaultTextStyle(
      style: style.body,
      child: Padding(padding: const EdgeInsets.all(32), child: content),
    ),
  );
}

String technicalDartExample(ComponentSpec spec, Map<String, dynamic> p) {
  final id = spec.id.split('.').last;
  return switch (id) {
    'diagram-node' =>
      '''TechnicalNode(style: style, label: ${literal(p['label'])}, shape: DiagramShape.${p['shape']}, active: ${p['active']})''',
    'connector' =>
      '''TechnicalDiagram(style: style, designSize: const Size(800, 280), nodes: [DiagramNode(id: 'a', label: 'Producer', bounds: const Rect.fromLTWH(20, 100, 200, 80)), DiagramNode(id: 'b', label: 'Consumer', bounds: const Rect.fromLTWH(580, 100, 200, 80), active: true)], edges: [DiagramEdge(from: 'a', to: 'b', label: ${literal(p['label'])}, dashed: ${p['dashed']}, active: true)], progress: progress)''',
    'flowchart' || 'architecture' =>
      '''technicalDiagramExample(DiagramExample.${p['example']}, style: style, vertical: ${p['vertical'] == true}, progress: progress)''',
    'tensor-grid' =>
      '''TechnicalGrid(style: style, cells: ${literal(technicalCells(p['example']))}, activeRow: ${p['axis'] == 'row' ? p['active'] : null}, activeColumn: ${p['axis'] == 'column' ? p['active'] : null})''',
    'sequence' =>
      '''TechnicalSequence(style: style, participants: ${literal(sequenceActors(p['example']))}, messages: [${sequenceSteps(p['example']).map((m) => 'SequenceMessage(from: ${m.from}, to: ${m.to}, label: ${literal(m.label)}, response: ${m.response})').join(', ')}], progress: progress)''',
    'annotation' =>
      '''TechnicalAnnotation(style: style, notes: [TechnicalNote(target: const Offset(370, 300), labelPosition: const Offset(480, 65), text: ${literal(p['label'])})], progress: progress, child: TechnicalGrid(style: style, cells: const [['Input', 'Output'], ['Raw', 'Edited']], activeRow: 1))''',
    _ =>
      '''TechnicalChart(style: style, kind: TechnicalChartKind.${id.substring(6)}, data: parseTechnicalChartData(${literal(p['text'])}), unit: ${literal(p['unit'])}, source: ${literal(p['source'])}, progress: progress)''',
  };
}
