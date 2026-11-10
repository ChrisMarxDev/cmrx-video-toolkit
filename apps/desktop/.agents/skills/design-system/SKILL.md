---
name: design-system
description: Build, document, or evolve a product design system that agents can follow, from primitives and semantic tokens to components, blocks, and product rules. Use when establishing reusable UI decisions or reviewing a screen against that system; not for isolated styling edits with no system work.
---

# Design System

Make the product's design decisions explicit, traceable to implementation, and
usable by an agent without inventing missing conventions. Work in the product's
existing stack and documentation structure. A system should describe the product,
not impose a generic visual style or a particular component library.

## Establish the evidence

Inspect existing token files, theme configuration, components, representative
screens, design documentation, and project instructions before writing. Identify
the source of truth for each layer and its consumers. Preserve established names
and public APIs unless migration is part of the request.

Separate implemented behavior, approved design intent, proposals, and unresolved
decisions. Code shows what exists; it does not prove that every inconsistency is
intentional. Ask about consequential conflicts or missing brand decisions while
continuing independent inventory work. Keep unresolved choices out of production
defaults; if a prototype needs an assumption, label it provisional.

For a new product, use its brief and supplied designs to propose foundations, then
exercise them on representative screens before declaring reusable components or
blocks. Do not invent a complete catalog in advance.

## Build the five layers

### 1. Primitives

Locate or establish the shared values for color, typography (including line height
and weight), spacing, radius, shadow, and motion. Use the existing token format and
build pipeline. Give consumers a canonical source rather than duplicating values
across products or platforms.

Document that new values require a deliberate system decision. Avoid silently
rounding intentional optical adjustments into a scale. Record justified exceptions
and their scope so they do not become accidental global conventions.

### 2. Semantic foundations

Map meaning to primitives: surfaces, text, borders, actions, focus, statuses,
layout, elevation, and motion as relevant to this product. Components should
normally consume semantic or component tokens instead of selecting raw palette
values. Retain established architectural exceptions with an explanation.

Distinguish status meaning from decoration; use the product's approved color
language consistently and accompany status color with text or another cue. Theme
and interaction mappings need suitable contrast in their actual usage: a palette
color alone is not evidence of accessible text or focus visibility. Include
reduced-motion behavior where motion exists. Do not infer a dark theme merely
because a light theme is defined.

### 3. Components

Inventory actual exports and variants in the installed library and local source.
A library's upstream catalog is not a list of available product components.
Document only implemented variants as usable; keep planned work clearly separate.

For each relevant component, record its implementation/import path, purpose,
alternative to use when inappropriate, default variant, supported API, and
applicable interaction states. Use one good and one bad example grounded in the
product's real code, explaining the difference. If examples are hypothetical,
label them as such rather than inventing source paths.

Cover hover, pressed, focus, loading, disabled, and error where applicable; use
empty states for components that render collections or content. Mark inapplicable
states explicitly rather than manufacturing meaningless variants. Include keyboard
behavior and accessible names for interactive components.

### 4. Blocks

Identify repeated compositions in real screens: for example, a task row or approval
panel. Extract a block when repetition or domain behavior justifies it, not simply
because a section can be given a name. Record its component composition, data
contract, responsive behavior, and applicable loading, empty, error, and success
states. A screen map should name its blocks and the source of their data.

When a screen needs a new pattern, assess whether to extend an existing block,
compose existing components, or introduce a new block. Surface a consequential
product decision rather than treating the current catalog as a ban on new work.

### 5. Rules and task skills

Turn recurring, evidenced mistakes into short rules followed by their reason.
Scope rules to the product or flow they govern. The article's examples (one primary
button per screen, a badge on each run card) are candidate product decisions,
not universal requirements.

Keep persistent rules concise in the project's established instruction file, with
a link to detailed design documentation. Add or change persistent instructions
only within the requested system work; avoid replacing unrelated instructions.
Put a job-specific procedure, such as reviewing screens, in an appropriately
scoped skill when useful. Follow the target agent's skill conventions; do not
assume Claude-specific paths or a particular runtime. Use the review procedure
below directly if a separate skill would only duplicate it.

## Review a screen against the system

Trace each finding to a file, rendered state, or approved rule. Separate verified
defects from suggestions and states you could not inspect.

- Check raw style values against canonical tokens; distinguish missing tokens
  from approved exceptions and structural values such as zero or percentages.
- Check imports, props, and variants against implemented components and blocks.
- Exercise applicable loading, empty, error, disabled, focus, and success states,
  including narrow layouts and keyboard use for affected interactions.
- Check status labels and available actions against the underlying state. For
  example, an approved request must not continue to ask for approval; test the
  transition, not just static screenshots. Include pending or failed mutations
  when the flow has them.
- Verify theme contrast and motion behavior where relevant. Report any visual or
  interaction checks that were not performed. Follow the environment's UI access
  permission rules; this skill does not grant browser or computer-use permission.

Use existing checks and representative screens to validate token resolution,
component APIs, and changed behavior. Add targeted tests for meaningful regressions,
not tests that merely assert the wording of documentation. Do not claim visual
verification from source inspection alone.

## Deliverables

Produce the smallest useful change for the requested scope: an inventory, token
implementation, component/block documentation, rules, a review, or a combination.
Read [documentation-patterns.md](references/documentation-patterns.md) when creating
system documentation; adapt its records to the project's existing format.
Report canonical paths, implemented changes, unresolved decisions, and validation
limits. Avoid presenting proposed behavior as shipped.

## Source

Adapted from “Build the design system and skills your agent can follow” by
[@_heyrico](https://x.com/_heyrico/status/2116953958279479760), using the article
text supplied by Christopher. See [provenance.md](references/provenance.md) for
attribution and adaptation boundaries.
