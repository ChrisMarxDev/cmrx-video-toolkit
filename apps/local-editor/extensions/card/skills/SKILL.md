---
name: signal-card
description: Add or adjust the local editor's deterministic two-rectangle signal graphic.
---

Use `npm run agent -- context` first. Add a card with
`npm run agent -- tool add-card REV`. Adjust `props.strength` (0–1) or
`props.color` (#RRGGBB) using the clip patch command with an expected revision.
The browser inspector and worker share the same project properties. Unknown
properties survive edits. Change worker.mjs/panel.mjs then restart the service;
existing projects are not rewritten when extensions load. Render after changing
worker code. This example is not a Flutter renderer.
