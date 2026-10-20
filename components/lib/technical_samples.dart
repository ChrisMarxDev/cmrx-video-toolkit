/// Synthetic, editable recipes for explaining common structures. These are
/// examples, not product architectures or verified facts about a service.
library;

import 'package:flutter/widgets.dart';
import 'video_components.dart';

enum DiagramExample {
  pipeline,
  decision,
  feedback,
  fanout,
  serviceMap,
  retrieval,
}

TechnicalDiagram technicalDiagramExample(
  DiagramExample example, {
  VideoStyle? style,
  double progress = 1,
  bool vertical = false,
  Map<String, String> labels = const {},
}) {
  DiagramNode node(
    String id,
    String label,
    double x,
    double y,
    double w,
    double h, {
    DiagramShape shape = DiagramShape.process,
    bool active = false,
  }) => DiagramNode(
    id: id,
    label: labels[id] ?? label,
    bounds: Rect.fromLTWH(x, y, w, h),
    shape: shape,
    active: active,
  );
  DiagramEdge edge(
    String from,
    String to, {
    String label = '',
    DiagramPort a = DiagramPort.right,
    DiagramPort b = DiagramPort.left,
    bool active = false,
    bool dashed = false,
    List<Offset> via = const [],
  }) => DiagramEdge(
    from: from,
    to: to,
    label: label,
    fromPort: a,
    toPort: b,
    active: active,
    dashed: dashed,
    via: via,
  );
  switch (example) {
    case DiagramExample.pipeline:
      return TechnicalDiagram(
        style: style,
        progress: progress,
        designSize: vertical ? const Size(480, 760) : const Size(800, 360),
        nodes: [
          node(
            'input',
            'Input',
            vertical ? 140 : 30,
            vertical ? 40 : 140,
            180,
            80,
            shape: DiagramShape.document,
          ),
          node(
            'process',
            'Transform',
            vertical ? 140 : 310,
            vertical ? 330 : 140,
            180,
            80,
            active: true,
          ),
          node(
            'output',
            'Output',
            vertical ? 140 : 590,
            vertical ? 620 : 140,
            180,
            80,
            shape: DiagramShape.document,
          ),
        ],
        edges: [
          for (final pair in [('input', 'process'), ('process', 'output')])
            edge(
              pair.$1,
              pair.$2,
              a: vertical ? DiagramPort.bottom : DiagramPort.right,
              b: vertical ? DiagramPort.top : DiagramPort.left,
              active: true,
            ),
        ],
      );
    case DiagramExample.decision:
      return TechnicalDiagram(
        style: style,
        progress: progress,
        designSize: const Size(800, 500),
        nodes: [
          node(
            'input',
            'Request',
            315,
            20,
            170,
            70,
            shape: DiagramShape.terminal,
          ),
          node(
            'decision',
            'Valid?',
            280,
            150,
            240,
            140,
            shape: DiagramShape.decision,
            active: true,
          ),
          node('yes', 'Continue', 40, 380, 200, 80),
          node('no', 'Revise', 560, 380, 200, 80),
        ],
        edges: [
          edge('input', 'decision', a: DiagramPort.bottom, b: DiagramPort.top),
          edge(
            'decision',
            'yes',
            a: DiagramPort.left,
            b: DiagramPort.top,
            label: 'yes',
            active: true,
          ),
          edge(
            'decision',
            'no',
            a: DiagramPort.right,
            b: DiagramPort.top,
            label: 'no',
          ),
        ],
      );
    case DiagramExample.feedback:
      return TechnicalDiagram(
        style: style,
        progress: progress,
        designSize: const Size(800, 440),
        nodes: [
          node('input', 'Draft', 30, 90, 180, 90),
          node('review', 'Review', 310, 90, 180, 90, active: true),
          node(
            'output',
            'Result',
            590,
            90,
            180,
            90,
            shape: DiagramShape.document,
          ),
        ],
        edges: [
          edge('input', 'review'),
          edge('review', 'output', label: 'accept'),
          edge(
            'output',
            'review',
            a: DiagramPort.bottom,
            b: DiagramPort.bottom,
            label: 'feedback',
            active: true,
            dashed: true,
            via: [const Offset(680, 330), const Offset(400, 330)],
          ),
        ],
      );
    case DiagramExample.fanout:
      return TechnicalDiagram(
        style: style,
        progress: progress,
        designSize: const Size(800, 520),
        nodes: [
          node('input', 'Dispatch', 20, 220, 150, 80),
          node('a', 'Worker A', 315, 20, 170, 80),
          node('b', 'Worker B', 315, 220, 170, 80, active: true),
          node('c', 'Worker C', 315, 420, 170, 80),
          node('output', 'Collect', 630, 220, 150, 80),
        ],
        edges: [
          for (final id in ['a', 'b', 'c']) ...[
            edge('input', id, active: id == 'b'),
            edge(id, 'output', active: id == 'b'),
          ],
        ],
      );
    case DiagramExample.serviceMap:
      return TechnicalDiagram(
        style: style,
        progress: progress,
        designSize: const Size(800, 520),
        nodes: [
          node(
            'client',
            'Client',
            20,
            220,
            170,
            80,
            shape: DiagramShape.terminal,
          ),
          node('api', 'API', 315, 220, 170, 80, active: true),
          node(
            'store',
            'Database',
            610,
            210,
            170,
            100,
            shape: DiagramShape.database,
          ),
          node(
            'cache',
            'Cache',
            315,
            20,
            170,
            80,
            shape: DiagramShape.database,
          ),
          node(
            'queue',
            'Queue',
            315,
            420,
            170,
            80,
            shape: DiagramShape.document,
          ),
        ],
        edges: [
          edge('client', 'api', label: 'request'),
          edge('api', 'store', label: 'query'),
          edge(
            'api',
            'cache',
            a: DiagramPort.top,
            b: DiagramPort.bottom,
            dashed: true,
          ),
          edge(
            'api',
            'queue',
            a: DiagramPort.bottom,
            b: DiagramPort.top,
            label: 'job',
          ),
        ],
      );
    case DiagramExample.retrieval:
      return TechnicalDiagram(
        style: style,
        progress: progress,
        designSize: const Size(800, 440),
        nodes: [
          node('query', 'Question', 20, 280, 170, 80),
          node('retrieve', 'Retrieve', 315, 280, 170, 80, active: true),
          node(
            'documents',
            'Documents',
            315,
            20,
            170,
            100,
            shape: DiagramShape.database,
          ),
          node('model', 'Generate', 610, 280, 170, 80),
        ],
        edges: [
          edge('query', 'retrieve'),
          edge(
            'documents',
            'retrieve',
            a: DiagramPort.bottom,
            b: DiagramPort.top,
            label: 'search',
          ),
          edge('retrieve', 'model', label: 'context', active: true),
        ],
      );
  }
}
