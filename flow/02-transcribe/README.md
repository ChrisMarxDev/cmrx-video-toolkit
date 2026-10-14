# Transcribe

The planned local backend is whisper.cpp. Its installation and output adapter
are not yet implemented. The old desktop transcription integration was removed.

Use actual source-aligned word timings and convert them to the edit JSON contract
in `docs/contracts.md`. Review the transcript with the user before deleting words.
Human correction of names changes text, not audio. Never infer word timestamps
from transcript length.
