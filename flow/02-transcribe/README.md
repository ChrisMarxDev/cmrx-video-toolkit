# Transcribe

Prepare a local recording with the shared single-video review tool:

```sh
python3 apps/editor/review.py /path/video.mp4 --workspace /path/review --model /path/ggml-base.bin
```

Run from toolkit root. On Windows use `py -3`. FFmpeg/ffprobe and whisper.cpp are
external tools. Set `WHISPER_CLI` for a non-PATH executable. Import existing raw
whisper.cpp JSON with `--transcript /path/whisper.json` instead of recognizing again.

The command extracts full-rate narration and 16 kHz mono transcription audio,
prepares a browser preview, preserves raw output, and writes **review.json** plus
`transcript/segments.json`. The app (`python3 apps/editor/server.py`) opens that
same review file for source-timed decisions and visual requests. Read
`apps/editor/FORMAT.md`; both entry points use the same implementation and schema.

Whisper timestamps have segment precision, not word alignment. Never estimate
word timestamps from transcript length. Review transcript corrections with the
user; spelling corrections do not change narration. The editor exports version-2
source-range edit decisions understood by `scripts/video.py import-edit` and
resolves human requests through the resulting source/output map.
