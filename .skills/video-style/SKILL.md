---
name: video-style
description: Interview a creator about their video style, interpret website, image and video references, and create or refine a reusable workspace-owned design system with visual direction, tokens and component recipes. Use for discovering and selecting video styles, defining a new style, or revising one; established styles are applied without repeating the interview.
---

# Video Style

Turn a conversation and optional inspiration into a usable creative folder in the
creator's production workspace. The result should let another agent style a new
video without repeating the interview. This skill supplies no default brand.
Paths to other skills are relative to this file; output paths are workspace-relative.

## Resolve the style before creative decisions

Inspect the video's direction/manifest, workspace instructions and any style index,
then the referenced style specifications. A style is a named set of video/editorial
rules; several styles may share one brand's colors, fonts and components. A palette,
a component library, an archived export or a duplicate symlink is not another style.
Count usable, current styles with an actual specification, not incomplete drafts.

1. **Already selected:** honor a style explicitly named by the user or recorded for
   this video. Revisions keep that selection; do not ask again just because the
   workspace now has additional styles. If the path is missing, the name is
   ambiguous or instructions conflict, resolve that with the user instead of
   silently substituting a style.
2. **No usable style:** start this skill's short interview. Resume an existing draft
   if present; do not silently promote it to approved. Shared brand tokens alone
   do not replace interviewing for the missing video behavior.
3. **Exactly one usable style:** select and read it automatically. Mention the
   choice briefly; do not restart its interview or add a confirmation gate.
4. **Multiple usable styles:** present their names and one-line purposes, ask which
   to use and wait for the answer before style-dependent editorial, storyboard or
   composition decisions. Do not guess from the subject, sort order or last use.
   The user may explicitly choose to define a new style instead.

An explicit request for a new kind of video starts a separate style interview even
when another style exists. Reuse shared brand facts; interview for the differences.
Continue independent ingestion/tool preparation while waiting, but do not invent
creative choices. Explicitly delegated choices can be recorded as delegated; silence
is not a choice. Do not re-ask a selection already answered in this session.

Record the selected style's stable ID/name, canonical path and version (or Git
revision when no style version exists) in the video's direction.md or existing
manifest before style-dependent work. Record shared brand references and scoped
per-video overrides separately. Preserve that selection across stages and revisions;
flag a missing or changed specification rather than silently adopting a new version.

## Store styles without duplicating the brand

Use the user's destination or existing workspace convention. Otherwise create a
workspace-owned `video-styles/README.md` index with stable IDs, names, one-line
purposes, status and links to canonical specifications. Each new style can live
under `video-styles/<id>/`. Existing specs can stay where they are; index them
rather than copying them. Register styles after review, preserving draft status
until approved or explicitly delegated for use. Keep archived styles discoverable
but outside automatic selection.

For a brand-new creator, the [folder contract](references/folder-contract.md)
supplies brand and component structure. Multiple styles may reference those shared
resources and own only their video rules, interview, references and specimens.
An independent brand can have its own root. Keep creator assets/answers outside
the public toolkit. If only the toolkit checkout exists, resolve an external or
ignored production destination before writing personal material. Do not create
another Git repository. Keep a single video's deviations with that video unless
the user asks to make them a reusable style.

## Interview in short rounds

Start with what is already known. Ask one to three related questions at a time,
using everyday language and concrete choices when helpful. Wait for answers to
questions that determine the direction; meanwhile inspect supplied references or
organize known facts. Record answers as they arrive so the interview can resume.
Do not deliver a long mandatory questionnaire. Let the user say “you decide” and
mark resulting choices as proposals rather than invented preferences.

Cover the dimensions that materially affect this creator's videos:

- Purpose, audience and desired feeling: what should viewers understand or do?
  Ask for a few vibe words and at least one thing to avoid.
- Formats: platform, landscape/portrait, typical length, spoken/caption language,
  presenter, screen recording, demonstrations or animation; use existing answers.
- Reference preferences: invite website links, images, video links/local files
  and useful timestamps. Ask what they like or dislike about each. References are
  optional; do not block a creator who has none.
- Visual character: existing logo/palette/fonts, type hierarchy, density, shapes,
  texture, imagery and how much visual emphasis should accompany the content.
- Video behavior: pacing, transitions, camera/presenter treatment, captions and
  highlighting, diagram/code treatment, music and sound-effect restraint.
- Constraints: existing identity rules, accessibility/readability, available
  assets/fonts, production effort and recurring elements worth reusing.

Do not ask the creator to invent token names, write configuration or open a
terminal. Offer specific interpretations when their answer is abstract, such as
“calm: longer holds, fewer simultaneous elements, subtle entrances.” Keep that
interpretation visibly separate from the answer until accepted or delegated.

## Read the inspiration

Read [reference handling](references/reference-handling.md) when references are
supplied. Inspect actual available material before making visual claims. Separate
observed traits, the creator's stated preferences and your proposed translation.
A website's layout is evidence about that website, not a ready-made video layout.

Use permitted web/file/media tools. Follow host computer-use permission rules
before any UI automation, including inventory or screenshots. If access is blocked,
record the limitation and continue from accessible evidence and the conversation;
do not imply that an unseen page or unplayed video was inspected.

## Synthesize and make it concrete

Summarize the direction in a few sentences with reasons tied to answers/references.
When important tastes conflict or remain open, offer a small number of meaningfully
different directions. Otherwise develop one coherent direction. Avoid manufacturing
alternatives after the creator already chose.

Populate the folder described in [folder contract](references/folder-contract.md).
Write specific usable values and recipes, not just adjective lists or empty
scaffolds. Keep unanswered decisions in an explicit open-questions section.
Create a visual specimen using the proposed tokens: include representative type,
caption treatment and the recurring graphic most useful for this creator, at the
intended video dimensions. Use synthetic or user-provided sample content. For a
motion-led direction, also make a short deterministic motion sample when the
renderer is available. Record any unrendered/uninspected parts honestly.

Use [component-author](../component-author/SKILL.md) for actual SVG/Flutter
graphics and [compose stage](../edit-video/references/compose.md) for motion specimens.
Prefer existing toolkit primitives with caller-owned styling. Component recipes
are required; implement the small representative set needed for the specimen,
not an invented full widget library. Label each recipe as specification, prototype
or implemented, with a real source path where applicable. Metadata alone does not
register executable widgets in the component browser.

## Review and hand off

Give the creator the concrete folder/specimen and focus feedback on remaining
choices. Drafts can be completed before selection; user approval is needed to
label a direction approved, not to write a proposal. Preserve approval already
expressed in the conversation. Do not infer approval from silence or tool success.

Check token/specimen consistency, local links, font availability/licensing, and
readability/wrapping at target size. Inspect actual output with permitted tools;
structural validation is not visual review. Record what was checked and what
still needs human review. Keep old approved work intact while exploring revisions.

Once chosen, record the version, decision/date and scoped exceptions. Add a short
workspace instruction or local style skill that points to the canonical folder,
using the workspace's discovery convention; do not duplicate the whole spec.
Link the chosen identity/version from the video's direction or manifest using its
existing format. The storyboard stage and the compose stage consume this direction;
style exploration does not approve a script, cut, soundtrack license or final video.
