import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'video_components.dart';

// Synthetic, original browser fixtures. Replace these slots with your own assets.
Widget expandedSample(String id, Map<String, dynamic> p, double progress) {
  final media = List<Widget>.generate(4, (i) => SyntheticScreen(index: i));
  const map = SyntheticMap();
  return switch (id) {
    'video.editorial-title' => EditorialTitle(
      title: (p['title'] as String),
      kicker: (p['kicker'] as String),
      alignRight: (p['alignRight'] as bool),
      progress: progress,
    ),
    'video.episode-title' => EpisodeTitle(
      title: (p['title'] as String),
      episode: (p['episode'] as String),
      host: (p['host'] as String),
      logo: const SyntheticMark(),
      progress: progress,
    ),
    'video.interview-opener' => InterviewOpener(
      portrait: const SyntheticPortrait(),
      name: (p['name'] as String),
      role: (p['role'] as String),
      topic: (p['topic'] as String),
      progress: progress,
    ),
    'video.word-headline' => WordHeadline(
      words: (p['words'] as String).split('\n'),
      emphasis: (p['emphasis'] as num).toInt(),
      progress: progress,
    ),
    'video.selection-title' => SelectionTitle(
      title: (p['title'] as String),
      progress: progress,
    ),
    'video.typography-specimen' => TypographySpecimen(
      sample: (p['sample'] as String),
      labelText: (p['labelText'] as String),
      progress: progress,
    ),
    'video.next-video-choices' => NextVideoChoices(
      first: media[0],
      second: media[1],
      firstTitle: (p['firstTitle'] as String),
      secondTitle: (p['secondTitle'] as String),
      action: (p['action'] as String),
      progress: progress,
    ),
    'video.credits-roll' => CreditsRoll(
      credits: parseCredits((p['credits'] as String)),
      closing: (p['closing'] as String),
      progress: progress,
    ),
    'video.next-episode' => NextEpisode(
      artwork: media[1],
      title: (p['title'] as String),
      episode: (p['episode'] as String),
      date: (p['date'] as String),
      progress: progress,
    ),
    'video.subscribe-interaction' => SubscribeInteraction(
      labelText: (p['labelText'] as String),
      confirmedLabel: (p['confirmedLabel'] as String),
      progress: progress,
    ),
    'video.product-sign-off' => ProductSignOff(
      headline: (p['headline'] as String),
      url: (p['url'] as String),
      availability: (p['availability'] as String),
      action: (p['action'] as String),
      product: media[2],
      progress: progress,
    ),
    'video.event-closing' => EventClosing(
      thanks: (p['thanks'] as String),
      date: (p['date'] as String),
      venue: (p['venue'] as String),
      ticket: (p['ticket'] as String),
      progress: progress,
    ),
    'video.portrait-lower-third' => PortraitLowerThird(
      portrait: const SyntheticPortrait(),
      name: (p['name'] as String),
      role: (p['role'] as String),
      alignRight: (p['alignRight'] as bool),
      progress: progress,
    ),
    'video.rule-lower-third' => RuleLowerThird(
      name: (p['name'] as String),
      role: (p['role'] as String),
      progress: progress,
    ),
    'video.profile-chip' => ProfileChip(
      avatar: const SyntheticPortrait(),
      name: (p['name'] as String),
      handle: (p['handle'] as String),
      badge: (p['badge'] as String),
      progress: progress,
    ),
    'video.timed-word-captions' => TimedWordCaptions(
      words: parseCaptionWords((p['words'] as String)),
      seconds: progress * (p['duration'] as num).toDouble(),
    ),
    'video.chapter-ticket' => ChapterTicket(
      chapter: (p['chapter'] as String),
      title: (p['title'] as String),
      metadata: (p['metadata'] as String),
      progress: progress,
    ),
    'video.information-rows' => InformationRows(
      rows: parseInformationRows((p['rows'] as String)),
      progress: progress,
    ),
    'video.terminal-playback' => TerminalPlayback(
      lines: (p['lines'] as String).split('\n'),
      title: (p['title'] as String),
      cursor: (p['cursor'] as bool),
      progress: progress,
    ),
    'video.code-diff' => CodeDiff(
      before: (p['before'] as String).split('\n'),
      after: (p['after'] as String).split('\n'),
      progress: progress,
    ),
    'video.request-response' => RequestResponse(
      method: (p['method'] as String),
      endpoint: (p['endpoint'] as String),
      status: (p['status'] as String),
      payload: (p['payload'] as String),
      progress: progress,
    ),
    'video.code-walkthrough' => CodeWalkthrough(
      lines: (p['lines'] as String).split('\n'),
      note: (p['note'] as String),
      focusStart: (p['focusStart'] as num).toInt(),
      focusEnd: (p['focusEnd'] as num).toInt(),
      progress: progress,
    ),
    'video.pipeline-status' => PipelineStatus(
      stages: parsePipelineSteps((p['stages'] as String)),
      log: (p['log'] as String),
      progress: progress,
    ),
    'video.specification-table' => SpecificationTable(
      rows: parseSpecifications((p['rows'] as String)),
      title: (p['title'] as String),
      activeRow: (p['activeRow'] as num).toInt(),
    ),
    'video.screenshot-rail' => ScreenshotRail(
      screens: media,
      position: (p['position'] as num).toDouble() * progress,
      perspective: (p['perspective'] as num).toDouble(),
    ),
    'video.screenshot-stack' => ScreenshotStack(
      screens: media,
      activeIndex: (p['activeIndex'] as num).toInt(),
      progress: progress,
    ),
    'video.screenshot-fan' => ScreenshotFan(
      screens: media,
      spread: (p['spread'] as num).toDouble(),
      focus: (p['focus'] as num).toInt(),
      progress: progress,
    ),
    'video.device-screen-swap' => DeviceScreenSwap(
      from: media[0],
      to: media[1],
      portrait: (p['portrait'] as bool),
      progress: progress,
    ),
    'video.editorial-image-grid' => EditorialImageGrid(
      media: media,
      activeTile: (p['activeTile'] as num).toInt(),
      progress: progress,
    ),
    'video.focus-carousel' => FocusCarousel(
      items: media,
      position: (p['position'] as num).toDouble() * progress,
    ),
    'video.waterfall-chart' => WaterfallChart(
      data: parseChartValues((p['data'] as String)),
      baseline: (p['baseline'] as num).toDouble(),
      title: (p['title'] as String),
      unitLabel: (p['unitLabel'] as String),
      progress: progress,
    ),
    'video.conversion-funnel' => ConversionFunnel(
      stages: parseChartValues((p['stages'] as String)),
      title: (p['title'] as String),
      progress: progress,
    ),
    'video.calendar-heatmap' => CalendarHeatmap(
      values: parseHeatmapValues((p['values'] as String)),
      start: parseCalendarDate((p['start'] as String)),
      weeks: (p['weeks'] as num).toInt(),
      title: (p['title'] as String),
      progress: progress,
    ),
    'video.radar-comparison' => RadarComparison(
      axes: (p['axes'] as String).split('\n'),
      series: parseRadarSeries((p['series'] as String)),
      title: (p['title'] as String),
      progress: progress,
    ),
    'video.scatter-plot' => ScatterPlot(
      points: parseScatterPoints((p['points'] as String)),
      xLabel: (p['xLabel'] as String),
      yLabel: (p['yLabel'] as String),
      title: (p['title'] as String),
      progress: progress,
    ),
    'video.target-gauge' => TargetGauge(
      value: (p['value'] as num).toDouble(),
      target: (p['target'] as num).toDouble(),
      unitLabel: (p['unitLabel'] as String),
      title: (p['title'] as String),
      progress: progress,
    ),
    'video.stripe-wipe' => StripeWipe(
      from: media[0],
      to: media[1],
      count: (p['count'] as num).toInt(),
      direction: WipeDirection.values.byName((p['direction'] as String)),
      progress: progress,
    ),
    'video.dot-iris' => DotIris(
      from: media[0],
      to: media[1],
      columns: (p['columns'] as num).toInt(),
      rows: (p['rows'] as num).toInt(),
      progress: progress,
    ),
    'video.tile-wave' => TileWave(
      from: media[0],
      to: media[1],
      columns: (p['columns'] as num).toInt(),
      rows: (p['rows'] as num).toInt(),
      progress: progress,
    ),
    'video.alternating-panels' => AlternatingPanels(
      from: media[0],
      to: media[1],
      count: (p['count'] as num).toInt(),
      progress: progress,
    ),
    'video.frame-push-through' => FramePushThrough(
      from: (p['reverse'] as bool) ? media[1] : media[0],
      to: (p['reverse'] as bool) ? media[0] : media[1],
      progress: progress,
    ),
    'video.letterbox-reveal' => LetterboxReveal(
      from: (p['reverse'] as bool) ? media[1] : media[0],
      to: (p['reverse'] as bool) ? media[0] : media[1],
      progress: progress,
    ),
    'video.quote-card' => QuoteCard(
      quote: (p['quote'] as String),
      attribution: (p['attribution'] as String),
      portrait: const SyntheticPortrait(),
      progress: progress,
    ),
    'video.testimonial-stack' => TestimonialStack(
      quotes: parseTestimonials((p['quotes'] as String)),
      activeIndex: (p['activeIndex'] as num).toInt(),
      progress: progress,
    ),
    'video.countdown-counter' => CountdownCounter(
      start: (p['start'] as num).toInt(),
      end: (p['end'] as num).toInt(),
      labelText: (p['labelText'] as String),
      pad: (p['pad'] as num).toInt(),
      progress: progress,
    ),
    'video.metric-comparison' => MetricComparison(
      first: (p['first'] as num).toDouble(),
      second: (p['second'] as num).toDouble(),
      firstLabel: (p['firstLabel'] as String),
      secondLabel: (p['secondLabel'] as String),
      unitLabel: (p['unitLabel'] as String),
      source: (p['source'] as String),
      progress: progress,
    ),
    'video.route-trace' => RouteTrace(
      map: map,
      points: parseRoutePoints((p['points'] as String)),
      labels: (p['labels'] as String).split('\n'),
      progress: progress,
    ),
    'video.location-card' => LocationCard(
      map: map,
      address: (p['address'] as String),
      details: (p['details'] as String),
      pin: Offset((p['pinX'] as num).toDouble(), (p['pinY'] as num).toDouble()),
      progress: progress,
    ),
    _ => throw ArgumentError('Unknown expanded component: $id'),
  };
}

String _literal(Object? value) => jsonEncode(value).replaceAll(r'$', r'\$');

/// Complete constructor expression. `media`, `map`, and `progress` are caller
/// inputs; parser helpers are exported by video_components.dart.
String expandedExample(String id, Map<String, dynamic> p) => switch (id) {
  'video.editorial-title' =>
    "EditorialTitle(title: ${_literal(p['title'])}, kicker: ${_literal(p['kicker'])}, alignRight: ${_literal(p['alignRight'])}, progress: progress)",
  'video.episode-title' =>
    "EpisodeTitle(title: ${_literal(p['title'])}, episode: ${_literal(p['episode'])}, host: ${_literal(p['host'])}, logo: media[0], progress: progress)",
  'video.interview-opener' =>
    "InterviewOpener(portrait: media[0], name: ${_literal(p['name'])}, role: ${_literal(p['role'])}, topic: ${_literal(p['topic'])}, progress: progress)",
  'video.word-headline' =>
    "WordHeadline(words: ${_literal(p['words'])}.split('\\n'), emphasis: ${_literal((p['emphasis'] as num).toInt())}, progress: progress)",
  'video.selection-title' =>
    "SelectionTitle(title: ${_literal(p['title'])}, progress: progress)",
  'video.typography-specimen' =>
    "TypographySpecimen(sample: ${_literal(p['sample'])}, labelText: ${_literal(p['labelText'])}, progress: progress)",
  'video.next-video-choices' =>
    "NextVideoChoices(first: media[0], second: media[1], firstTitle: ${_literal(p['firstTitle'])}, secondTitle: ${_literal(p['secondTitle'])}, action: ${_literal(p['action'])}, progress: progress)",
  'video.credits-roll' =>
    "CreditsRoll(credits: parseCredits(${_literal(p['credits'])}), closing: ${_literal(p['closing'])}, progress: progress)",
  'video.next-episode' =>
    "NextEpisode(artwork: media[1], title: ${_literal(p['title'])}, episode: ${_literal(p['episode'])}, date: ${_literal(p['date'])}, progress: progress)",
  'video.subscribe-interaction' =>
    "SubscribeInteraction(labelText: ${_literal(p['labelText'])}, confirmedLabel: ${_literal(p['confirmedLabel'])}, progress: progress)",
  'video.product-sign-off' =>
    "ProductSignOff(headline: ${_literal(p['headline'])}, url: ${_literal(p['url'])}, availability: ${_literal(p['availability'])}, action: ${_literal(p['action'])}, product: media[2], progress: progress)",
  'video.event-closing' =>
    "EventClosing(thanks: ${_literal(p['thanks'])}, date: ${_literal(p['date'])}, venue: ${_literal(p['venue'])}, ticket: ${_literal(p['ticket'])}, progress: progress)",
  'video.portrait-lower-third' =>
    "PortraitLowerThird(portrait: media[0], name: ${_literal(p['name'])}, role: ${_literal(p['role'])}, alignRight: ${_literal(p['alignRight'])}, progress: progress)",
  'video.rule-lower-third' =>
    "RuleLowerThird(name: ${_literal(p['name'])}, role: ${_literal(p['role'])}, progress: progress)",
  'video.profile-chip' =>
    "ProfileChip(avatar: media[0], name: ${_literal(p['name'])}, handle: ${_literal(p['handle'])}, badge: ${_literal(p['badge'])}, progress: progress)",
  'video.timed-word-captions' =>
    "TimedWordCaptions(words: parseCaptionWords(${_literal(p['words'])}), seconds: progress * ${_literal(p['duration'])})",
  'video.chapter-ticket' =>
    "ChapterTicket(chapter: ${_literal(p['chapter'])}, title: ${_literal(p['title'])}, metadata: ${_literal(p['metadata'])}, progress: progress)",
  'video.information-rows' =>
    "InformationRows(rows: parseInformationRows(${_literal(p['rows'])}), progress: progress)",
  'video.terminal-playback' =>
    "TerminalPlayback(lines: ${_literal(p['lines'])}.split('\\n'), title: ${_literal(p['title'])}, cursor: ${_literal(p['cursor'])}, progress: progress)",
  'video.code-diff' =>
    "CodeDiff(before: ${_literal(p['before'])}.split('\\n'), after: ${_literal(p['after'])}.split('\\n'), progress: progress)",
  'video.request-response' =>
    "RequestResponse(method: ${_literal(p['method'])}, endpoint: ${_literal(p['endpoint'])}, status: ${_literal(p['status'])}, payload: ${_literal(p['payload'])}, progress: progress)",
  'video.code-walkthrough' =>
    "CodeWalkthrough(lines: ${_literal(p['lines'])}.split('\\n'), note: ${_literal(p['note'])}, focusStart: ${_literal((p['focusStart'] as num).toInt())}, focusEnd: ${_literal((p['focusEnd'] as num).toInt())}, progress: progress)",
  'video.pipeline-status' =>
    "PipelineStatus(stages: parsePipelineSteps(${_literal(p['stages'])}), log: ${_literal(p['log'])}, progress: progress)",
  'video.specification-table' =>
    "SpecificationTable(rows: parseSpecifications(${_literal(p['rows'])}), title: ${_literal(p['title'])}, activeRow: ${_literal((p['activeRow'] as num).toInt())})",
  'video.screenshot-rail' =>
    "ScreenshotRail(screens: media, position: ${_literal(p['position'])} * progress, perspective: ${_literal(p['perspective'])})",
  'video.screenshot-stack' =>
    "ScreenshotStack(screens: media, activeIndex: ${_literal((p['activeIndex'] as num).toInt())}, progress: progress)",
  'video.screenshot-fan' =>
    "ScreenshotFan(screens: media, spread: ${_literal(p['spread'])}, focus: ${_literal((p['focus'] as num).toInt())}, progress: progress)",
  'video.device-screen-swap' =>
    "DeviceScreenSwap(from: media[0], to: media[1], portrait: ${_literal(p['portrait'])}, progress: progress)",
  'video.editorial-image-grid' =>
    "EditorialImageGrid(media: media, activeTile: ${_literal((p['activeTile'] as num).toInt())}, progress: progress)",
  'video.focus-carousel' =>
    "FocusCarousel(items: media, position: ${_literal(p['position'])} * progress)",
  'video.waterfall-chart' =>
    "WaterfallChart(data: parseChartValues(${_literal(p['data'])}), baseline: ${_literal(p['baseline'])}, title: ${_literal(p['title'])}, unitLabel: ${_literal(p['unitLabel'])}, progress: progress)",
  'video.conversion-funnel' =>
    "ConversionFunnel(stages: parseChartValues(${_literal(p['stages'])}), title: ${_literal(p['title'])}, progress: progress)",
  'video.calendar-heatmap' =>
    "CalendarHeatmap(values: parseHeatmapValues(${_literal(p['values'])}), start: parseCalendarDate(${_literal(p['start'])}), weeks: ${_literal((p['weeks'] as num).toInt())}, title: ${_literal(p['title'])}, progress: progress)",
  'video.radar-comparison' =>
    "RadarComparison(axes: ${_literal(p['axes'])}.split('\\n'), series: parseRadarSeries(${_literal(p['series'])}), title: ${_literal(p['title'])}, progress: progress)",
  'video.scatter-plot' =>
    "ScatterPlot(points: parseScatterPoints(${_literal(p['points'])}), xLabel: ${_literal(p['xLabel'])}, yLabel: ${_literal(p['yLabel'])}, title: ${_literal(p['title'])}, progress: progress)",
  'video.target-gauge' =>
    "TargetGauge(value: ${_literal(p['value'])}, target: ${_literal(p['target'])}, unitLabel: ${_literal(p['unitLabel'])}, title: ${_literal(p['title'])}, progress: progress)",
  'video.stripe-wipe' =>
    "StripeWipe(from: media[0], to: media[1], count: ${_literal((p['count'] as num).toInt())}, direction: WipeDirection.values.byName(${_literal(p['direction'])}), progress: progress)",
  'video.dot-iris' =>
    "DotIris(from: media[0], to: media[1], columns: ${_literal((p['columns'] as num).toInt())}, rows: ${_literal((p['rows'] as num).toInt())}, progress: progress)",
  'video.tile-wave' =>
    "TileWave(from: media[0], to: media[1], columns: ${_literal((p['columns'] as num).toInt())}, rows: ${_literal((p['rows'] as num).toInt())}, progress: progress)",
  'video.alternating-panels' =>
    "AlternatingPanels(from: media[0], to: media[1], count: ${_literal((p['count'] as num).toInt())}, progress: progress)",
  'video.frame-push-through' =>
    "FramePushThrough(from: ${_literal(p['reverse'])} ? media[1] : media[0], to: ${_literal(p['reverse'])} ? media[0] : media[1], progress: progress)",
  'video.letterbox-reveal' =>
    "LetterboxReveal(from: ${_literal(p['reverse'])} ? media[1] : media[0], to: ${_literal(p['reverse'])} ? media[0] : media[1], progress: progress)",
  'video.quote-card' =>
    "QuoteCard(quote: ${_literal(p['quote'])}, attribution: ${_literal(p['attribution'])}, portrait: media[0], progress: progress)",
  'video.testimonial-stack' =>
    "TestimonialStack(quotes: parseTestimonials(${_literal(p['quotes'])}), activeIndex: ${_literal((p['activeIndex'] as num).toInt())}, progress: progress)",
  'video.countdown-counter' =>
    "CountdownCounter(start: ${_literal((p['start'] as num).toInt())}, end: ${_literal((p['end'] as num).toInt())}, labelText: ${_literal(p['labelText'])}, pad: ${_literal((p['pad'] as num).toInt())}, progress: progress)",
  'video.metric-comparison' =>
    "MetricComparison(first: ${_literal(p['first'])}, second: ${_literal(p['second'])}, firstLabel: ${_literal(p['firstLabel'])}, secondLabel: ${_literal(p['secondLabel'])}, unitLabel: ${_literal(p['unitLabel'])}, source: ${_literal(p['source'])}, progress: progress)",
  'video.route-trace' =>
    "RouteTrace(map: map, points: parseRoutePoints(${_literal(p['points'])}), labels: ${_literal(p['labels'])}.split('\\n'), progress: progress)",
  'video.location-card' =>
    "LocationCard(map: map, address: ${_literal(p['address'])}, details: ${_literal(p['details'])}, pin: Offset(${_literal(p['pinX'])}, ${_literal(p['pinY'])}), progress: progress)",
  _ => throw ArgumentError('Unknown expanded component: $id'),
};

class SyntheticScreen extends StatelessWidget {
  const SyntheticScreen({super.key, required this.index});
  final int index;
  @override
  Widget build(BuildContext context) {
    final s = VideoThemeScope.of(context);
    return LayoutBuilder(
      builder: (context, c) => ColoredBox(
        color: index.isEven ? s.surface : s.foreground,
        child: FittedBox(
          fit: BoxFit.contain,
          child: SizedBox(
            width: 400,
            height: 300,
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: DefaultTextStyle(
                style: s.body.copyWith(
                  color: index.isEven ? s.foreground : s.background,
                  fontSize: 18,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(width: 10, height: 10, color: s.accent),
                        const SizedBox(width: 10),
                        Text('STUDY / 0${index + 1}'),
                      ],
                    ),
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: SizedBox(
                          width: 344,
                          child: Text(
                            [
                              'Make it clear.',
                              'Build with care.',
                              'A new view.',
                              'Keep exploring.',
                            ][index % 4],
                            style: s.body.copyWith(
                              fontSize: 46,
                              height: 1.1,
                              fontWeight: FontWeight.w700,
                              color: index.isEven ? s.foreground : s.background,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (var i = 0; i < 5; i++)
                          Padding(
                            padding: const EdgeInsets.only(right: 10),
                            child: Container(
                              width: 38,
                              height: 20 + ((i + index) % 5) * 12.0,
                              color: index.isEven ? s.foreground : s.accent,
                            ),
                          ),
                      ],
                    ),
                    const Spacer(),
                    Text('SYNTHETIC SCREEN · ${(index + 1) * 12}'),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SyntheticMap extends StatelessWidget {
  const SyntheticMap({super.key});
  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _MapPainter(VideoThemeScope.of(context)),
    size: Size.infinite,
  );
}

class _MapPainter extends CustomPainter {
  _MapPainter(this.s);
  final VideoStyle s;
  @override
  void paint(Canvas c, Size size) {
    c.drawRect(Offset.zero & size, Paint()..color = s.surface);
    final paint = Paint()
      ..color = s.background
      ..strokeWidth = 12;
    for (var i = 0; i < 8; i++) {
      c.drawLine(
        Offset(i * size.width / 7, 0),
        Offset(i * size.width / 7 + size.width * .18, size.height),
        paint,
      );
      c.drawLine(
        Offset(0, i * size.height / 7),
        Offset(size.width, i * size.height / 7),
        paint,
      );
    }
    final river = Path()
      ..moveTo(size.width * .6, 0)
      ..cubicTo(
        size.width * .2,
        size.height * .3,
        size.width * .9,
        size.height * .6,
        size.width * .45,
        size.height,
      );
    c.drawPath(
      river,
      Paint()
        ..color = s.rule
        ..style = PaintingStyle.stroke
        ..strokeWidth = 28,
    );
  }

  @override
  bool shouldRepaint(_MapPainter old) => s != old.s;
}

/// Browser boundary: syntax errors in edited text are shown as actionable text.
/// Widget-domain errors remain surfaced by Flutter and are tested independently.
class ExpandedSpecimen extends StatelessWidget {
  const ExpandedSpecimen({
    super.key,
    required this.id,
    required this.props,
    required this.progress,
  });
  final String id;
  final Map<String, dynamic> props;
  final double progress;
  @override
  Widget build(BuildContext context) {
    try {
      validateExpandedInputs(id, props);
      return expandedSample(id, props, progress);
    } on FormatException catch (e) {
      return Center(child: Text(e.message));
    } on ArgumentError catch (e) {
      return Center(child: Text('${e.message}'));
    }
  }
}

class SyntheticPortrait extends StatelessWidget {
  const SyntheticPortrait({super.key});
  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _PortraitPainter(VideoThemeScope.of(context)),
    size: Size.infinite,
  );
}

class _PortraitPainter extends CustomPainter {
  _PortraitPainter(this.s);
  final VideoStyle s;
  @override
  void paint(Canvas c, Size size) {
    c.drawRect(Offset.zero & size, Paint()..color = s.surface);
    final scale = size.shortestSide;
    final center = Offset(size.width / 2, size.height * .42);
    c.drawCircle(center, scale * .21, Paint()..color = s.foreground);
    c.drawOval(
      Rect.fromCenter(
        center: Offset(size.width / 2, size.height * .92),
        width: scale * .85,
        height: scale * .75,
      ),
      Paint()..color = s.foreground,
    );
    c.drawCircle(
      Offset(size.width * .8, size.height * .2),
      scale * .07,
      Paint()..color = s.accent,
    );
  }

  @override
  bool shouldRepaint(_PortraitPainter old) => s != old.s;
}

class SyntheticMark extends StatelessWidget {
  const SyntheticMark({super.key});
  @override
  Widget build(BuildContext context) {
    final s = VideoThemeScope.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        for (var i = 0; i < 3; i++)
          Container(
            width: 16,
            height: 20 + i * 14.0,
            margin: const EdgeInsets.only(right: 5),
            color: s.foreground,
          ),
      ],
    );
  }
}

void validateExpandedInputs(String id, Map<String, dynamic> p) {
  void require(bool valid, String message) {
    if (!valid) throw FormatException(message);
  }

  List<String> lines(String key) => (p[key] as String).split('\n');
  switch (id) {
    case 'video.word-headline':
      require(lines('words').length <= 40, 'Use up to 40 words.');
    case 'video.credits-roll':
      require(
        parseCredits(p['credits']).length <= 100,
        'Use up to 100 credits.',
      );
    case 'video.timed-word-captions':
      final words = parseCaptionWords(p['words']);
      require(words.length <= 40, 'Use up to 40 words per caption.');
      double end = 0;
      for (final w in words) {
        require(
          w.start >= end && w.end > w.start,
          'Word times must be positive, ordered and nonoverlapping.',
        );
        end = w.end;
      }
    case 'video.information-rows':
      require(
        parseInformationRows(p['rows']).length <= 3,
        'Use one to three information rows.',
      );
    case 'video.terminal-playback':
      require(lines('lines').length <= 12, 'Use up to 12 terminal lines.');
    case 'video.code-diff':
      require(
        lines('before').length <= 12 && lines('after').length <= 12,
        'Use up to 12 lines per code pane.',
      );
    case 'video.code-walkthrough':
      require(
        lines('lines').length <= 100 &&
            (p['focusStart'] as num) >= 0 &&
            (p['focusEnd'] as num) >= (p['focusStart'] as num) &&
            (p['focusEnd'] as num) < lines('lines').length,
        'Focus range must refer to existing lines (zero-based).',
      );
    case 'video.pipeline-status':
      require(
        parsePipelineSteps(p['stages']).length <= 6,
        'Use up to six pipeline stages.',
      );
    case 'video.specification-table':
      require(
        parseSpecifications(p['rows']).length <= 8,
        'Use up to eight specification rows.',
      );
    case 'video.waterfall-chart':
      require(
        parseChartValues(p['data']).length <= 12,
        'Use up to twelve deltas.',
      );
    case 'video.conversion-funnel':
      final d = parseChartValues(p['stages']);
      require(
        d.length <= 12 && d.first.value > 0,
        'Use up to twelve stages with a positive first count.',
      );
      for (var i = 0; i < d.length; i++) {
        require(
          d[i].value >= 0 && (i == 0 || d[i].value <= d[i - 1].value),
          'Funnel counts must be nonnegative and must not increase.',
        );
      }
    case 'video.calendar-heatmap':
      parseCalendarDate(p['start']);
      final d = parseHeatmapValues(p['values']);
      require(
        d.every((v) => v.value >= 0),
        'Activity values must be nonnegative.',
      );
    case 'video.radar-comparison':
      final axes = lines('axes'), series = parseRadarSeries(p['series']);
      require(
        axes.length >= 3 &&
            axes.length <= 8 &&
            series.length <= 3 &&
            series.every(
              (s) =>
                  s.values.length == axes.length &&
                  s.values.every((v) => v >= 0 && v <= 1),
            ),
        'Use 3–8 axes and up to three matching series with values from 0 to 1.',
      );
    case 'video.scatter-plot':
      final points = parseScatterPoints(p['points']);
      require(
        points.length <= 100 &&
            points.every(
              (p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100,
            ),
        'Demo plot coordinates must be between 0 and 100.',
      );
    case 'video.testimonial-stack':
      require(
        parseTestimonials(p['quotes']).length <= 10,
        'Use up to ten testimonials.',
      );
    case 'video.route-trace':
      final points = parseRoutePoints(p['points']);
      require(
        points.length >= 2 &&
            points.length <= 100 &&
            points.every(
              (p) => p.dx >= 0 && p.dx <= 1 && p.dy >= 0 && p.dy <= 1,
            ) &&
            lines('labels').length == points.length,
        'Supply 2–100 normalized points (0–1) and one label per point.',
      );
  }
}
