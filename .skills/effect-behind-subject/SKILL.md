---
name: effect-behind-subject
description: Place text, images or Flutter content behind a person cutout while retaining the original footage as an editable foreground sandwich.
---

# Place content behind a subject

Use this effect when text, an image, or a Flutter widget should appear to sit
behind a visible person. It is an editable composition pattern, not a flattened
video export:

```text
original clip → content → alpha cutout of that same clip
```

The bottom clip supplies the room/background and the one narration stream. The
top clip supplies only the transparent foreground. Content in the middle can
overlap the subject a little, so the subject occludes it naturally.

## Prepare matching footage

Start with the selected, already edited source range. Do not make a cutout from
the uncut recording and try to retime it later. If the cutout does not already
exist, use [effect-background-remove](../effect-background-remove/SKILL.md) on
that edited range. It currently isolates people, not arbitrary objects, and
creates an alpha-capable ProRes MOV.

Before authoring the scene, inspect the plate and cutout together:

```sh
python3 .skills/effect-behind-subject/scripts/foreground_sandwich.py inspect \
  --base /absolute/path/edited-clip.mp4 \
  --cutout /absolute/path/foreground.mov
```

Or run `make foreground-sandwich-inspect BASE=/absolute/path/edited-clip.mp4
CUTOUT=/absolute/path/foreground.mov` from the toolkit root. The helper checks
that the cutout has an alpha-capable video stream and that its duration matches
the base clip. It warns about differing dimensions or frame rates because those
are common cutout settings; scale both layers to one composition canvas and
visually confirm motion alignment. It does not inspect mask quality or prove
that the two files came from the same take.

Keep the alpha MOV and the cutout provenance sidecar. An MP4 composite is useful
for delivery but loses the editability and alpha needed for later revisions.

## Compose the sandwich

Read [fluvie-compose](../fluvie-compose/SKILL.md) for the installed API and add
the layers to the same scene in this exact paint order:

1. Mount the original clip as the bottom layer and keep its audio as the scene's
   narration.
2. Add the text, image, component, or another video widget above it. Position it
   where the subject should cover it.
3. Mount the alpha MOV above that content using the same scene-local start,
   duration, crop and transform as the bottom clip. Disable or omit its copied
   audio using the installed Clip audio API.

For a basic Flutter layout, the visual order is a `Stack` whose children are
the base `Clip.asset`, the content widget, and the alpha `Clip.asset`. A cutout
may have a smaller render resolution than the base clip; use the same fitting
and alignment rule for both clips rather than assuming their intrinsic pixels
match. For linked face/screen recordings, use the prepared primary clip for the
base and create the cutout from that same primary prepared asset.

Do not bake the three layers into an intermediate video while iterating. Keep
the authored scene and the cutout asset separate, preview the composition, then
export only after the usual review. Preserve one narration stream: the cutout's
copied source audio must never play alongside the base clip.

## Verify the illusion

Preview a short span where the subject crosses the content. Check that the
subject's silhouette stays above the middle layer, the two video layers begin
on the same frame, their motion does not drift, and hair/hands do not reveal a
visibly unstable matte. If the cutout is poor, adjust or replace the cutout;
do not hide a timing or mask problem by changing the approved edit.

Then follow [fluvie-validate](../fluvie-validate/SKILL.md) and the normal
[compose stage](../edit-video/references/compose.md) preview/review flow. This
effect changes only scene layering, not source ranges, edit decisions or style.
