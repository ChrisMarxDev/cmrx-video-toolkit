import 'package:flutter/widgets.dart';
import '../style.dart';
import 'support.dart';

class NextVideoChoices extends StatelessWidget {
  const NextVideoChoices({
    super.key,
    required this.first,
    required this.second,
    required this.firstTitle,
    required this.secondTitle,
    this.action = 'WATCH NEXT',
    this.progress = 1,
    this.style,
  });
  final Widget first, second;
  final String firstTitle, secondTitle, action;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => enter(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          label(s, action, mono: true),
          gap(s),
          Expanded(
            child: Row(
              children: [
                for (final item in [(first, firstTitle), (second, secondTitle)])
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(right: s.spacing),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: slot(s, item.$1)),
                          gap(s),
                          label(s, item.$2, size: 28),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      progress,
    ),
  );
}

@immutable
class CreditEntry {
  const CreditEntry(this.role, this.name);
  final String role, name;
}

class CreditsRoll extends StatelessWidget {
  const CreditsRoll({
    super.key,
    required this.credits,
    this.closing = 'Thank you',
    this.progress = 0,
    this.style,
  });
  final List<CreditEntry> credits;
  final String closing;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) {
    nonEmpty(credits, 'credits');
    final p = unit(progress);
    final height = credits.length * 86.0 + 160;
    return SceneCanvas(
      style: style,
      padding: false,
      builder: (s) => ClipRect(
        child: Stack(
          children: [
            Positioned(
              left: 60,
              right: 60,
              top: 500 - p * (500 + height),
              height: height,
              child: Column(
                children: [
                  for (final credit in credits)
                    SizedBox(
                      height: 86,
                      child: Column(
                        children: [
                          label(
                            s,
                            credit.role,
                            lines: 1,
                            size: 14,
                            mono: true,
                            color: s.muted,
                          ),
                          label(s, credit.name, size: 32, lines: 1),
                        ],
                      ),
                    ),
                  gap(s),
                  heading(s, closing, size: 40),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class NextEpisode extends StatelessWidget {
  const NextEpisode({
    super.key,
    required this.artwork,
    required this.title,
    required this.episode,
    required this.date,
    this.progress = 1,
    this.style,
  });
  final Widget artwork;
  final String title, episode, date;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => enter(
      Row(
        children: [
          Expanded(child: slot(s, artwork, height: 428)),
          SizedBox(width: s.spacing * 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                label(s, episode, mono: true),
                gap(s),
                heading(s, title),
                gap(s),
                panel(s, label(s, date, color: s.onAccent), accent: true),
              ],
            ),
          ),
        ],
      ),
      progress,
    ),
  );
}

class SubscribeInteraction extends StatelessWidget {
  const SubscribeInteraction({
    super.key,
    this.labelText = 'Subscribe',
    this.confirmedLabel = 'Subscribed',
    this.progress = 0,
    this.style,
  });
  final String labelText, confirmedLabel;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) {
      final p = unit(progress);
      return Center(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Transform.scale(
              filterQuality: FilterQuality.medium,
              scale: p > .45 && p < .6 ? .94 : 1,
              child: panel(
                s,
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SceneMark(
                      kind: p >= .5 ? 'done' : 'add',
                      color: p >= .5 ? s.onAccent : s.foreground,
                      size: 40,
                    ),
                    SizedBox(width: s.spacing),
                    label(
                      s,
                      p >= .5 ? confirmedLabel : labelText,
                      size: 40,
                      color: p >= .5 ? s.onAccent : s.foreground,
                    ),
                  ],
                ),
                accent: p >= .5,
                padding: 32,
              ),
            ),
            Positioned(
              right: -100 * (1 - p),
              bottom: -80 * (1 - p) - 20,
              child: label(s, '↖', size: 52),
            ),
          ],
        ),
      );
    },
  );
}

class ProductSignOff extends StatelessWidget {
  const ProductSignOff({
    super.key,
    required this.headline,
    required this.url,
    this.availability = '',
    this.action = 'Explore',
    this.product,
    this.progress = 1,
    this.style,
  });
  final String headline, url, availability, action;
  final Widget? product;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => enter(
      Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                label(s, availability, mono: true),
                gap(s),
                heading(s, headline, size: 40, lines: 4),
                gap(s),
                panel(
                  s,
                  label(s, action, size: 24, color: s.onAccent),
                  accent: true,
                ),
                gap(s),
                label(s, url, mono: true),
              ],
            ),
          ),
          if (product != null) ...[
            SizedBox(width: s.spacing),
            Expanded(child: slot(s, product!, height: 360)),
          ],
        ],
      ),
      progress,
    ),
  );
}

class EventClosing extends StatelessWidget {
  const EventClosing({
    super.key,
    required this.thanks,
    required this.date,
    required this.venue,
    this.ticket = 'Save the date',
    this.progress = 1,
    this.style,
  });
  final String thanks, date, venue, ticket;
  final double progress;
  final VideoStyle? style;
  @override
  Widget build(BuildContext context) => SceneCanvas(
    style: style,
    builder: (s) => enter(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          heading(s, thanks, size: 76),
          const Spacer(),
          rule(s),
          gap(s),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    label(s, date, size: 30),
                    label(s, venue, color: s.muted),
                  ],
                ),
              ),
              panel(
                s,
                label(s, ticket, mono: true, color: s.onAccent),
                accent: true,
              ),
            ],
          ),
        ],
      ),
      progress,
    ),
  );
}
