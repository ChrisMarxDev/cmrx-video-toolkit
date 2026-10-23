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

Repository-maintenance skills belong to the outer Studio workspace, not this
public skill catalog. In a Studio checkout, follow its git-sync and maintenance
instructions; publish this repo before Studio records its commit. Standalone
contributors follow docs/DEVELOPMENT.md and their own repository workflow.
Ask the user before UI automation when required by the host workspace.

Reusable Flutter primitives live in components/, not a design system. Require
caller-owned appearance; brand tokens, fonts and design direction belong in the
consuming workspace. Keep browser demonstration styling application-local.
