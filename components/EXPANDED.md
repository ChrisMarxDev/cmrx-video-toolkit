# Expanded video components

The library includes 48 additional widgets across eight families. Import
`package:video_components/video_components.dart` (or `expanded.dart` for just this
set). Every styled widget accepts `style:` or inherits `VideoThemeScope`.
Transitions inherit the appearance of their source/destination children;
`FramePushThrough` additionally resolves the theme for its frame.

These are original Flutter implementations. All browser fixtures are synthetic;
no template source, third-party artwork, fonts, network requests or paid assets
are required. `expanded_samples.dart` is a separate optional import containing
browser recipes and original vector placeholders, not production content.

## Use in a composition

```dart
VideoThemeScope(
  style: yourStyle,
  child: EditorialTitle(
    title: 'A clear idea',
    kicker: 'CHAPTER 01',
    progress: revealProgress,
  ),
)

// Supply actual transcript times. End times are exclusive; gaps remain inactive.
TimedWordCaptions(
  words: [CaptionWord('Hello', 0.2, 0.7), CaptionWord('there', 0.8, 1.2)],
  seconds: editedOutputSeconds,
)

StripeWipe(from: firstScene, to: secondScene, progress: transitionProgress)

// Media slots are ordinary widgets, including decoded Image widgets, a video
// widget preloaded by the caller, or an editable Flutter composition.
ScreenshotFan(screens: yourScreens, focus: 1, progress: revealProgress)
```

Use a bounded parent. Most composed cards use an 800 × 500 logical layout that
scales uniformly to fit landscape, portrait or square bounds. This preserves the
layout rather than automatically rearranging it for portrait delivery. The media
transition and route primitives fill the caller's actual bounds. Surround an
overlay with a Stack or place it within a chosen region in your composition.
Long display text is capped/ellipsized; shorten copy or compose a larger layout
when the entire text must be shown. Theme roles include fonts, colors, spacing,
borders and corner radii; semantic circular shapes remain circles.

All motion uses explicit progress, position or seconds. Progress is finite and
clamped to 0–1; there are no timers or random values. Use your edited timeline to
calculate it. `CreditsRoll` traverses the whole credit list from below to above
the canvas, so both endpoints are intentionally empty. Countdown interpolation
truncates the elapsed integer delta; both endpoints are exact. WordHeadline can
accept explicit normalized per-word start times. CodeWalkthrough moves a bounded
eight-line viewport toward the selected focus range. SubscribeInteraction is a
visual demonstration and performs no network or account operation.

## Catalog

Every entry has two editable presets in the public browser and in consuming
integrations that register it. Stable IDs stay `video.*` when the same base widget
is shown through another identity. This avoids duplicating shared behavior under
a brand prefix. Constructor snippets expect caller-owned `media: List<Widget>`,
`map: Widget` and `progress` where used. The core package exports the typed models
and line-oriented parser helpers used by the snippets.

### Titles

| ID | Widget | Behavior |
|---|---|---|
| `video.editorial-title` | `EditorialTitle` | Large editorial headline with a frame-derived reveal and rule. |
| `video.episode-title` | `EpisodeTitle` | Episode opener with a host credit and caller-owned logo slot. |
| `video.interview-opener` | `InterviewOpener` | Split portrait and interview topic with independent editable credits. |
| `video.word-headline` | `WordHeadline` | Word-by-word reveal; API also accepts explicit normalized start times. |
| `video.selection-title` | `SelectionTitle` | Selection rectangle, corner handles and moving cursor around editable type. |
| `video.typography-specimen` | `TypographySpecimen` | Body, mono and caption roles compared using the inherited font tokens. |

### End cards

| ID | Widget | Behavior |
|---|---|---|
| `video.next-video-choices` | `NextVideoChoices` | Two independent thumbnail and title slots for a usable end screen. |
| `video.credits-roll` | `CreditsRoll` | Continuous clipped credit roll; progress controls the entire travel distance. |
| `video.next-episode` | `NextEpisode` | Artwork teaser with separate episode and release-date fields. |
| `video.subscribe-interaction` | `SubscribeInteraction` | Deterministic cursor approach, pressed button and confirmed state. Visual only. |
| `video.product-sign-off` | `ProductSignOff` | Product slot, availability, URL and call to action. |
| `video.event-closing` | `EventClosing` | Closing statement above a date, venue and ticket stub. |

### Presenter overlays

| ID | Widget | Behavior |
|---|---|---|
| `video.portrait-lower-third` | `PortraitLowerThird` | Portrait and identity overlay anchored to either lower corner. |
| `video.rule-lower-third` | `RuleLowerThird` | Quiet lower third with an animated rule and no backplate. |
| `video.profile-chip` | `ProfileChip` | Compact avatar, name, handle and optional badge. |
| `video.timed-word-captions` | `TimedWordCaptions` | Exact half-open timestamp intervals highlight only the currently spoken word. |
| `video.chapter-ticket` | `ChapterTicket` | Numbered chapter divider with a separate metadata line. |
| `video.information-rows` | `InformationRows` | One to three staggered label, value and symbol rows. |

### Developer demos

| ID | Widget | Behavior |
|---|---|---|
| `video.terminal-playback` | `TerminalPlayback` | Character-by-character terminal playback with a deterministic blinking cursor. |
| `video.code-diff` | `CodeDiff` | Aligned before/after code, changed-line backplates and explicit +/− markers. |
| `video.request-response` | `RequestResponse` | Request bar, transfer indicator and delayed response payload. |
| `video.code-walkthrough` | `CodeWalkthrough` | Numbered code viewport, focused line range and explanation; progress pans to focus. |
| `video.pipeline-status` | `PipelineStatus` | Explicit waiting/running/done/failed states with timestamps and a log line. |
| `video.specification-table` | `SpecificationTable` | Label, value and unit columns with optional active-row emphasis. |

### Media layouts

| ID | Widget | Behavior |
|---|---|---|
| `video.screenshot-rail` | `ScreenshotRail` | Horizontally traversed screenshot rail with caller-controlled perspective. |
| `video.screenshot-stack` | `ScreenshotStack` | Layered screenshots with an explicit foreground image and reversible stagger. |
| `video.screenshot-fan` | `ScreenshotFan` | Rotated screenshot fan with an independent focused image. |
| `video.device-screen-swap` | `DeviceScreenSwap` | Generic portrait or landscape device frame with a scrubbed screen dissolve. |
| `video.editorial-image-grid` | `EditorialImageGrid` | Asymmetric hero-and-supporting-image grid with staggered entries. |
| `video.focus-carousel` | `FocusCarousel` | Continuous carousel position controls depth scale, opacity and stacking order. |

### Data graphics

| ID | Widget | Behavior |
|---|---|---|
| `video.waterfall-chart` | `WaterfallChart` | Signed deltas with cumulative positions, connectors and a zero baseline. |
| `video.conversion-funnel` | `ConversionFunnel` | Proportional stage widths, absolute counts and per-stage conversion rates. |
| `video.calendar-heatmap` | `CalendarHeatmap` | Date-addressed daily cells with a shared normalized intensity scale. |
| `video.radar-comparison` | `RadarComparison` | Normalized radial polygons on labeled axes with multiple series. |
| `video.scatter-plot` | `ScatterPlot` | Labeled numeric coordinates with a visible grid and numeric axis ticks. |
| `video.target-gauge` | `TargetGauge` | Semicircular gauge, animated value and an independent target marker. |

### Transitions

| ID | Widget | Behavior |
|---|---|---|
| `video.stripe-wipe` | `StripeWipe` | Staggered directional strips reveal one real child over another. |
| `video.dot-iris` | `DotIris` | Expanding circles propagate from a configurable center to cover the frame. |
| `video.tile-wave` | `TileWave` | Diagonal staggered tile growth clips the destination scene. |
| `video.alternating-panels` | `AlternatingPanels` | Adjacent vertical panels enter from alternating top and bottom edges. |
| `video.frame-push-through` | `FramePushThrough` | A framed destination grows from the center to replace the source scene. |
| `video.letterbox-reveal` | `LetterboxReveal` | A central horizontal aperture opens vertically onto the destination scene. |

### Social and spatial

| ID | Widget | Behavior |
|---|---|---|
| `video.quote-card` | `QuoteCard` | Attributed quotation with an optional portrait slot; supply verified quotations. |
| `video.testimonial-stack` | `TestimonialStack` | Indexed quotation cards with visible layered depth; sample claims are fictional. |
| `video.countdown-counter` | `CountdownCounter` | Integer counter derived solely from progress, with configurable direction and padding. |
| `video.metric-comparison` | `MetricComparison` | Two independently labeled values, a signed difference and a source credit. |
| `video.route-trace` | `RouteTrace` | Arc-length route reveal on a caller-owned map, with normalized waypoints. |
| `video.location-card` | `LocationCard` | Caller-owned map slot with a normalized pin, address and event details. |

## Structured controls and bounds

The browser accepts one record per line with `|` between fields. Parsers reject
malformed records and nonfinite numbers. Edits that violate domain constraints
show an inline explanation and recover when corrected.

| Input | Format / limits |
|---|---|
| Credits | `Role | Name`; 1–100 entries |
| Timed captions | `word | startSeconds | endSeconds`; 1–40 ordered, nonoverlapping intervals |
| Information rows | `Label | Value | Symbol`; 1–3 rows |
| Pipeline | `Stage | waiting/running/done/failed | Detail`; 1–6 stages |
| Specifications | `Label | Value | Unit`; 1–8 rows |
| Waterfall | `Label | signedDelta`; 1–12 finite values, explicit baseline |
| Funnel | `Stage | count`; 1–12 nonincreasing nonnegative counts, first positive |
| Calendar | `YYYY-MM-DD | value`; finite nonnegative values, 1–24 weeks |
| Radar | `Series | 0.4,0.8,0.5`; 1–3 series, 3–8 matching axes, values 0–1 |
| Scatter | `Label | x | y`; 1–100 points within explicit numeric domains |
| Testimonials | `Quote | Author`; 1–10 entries |
| Route | `x | y`; 2–100 normalized points, optional matching waypoint labels |

Calendar `start` is the first displayed date; row labels follow its weekday.
Dates outside the displayed window are not drawn. If a date repeats, the last
entry wins. Cells share a maximum across supplied values (at least 1). Radar
series use the theme's foreground, accent and muted roles with a swatch legend;
normalization belongs to the caller. Scatter browser examples use 0–100 domains;
the widget API accepts arbitrary finite increasing bounds. Gauge values and target
must lie within its bounds. Chart animation reveals final labeled data; it does
not imply sampled intermediate observations. These are explanatory graphics,
not a scientific plotting or GIS system. Route coordinates are normalized to a
caller-owned map widget and carry no geographic projection or map service.

Terminal/code panes accept up to 12 lines; a walkthrough accepts up to 100 with a
valid zero-based focus range. Media rails/carousels accept 1–12 slots, stacks 1–8,
fans 1–7, and the asymmetric image grid 3–5. Invalid active media indices are
clamped; the fan leaves all screens unfocused when its focus index is absent.
Transition grids support 1–32 rows/columns, strips/panels 1–64. All transitions
show exactly the source at 0 and destination at 1 and support reverse seeking.

## Validation and visual review

`flutter test test/expanded_test.dart` in components checks the complete new
preset inventory at start/middle/end, parsing, inherited theme updates, exact
caption boundaries, counter endpoints and transition pixels/reverse seeking.
Both browsers' registry tests render every preset in portrait and landscape.

To compile the current copied constructors (including numeric controls represented
as doubles), generate a temporary test and run it:

```sh
flutter test test/expanded_test.dart \
  --dart-define=EXPANDED_EXAMPLES_OUT="$PWD/test/expanded_examples_generated_test.dart"
flutter test test/expanded_examples_generated_test.dart
rm test/expanded_examples_generated_test.dart
```

The generated file is a temporary verification artifact, not the authoritative
example source. Real media decoding/preloading and production timeline mapping
remain the caller's responsibility.
