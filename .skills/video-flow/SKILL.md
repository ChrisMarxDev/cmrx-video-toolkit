---
name: video-flow
description: Orchestrate a local video workflow with source integrity, reviewed edits and deterministic renders.
---

# Video Flow

Read README.md and docs/contracts.md. Work in an external or ignored projects/<slug>
workspace. Load that workspace's art direction; this toolkit imposes no client brand.
Use ingest → transcribe → edit → storyboard → compose → review → render. Reuse valid
artifacts when revising. Keep original recordings immutable and one narration audio
stream. Review the rough cut before detailed animation unless already approved.
Resolve source cues through scripts/video.py import-edit; never guess timestamps.
Drafts can be rendered for review. Final approval is a human decision, not a CLI flag.
Read the matching stage skill below before using a command. Keep media outside Git.
