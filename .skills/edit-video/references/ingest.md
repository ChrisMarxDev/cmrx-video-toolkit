# Video Ingest

Use scripts/video.py --help and flow/01-ingest/README.md. Record original media
path, dimensions, fps and duration; preserve it. CMRX_WORKSPACE sets the private
workspace root for init. No narration, claims or product facts may be invented.

After tooling preflight, open Select Video with `open_review()` when no path was
provided, using the video-review lifecycle. Explicitly supplied paths open directly.
Do not stop to demand a path in chat; use the browser picker fallback if MCP tools
are unavailable. Selection precedes media-dependent ingest commands.
