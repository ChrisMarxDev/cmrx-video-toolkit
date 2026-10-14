---
name: video-transcribe
description: Prepare local transcripts with explicit timing precision.
---

# Video Transcribe

Use flow/02-transcribe/README.md and schemas/. Local Whisper/Whisper.cpp is an
external prerequisite. Preserve raw output. Segment timestamps are not word
alignment. Review corrections with the user before edit decisions. The editor's
flut-script-segments-v1 export has its own precision; never cast segments to words.
