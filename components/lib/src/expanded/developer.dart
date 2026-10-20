import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

class TerminalPlayback extends StatelessWidget {
  const TerminalPlayback({
    super.key,
    required this.lines,
    this.title = 'Terminal',
    this.progress = 1,
    this.cursor = true,
    this.style,
  });
  final List<String> lines;
  final String title;
  final double progress;
  final bool cursor;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(lines, 'lines', max: 12);
    final text = lines.join('\n');
    final n = (text.length * unit(progress)).floor();
    return SceneCanvas(
      style: style,
      builder: (s) => panel(
        s,
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            label(s, title, mono: true, color: s.muted),
            gap(s),
            rule(s),
            gap(s),
            Expanded(
              child: Align(
                alignment: Alignment.topLeft,
                child: Text(
                  '${text.substring(0, n)}${cursor && (unit(progress) * 20).floor().isEven ? '▌' : ''}',
                  maxLines: 13,
                  overflow: TextOverflow.ellipsis,
                  style: s.mono.copyWith(
                    fontSize: 22,
                    color: s.foreground,
                    height: 1.4,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CodeDiff extends StatelessWidget {
  const CodeDiff({
    super.key,
    required this.before,
    required this.after,
    this.beforeLabel = 'Before',
    this.afterLabel = 'After',
    this.progress = 1,
    this.style,
  });
  final List<String> before, after;
  final String beforeLabel, afterLabel;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(before, 'before', max: 12);
    nonEmpty(after, 'after', max: 12);
    return SceneCanvas(
      style: style,
      builder: (s) => Row(
        children: [
          for (var side = 0; side < 2; side++)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: side == 0 ? s.spacing : 0),
                child: panel(
                  s,
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      label(
                        s,
                        side == 0 ? beforeLabel : afterLabel,
                        mono: true,
                      ),
                      gap(s),
                      rule(s),
                      gap(s),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (
                              var i = 0;
                              i < (side == 0 ? before : after).length;
                              i++
                            )
                              Flexible(
                                child: Builder(
                                  builder: (context) {
                                    final list = side == 0 ? before : after;
                                    final other = side == 0 ? after : before;
                                    final changed =
                                        i >= other.length ||
                                        list[i] != other[i];
                                    return Container(
                                      width: double.infinity,
                                      color: changed
                                          ? (side == 1
                                                ? s.accent
                                                : s.background)
                                          : null,
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 5,
                                        horizontal: 6,
                                      ),
                                      child: label(
                                        s,
                                        '${changed ? (side == 1 ? '+' : '−') : ' '} ${list[i]}',
                                        mono: true,
                                        size: 17,
                                        lines: 1,
                                        color: changed && side == 1
                                            ? s.onAccent
                                            : (side == 1 && unit(progress) < .5
                                                  ? s.muted
                                                  : s.foreground),
                                      ),
                                    );
                                  },
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
      ),
    );
  }
}

class RequestResponse extends StatelessWidget {
  const RequestResponse({
    super.key,
    required this.method,
    required this.endpoint,
    required this.status,
    required this.payload,
    this.progress = 1,
    this.style,
  });
  final String method, endpoint, status, payload;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        panel(
          s,
          Row(
            children: [
              panel(
                s,
                label(s, method, mono: true, color: s.onAccent),
                accent: true,
                padding: 10,
              ),
              SizedBox(width: s.spacing),
              Expanded(child: label(s, endpoint, mono: true, size: 24)),
            ],
          ),
        ),
        SizedBox(height: 44, child: Center(child: label(s, '↓', size: 32))),
        Expanded(
          child: enter(
            panel(
              s,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  label(s, status, mono: true),
                  gap(s),
                  rule(s),
                  gap(s),
                  Expanded(
                    child: label(s, payload, mono: true, size: 22, lines: 8),
                  ),
                ],
              ),
            ),
            (unit(progress) * 2 - 1).clamp(0.0, 1.0),
          ),
        ),
      ],
    ),
  );
}

class CodeWalkthrough extends StatelessWidget {
  const CodeWalkthrough({
    super.key,
    required this.lines,
    required this.note,
    this.focusStart = 0,
    this.focusEnd = 0,
    this.progress = 1,
    this.style,
  });
  final List<String> lines;
  final String note;
  final int focusStart, focusEnd;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(lines, 'lines', max: 100);
    if (focusStart < 0 || focusEnd < focusStart || focusEnd >= lines.length)
      throw ArgumentError('Invalid focus range');
    final start = math.max(
      0,
      math.min(lines.length - 8, (focusStart * unit(progress)).floor()),
    );
    return SceneCanvas(
      style: style,
      builder: (s) => Row(
        children: [
          Expanded(
            flex: 3,
            child: panel(
              s,
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (
                    var i = start;
                    i < math.min(start + 8, lines.length);
                    i++
                  )
                    Container(
                      color: i >= focusStart && i <= focusEnd ? s.accent : null,
                      padding: const EdgeInsets.all(8),
                      child: label(
                        s,
                        '${(i + 1).toString().padLeft(2)}  ${lines[i]}',
                        color: i >= focusStart && i <= focusEnd
                            ? s.onAccent
                            : s.foreground,
                        mono: true,
                        size: 18,
                        lines: 1,
                      ),
                    ),
                ],
              ),
            ),
          ),
          SizedBox(width: s.spacing),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                label(
                  s,
                  'LINES ${focusStart + 1}–${focusEnd + 1}',
                  mono: true,
                  size: 14,
                ),
                gap(s),
                label(s, note, size: 26, lines: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum PipelineState { waiting, running, done, failed }

@immutable
class PipelineStep {
  const PipelineStep(this.name, this.state, {this.detail = ''});
  final String name, detail;
  final PipelineState state;
}

class PipelineStatus extends StatelessWidget {
  const PipelineStatus({
    super.key,
    required this.stages,
    this.log = '',
    this.progress = 1,
    this.style,
  });
  final List<PipelineStep> stages;
  final String log;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(stages, 'stages', max: 6);
    return SceneCanvas(
      style: style,
      builder: (s) => Column(
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < stages.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: enter(
                      Row(
                        children: [
                          SizedBox(
                            width: 42,
                            child: SceneMark(
                              kind: stages[i].state.name,
                              color: s.foreground,
                            ),
                          ),
                          Expanded(
                            child: label(s, stages[i].name, size: 25, lines: 1),
                          ),
                          SizedBox(
                            width: 150,
                            child: label(
                              s,
                              stages[i].detail,
                              mono: true,
                              size: 15,
                              color: s.muted,
                              lines: 1,
                              align: TextAlign.right,
                            ),
                          ),
                        ],
                      ),
                      (unit(progress) * stages.length - i).clamp(0.0, 1.0),
                    ),
                  ),
              ],
            ),
          ),
          rule(s),
          gap(s),
          Align(
            alignment: Alignment.centerLeft,
            child: label(s, log, mono: true, size: 16, lines: 3),
          ),
        ],
      ),
    );
  }
}

@immutable
class SpecificationRow {
  const SpecificationRow(this.label, this.value, {this.unit = ''});
  final String label, value, unit;
}

class SpecificationTable extends StatelessWidget {
  const SpecificationTable({
    super.key,
    required this.rows,
    this.title = 'Specifications',
    this.activeRow = -1,
    this.style,
  });
  final List<SpecificationRow> rows;
  final String title;
  final int activeRow;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(rows, 'rows', max: 8);
    return SceneCanvas(
      style: style,
      builder: (s) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          heading(s, title, size: 34),
          gap(s),
          Expanded(
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++)
                  Expanded(
                    child: Container(
                      color: i == activeRow
                          ? s.accent
                          : (i.isEven ? s.surface : null),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(
                        children: [
                          Expanded(
                            child: label(
                              s,
                              rows[i].label,
                              size: 22,
                              color: i == activeRow ? s.onAccent : s.foreground,
                            ),
                          ),
                          Expanded(
                            child: label(
                              s,
                              rows[i].value,
                              color: i == activeRow ? s.onAccent : s.foreground,
                              mono: true,
                              size: 22,
                              align: TextAlign.right,
                            ),
                          ),
                          SizedBox(
                            width: 80,
                            child: label(
                              s,
                              rows[i].unit,
                              color: i == activeRow ? s.onAccent : s.foreground,
                              mono: true,
                              size: 14,
                              align: TextAlign.right,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
