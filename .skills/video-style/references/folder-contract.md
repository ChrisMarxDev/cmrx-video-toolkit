# Creator design folder

Use the existing workspace layout when present. This is the default layout for a
new creator; paths below are beneath that creator's workspace, never the toolkit.
Create the substantive documents during the interview/synthesis. Add asset and
implementation directories only when they contain actual files.

```text
brand/
  README.md                 # Canonical identity and index
  interview.md              # Answers, delegated choices, unresolved questions
  references.md             # Evidence, preferences, translations, provenance
  tokens.json               # Canonical machine-readable visual values
  VIDEO.md                  # Video/editorial/motion rules
  IMPLEMENTATION.md         # How the actual components consume tokens
  specimens/                # Editable source plus generated review output
  assets/                   # Owned/licensed logos, imagery, fonts when used
  archive/                  # Superseded directions when needed
video-styles/
  README.md                 # Style index; distinguishes bases from selectable styles
  base/                     # Optional shared style foundation
    components/             # Shared designed components, assets and catalog
  <style-id>/
    style.md                # Video rules and optional extends reference
    components/             # Components specific to this style
    references.md           # Style-specific evidence
    interview.md            # Style-specific answers
```

## README.md and interview.md

The canonical specification states the identity name/version, status (`draft` or
`approved`), purpose/audience, supported formats and a few defining principles.
Translate each vibe word into observable behavior and give concrete do/don't
examples. Include palette roles, typography hierarchy, layout/imagery rules and
links to the supporting files. Document the approval source/date only when known;
separate proposed defaults from accepted requirements. Keep identity-wide rules
separate from a particular video's content and exceptions.

The interview is a concise durable record of answers, not a fabricated transcript.
Record what the user supplied, what the agent inferred, what the user delegated,
and what is still unknown. On resume, ask only unresolved or changed questions.
If there were no external references, say so in references.md rather than inventing
inspiration or treating sample assets as user preferences.

## tokens.json

Use the existing schema if one exists. Otherwise author a small self-describing
JSON object with `name`, `version`, `status`, and these token groups:

- `colors`: raw palette plus semantic background, surface, text, muted, accent,
  on-accent and outline roles. Include theme variants only if needed.
- `typography`: family, fallback, available weights, sizes and line heights for
  title, body, captions and technical text if relevant.
- `layout`: reference canvas dimensions, safe areas, spacing, stroke widths and
  shape radii. State units and scaling behavior across target formats.
- `motion`: duration units, entrance/exit durations and easing, stagger and hold
  conventions. Keep project timestamps out of identity tokens.

Use concrete values for proposed defaults; put unresolved questions in the prose,
not invalid JSON or placeholder strings masquerading as colors/font names. Name
semantic roles consistently in recipes and specimen code. Keep tokens canonical;
if an adapter is needed, derive it reproducibly instead of hand-maintaining a
second divergent palette. This file is a design artifact, not a runtime schema
that the toolkit automatically imports.

## VIDEO.md

Specify presenter/screen/graphic layout, framing and crop policy, target aspect
ratios and safe areas, caption typography/position/line limits/emphasis, pacing,
transitions, diagram/code density, texture usage and music/sound intentions.
Choose rules from the interview: presenter visibility, animated word highlighting,
background texture and music are not universal defaults.

Describe how motion serves comprehension, how readable elements remain stable,
and which effects to avoid. Record sound preferences separately from permission
to use particular recordings. Captions stay faithful to speech; style does not
change approved words or cuts. Use frame-derived animation when implemented.

## Style components/CATALOG.md and IMPLEMENTATION.md

For each selected recurring component (for example caption, title, callout, lower
third or diagram), include purpose, when to use/avoid it, anatomy, token roles,
content limits, layout at supported aspect ratios, and entrance/hold/exit behavior.
List editable props and representative sample content. Mark its implementation
status and actual source path; a recipe is not a working widget.

Inspect the toolkit catalog before claiming a reusable primitive exists. Keep
branded wrappers/fonts in this workspace. IMPLEMENTATION.md maps the canonical
tokens into the actual VideoStyle/design package and lists real build/render
commands and dependencies, or explicitly states that only specifications exist.
Set CMRX_COMPONENT_PACKAGE/NAME/TOKEN_CLASS only for a working compatible package;
writing tokens.json or catalog prose does not make those integrations work.

## specimens and delivery

Provide editable specimen source plus a viewable output demonstrating the proposed
system with realistic text lengths. Use requested dimensions; where both portrait
and landscape are in scope, check both instead of shrinking one blindly. Include
an actual caption and a representative recurring graphic. A visual reference may
be HTML, SVG or a rendered frame; a motion direction also benefits from a short
video specimen. Keep generated media in ignored production storage according to
workspace policy, linking it from the specification when outside this folder.

Record checks and review status in README.md, with exact specimen paths and known
limits (for example motion not rendered or portrait not reviewed). Do not claim a
visual or motion check from compilation alone. Completion means usable artifacts,
not empty directories. Preserve draft work if the creator has not selected it yet.

## Multiple video styles sharing a brand

Use `video-styles/README.md` (or the workspace's existing index) to list stable ID,
name, purpose, status and canonical specification path. A new style folder can
contain README.md, VIDEO.md, interview.md, references.md and specimens as needed.
Style-specific component implementations belong in that style’s `components/`.
Shared designed components belong in an explicitly declared base style’s
`components/`; keep generic toolkit primitives external. Mark bases as non-selectable
and record inherited paths/versions. Reference shared brand tokens by path instead
of copying them. Store
style-specific overrides locally; do not change the shared brand to fit one series.
Existing single-style folders remain valid and can simply be indexed.

A video's direction/manifest records the selected style ID, canonical path and
version or Git revision, plus per-video exceptions. This is an agent handoff
contract, not a runtime loader. Archived/draft entries are not automatic defaults.
