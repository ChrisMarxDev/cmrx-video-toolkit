# CMRX Video Toolkit (public)

Read README.md and .skills/edit-video/SKILL.md for video workflow work. For component
changes read .skills/component-author/SKILL.md. All examples must be synthetic;
keep client identity, recordings, transcripts, credentials and private knowledge
out of this repository. Keep third-party licenses and source provenance.

In a Studio submodule checkout, query the parent Studio knowledge layer for relevant
repository/workflow decisions, following its use-kw skill. Do not copy that private
knowledge here. Standalone contributors use public README/docs/skills.

Run make test for cross-cutting changes; use affected package analysis/tests for
focused work. Use deterministic frames, immutable props and explicit timeline
mapping. No library default may imply a user's content/brand approval.

General repository-maintenance skills stay outside this public creator catalog.
App-owned maintenance skills live in `apps/desktop/.agents/skills/`: use
`desktop-app/SKILL.md` for ongoing app development and `desktop-deploy/SKILL.md`
for desktop build, signing, notarization and release work. These ship with the
app and are separate from `.skills/`, which is exposed to video-editing agents. In a Studio checkout, follow its git-sync and maintenance
instructions; publish this repo before Studio records its commit. Standalone
contributors follow docs/DEVELOPMENT.md and their own repository workflow.
Ask the user before UI automation when required by the host workspace.

Reusable Flutter primitives live in components/, not a design system. Require
caller-owned appearance; brand tokens, fonts and design direction belong in the
consuming workspace. Keep browser demonstration styling application-local.


## Toolkit-first product imperative

The desktop app is a UI and development environment for this toolkit. Keep Flutter
and arbitrary agent-authored code first-class. Never reduce toolkit capabilities to
fit the editor: unsupported interactive features may use a verified rendered-only
review path. Components are coded dynamically; property controls derive from their
authored schemas, not a hardcoded video-element catalog. Source transcripts, sound
maps and sampled frames are complementary evidence, not a transcript-first product.
See apps/desktop/TOOLKIT_ENVIRONMENT_PLAN.md for the implementation/acceptance plan.
