---
name: vertical-video
description: Prepare or check vertical-video dimensions, export compatibility, cropping and platform UI safe areas for Reels, TikTok and Shorts. Applies only to technical formatting, not content or editorial decisions.
---

# Vertical video

Apply only technical layout and delivery constraints. Preserve the script, scene
order, cuts, timing, audio content and chosen visual style. This skill supplies no
hooks, pacing rules, ideal duration, engagement targets or content suggestions.

## Frame and export

- Use the requested aspect ratio. Full-height portrait delivery commonly uses
  9:16: for example 1080×1920 or 720×1280. These are dimensions, not a mandatory
  resolution for every platform or project.
- Preserve image proportions. Fit/reposition content within the target frame;
  do not stretch it or crop meaningful source content silently.
- Match the destination's supported container, codecs, frame rate and resolution.
  MP4 with H.264 video and AAC audio is a common delivery combination. Preserve
  the existing frame rate unless conversion is technically required.
- Check actual encoded dimensions, display orientation, duration and audio/video
  sync. If a platform limit conflicts with the approved duration, report the
  incompatibility; do not shorten, split or accelerate the video automatically.

## Control overlays / dead zones

These are areas that platform UI may cover, not parts of the video to leave black:

- **Top edge:** navigation, tabs, search or other header controls.
- **Right edge:** the vertical interaction rail, such as like, comment and share.
- **Bottom area:** account/title/description, audio attribution, captions,
  playback/navigation controls and any additional buttons or links.

Background imagery may fill these areas. Position authored text, subtitles and
other elements that must remain visible outside the relevant overlay footprints.
Native platform captions can occupy additional space. Profile/feed cover crops
are separate from full-screen playback and need a separate check.

There is no universal pixel rectangle for all three apps. Device, app version,
placement, text length, language and expanded controls change the occupied area.
Do not treat an ad safe-zone template as an exact organic-post specification.

Use current destination guides or an actual draft preview with its intended UI
state. If recording measurements, identify platform/placement, date, reference
frame size and overlay rectangles; transform them into the video's displayed
coordinate space, accounting for any crop or letterboxing. For a common master,
keep required-visible elements outside the union of the checked footprints.
Do not shrink the entire video into that area. If only approximate guides are
available, label the placement unverified rather than inventing exact margins.

## Format check

Inspect representative frames at phone display size, including the widest text
and lowest/rightmost elements. Check clipping, UI overlap and cover crops. Remove
any diagnostic safe-zone guides from the export. Use the clean source export for
each destination rather than a downloaded copy containing another app's UI.

Sources for placement verification (consult current guidance when applying):
[YouTube visual guides](https://support.google.com/youtube/answer/16215842?hl=en),
[TikTok safe-zone templates](https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en-GB)
(ad-specific; size varies with caption length and added formats).
