# Video Ingest

Use scripts/video.py --help and flow/01-ingest/README.md. Record original media
path, dimensions, fps and duration; preserve it. CMRX_WORKSPACE sets the private
workspace root for init. No narration, claims or product facts may be invented.

After tooling preflight, open Select Video with `open_review()` when no path was
provided, using the video-review lifecycle. Explicitly supplied paths open directly.
Do not stop to demand a path in chat; use the browser picker fallback if MCP tools
are unavailable. Selection precedes media-dependent ingest commands.

## Optional synchronized recordings

If face and screen are separate originals, keep the narration-bearing video as
the primary. Register companions with `video.py link-source` using a measured
fixed offset. See [linked recordings](../../../docs/contracts.md#optional-linked-recordings-face--screen)
for the offset sign and commands. Do not guess synchronization or promise drift
correction. Prepare only the requested linked workflow; one recording stays the default.
