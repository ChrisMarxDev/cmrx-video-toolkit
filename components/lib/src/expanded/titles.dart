import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

class EditorialTitle extends StatelessWidget {
  const EditorialTitle({
    super.key,
    required this.title,
    this.kicker = '',
    this.alignRight = false,
    this.progress = 1,
    this.style,
  });
  final String title, kicker;
  final bool alignRight;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Align(
      alignment: alignRight ? Alignment.centerRight : Alignment.centerLeft,
      child: enter(
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: alignRight
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            label(s, kicker.toUpperCase(), mono: true),
            gap(s),
            heading(s, title, size: 72),
            gap(s),
            rule(s, progress: progress),
          ],
        ),
        progress,
      ),
    ),
  );
}

class EpisodeTitle extends StatelessWidget {
  const EpisodeTitle({
    super.key,
    required this.title,
    required this.episode,
    required this.host,
    this.logo,
    this.progress = 1,
    this.style,
  });
  final String title, episode, host;
  final Widget? logo;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => enter(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              panel(
                s,
                label(s, episode, mono: true, color: s.onAccent),
                accent: true,
              ),
              const Spacer(),
              if (logo != null) SizedBox(width: 100, height: 60, child: logo),
            ],
          ),
          const Spacer(),
          heading(s, title, size: 64),
          gap(s),
          rule(s),
          gap(s),
          label(s, host, mono: true),
        ],
      ),
      progress,
    ),
  );
}

class InterviewOpener extends StatelessWidget {
  const InterviewOpener({
    super.key,
    required this.portrait,
    required this.name,
    required this.role,
    required this.topic,
    this.progress = 1,
    this.style,
  });
  final Widget portrait;
  final String name, role, topic;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Row(
      children: [
        Expanded(
          flex: 4,
          child: enter(slot(s, portrait, height: 428), progress),
        ),
        SizedBox(width: s.spacing * 1.5),
        Expanded(
          flex: 5,
          child: enter(
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                label(s, 'IN CONVERSATION', mono: true),
                gap(s),
                heading(s, topic),
                gap(s),
                rule(s),
                gap(s),
                label(s, name, size: 28),
                label(s, role, color: s.muted),
              ],
            ),
            progress,
          ),
        ),
      ],
    ),
  );
}

class WordHeadline extends StatelessWidget {
  const WordHeadline({
    super.key,
    required this.words,
    this.starts,
    this.emphasis = -1,
    this.progress = 1,
    this.style,
  });
  final List<String> words;
  final List<double>? starts;
  final int emphasis;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(words, 'words', max: 40);
    if (starts != null &&
        (starts!.length != words.length ||
            starts!.any((x) => !x.isFinite || x < 0 || x > 1)))
      throw ArgumentError('starts must match words and be in 0–1');
    final p = unit(progress);
    return SceneCanvas(
      style: style,
      builder: (s) => Center(
        child: Wrap(
          spacing: 14,
          runSpacing: 12,
          children: [
            for (var i = 0; i < words.length; i++)
              Opacity(
                opacity: p >= (starts?[i] ?? i / words.length) ? 1 : .12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  color: i == emphasis ? s.accent : null,
                  child: heading(
                    i == emphasis ? s.copyWith(foreground: s.onAccent) : s,
                    words[i],
                    size: 60,
                    lines: 1,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class SelectionTitle extends StatelessWidget {
  const SelectionTitle({
    super.key,
    required this.title,
    this.progress = 1,
    this.style,
  });
  final String title;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => Center(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: heading(s, title, size: 64),
          ),
          Positioned.fill(
            child: Opacity(
              opacity: unit(progress),
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: s.foreground, width: 2),
                ),
              ),
            ),
          ),
          for (final a in [
            Alignment.topLeft,
            Alignment.topRight,
            Alignment.bottomLeft,
            Alignment.bottomRight,
          ])
            Positioned.fill(
              child: Align(
                alignment: a,
                child: Container(width: 12, height: 12, color: s.accent),
              ),
            ),
          Positioned(
            right: 40 * (1 - unit(progress)) - 8,
            bottom: -30,
            child: Transform.rotate(
              filterQuality: FilterQuality.medium,
              angle: -.3,
              child: label(s, '↖', size: 42),
            ),
          ),
        ],
      ),
    ),
  );
}

class TypographySpecimen extends StatelessWidget {
  const TypographySpecimen({
    super.key,
    required this.sample,
    this.labelText = 'TYPE STUDY',
    this.progress = 1,
    this.style,
  });
  final String sample, labelText;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => enter(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          label(s, labelText, mono: true),
          gap(s),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: heading(s, sample, size: 120, lines: 1),
            ),
          ),
          rule(s),
          gap(s),
          label(s, sample, size: 32, mono: true),
          gap(s),
          Text(
            sample,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: s.caption.copyWith(fontSize: 26, color: s.foreground),
          ),
          gap(s),
          label(s, 'BODY / MONO / CAPTION', size: 14, mono: true),
        ],
      ),
      progress,
    ),
  );
}
