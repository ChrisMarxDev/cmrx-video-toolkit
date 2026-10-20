import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

class PortraitLowerThird extends StatelessWidget {
  const PortraitLowerThird({
    super.key,
    required this.portrait,
    required this.name,
    required this.role,
    this.alignRight = false,
    this.progress = 1,
    this.style,
  });
  final Widget portrait;
  final String name, role;
  final bool alignRight;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Align(
      alignment: alignRight ? Alignment.bottomRight : Alignment.bottomLeft,
      child: enter(
        panel(
          s,
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              slot(s, portrait, width: 90, height: 90),
              SizedBox(width: s.spacing),
              SizedBox(
                width: 420,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    heading(s, name, size: 32),
                    label(s, role, color: s.muted),
                  ],
                ),
              ),
            ],
          ),
        ),
        progress,
      ),
    ),
  );
}

class RuleLowerThird extends StatelessWidget {
  const RuleLowerThird({
    super.key,
    required this.name,
    required this.role,
    this.progress = 1,
    this.style,
  });
  final String name, role;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Align(
      alignment: Alignment.bottomLeft,
      child: SizedBox(
        width: 560,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            rule(s, progress: progress),
            gap(s),
            enter(heading(s, name, size: 40), progress),
            label(s, role, color: s.muted),
          ],
        ),
      ),
    ),
  );
}

class ProfileChip extends StatelessWidget {
  const ProfileChip({
    super.key,
    required this.avatar,
    required this.name,
    required this.handle,
    this.badge = '',
    this.progress = 1,
    this.style,
  });
  final Widget avatar;
  final String name, handle, badge;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Center(
      child: enter(
        panel(
          s,
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ClipOval(child: SizedBox(width: 80, height: 80, child: avatar)),
              SizedBox(width: s.spacing),
              SizedBox(
                width: 320,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    heading(s, name, size: 28),
                    label(s, handle, color: s.muted),
                  ],
                ),
              ),
              if (badge.isNotEmpty)
                panel(s, label(s, badge, size: 14), accent: true, padding: 10),
            ],
          ),
        ),
        progress,
      ),
    ),
  );
}

@immutable
class CaptionWord {
  const CaptionWord(this.text, this.start, this.end);
  final String text;
  final double start, end;
}

class TimedWordCaptions extends StatelessWidget {
  const TimedWordCaptions({
    super.key,
    required this.words,
    required this.seconds,
    this.style,
  });
  final List<CaptionWord> words;
  final double seconds;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(words, 'words', max: 40);
    if (!seconds.isFinite) throw ArgumentError('seconds must be finite');
    double previousEnd = 0;
    for (final w in words) {
      if (!w.start.isFinite ||
          !w.end.isFinite ||
          w.start < previousEnd ||
          w.end <= w.start)
        throw ArgumentError(
          'Caption intervals must be ordered, nonoverlapping and positive',
        );
      previousEnd = w.end;
    }
    return SceneCanvas(
      style: style,
      builder: (s) => Align(
        alignment: Alignment.bottomCenter,
        child: panel(
          s,
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 8,
            children: [
              for (final w in words)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 4,
                  ),
                  color: seconds >= w.start && seconds < w.end
                      ? s.accent
                      : null,
                  child: label(s, w.text, size: 36),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class ChapterTicket extends StatelessWidget {
  const ChapterTicket({
    super.key,
    required this.chapter,
    required this.title,
    this.metadata = '',
    this.progress = 1,
    this.style,
  });
  final String chapter, title, metadata;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Center(
      child: enter(
        panel(
          s,
          Row(
            children: [
              SizedBox(width: 120, child: heading(s, chapter, size: 64)),
              Container(width: s.borderWidth, height: 150, color: s.rule),
              SizedBox(width: s.spacing * 1.5),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    label(s, metadata, mono: true),
                    gap(s),
                    heading(s, title, size: 40),
                  ],
                ),
              ),
            ],
          ),
        ),
        progress,
      ),
    ),
  );
}

@immutable
class InformationRow {
  const InformationRow(this.label, this.value, {this.symbol = ''});
  final String label, value, symbol;
}

class InformationRows extends StatelessWidget {
  const InformationRows({
    super.key,
    required this.rows,
    this.progress = 1,
    this.style,
  });
  final List<InformationRow> rows;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(rows, 'rows', max: 3);
    return SceneCanvas(
      style: style,
      builder: (s) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < rows.length; i++)
              Padding(
                padding: EdgeInsets.only(bottom: s.spacing / 2),
                child: enter(
                  panel(
                    s,
                    Row(
                      children: [
                        if (rows[i].symbol.isNotEmpty) ...[
                          rows[i].symbol == '◷'
                              ? SceneMark(kind: 'clock', color: s.foreground)
                              : label(s, rows[i].symbol, size: 30),
                          SizedBox(width: s.spacing),
                        ],
                        SizedBox(
                          width: 180,
                          child: label(
                            s,
                            rows[i].label,
                            mono: true,
                            color: s.muted,
                          ),
                        ),
                        Expanded(child: label(s, rows[i].value, size: 26)),
                      ],
                    ),
                  ),
                  (unit(progress) * rows.length - i).clamp(0.0, 1.0),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
