# Visual map (isolated experiment)

A local, model-free visual equivalent of an audio level map. It measures pixel
changes to help a human or downstream agent select original passages for closer
inspection. It does not identify faces, gaze, gestures, notes-reading or bad takes.
Nothing invokes it automatically; it does not change review files or apply edits.

Requires Python 3.9+ and FFmpeg/ffprobe on PATH (including `-fps_mode` support).
No Python packages, downloaded models, APIs or browser are needed.

From the toolkit root:

```sh
python3 tools/visual_map/visual_map.py /absolute/recording.mp4 \
  --output /absolute/workspace/visual-map-run-01
```

The output directory must not exist. Originals are read-only. Keep recordings and
analysis artifacts outside source control. Outputs:

- `visual-map.json`: source SHA-256, selected stream, tool versions/code checksum,
  settings, timing semantics, every sample's measurements and candidate windows.
- `timeline.svg`: previous/lag/reference mean differences over source time, with
  candidate review windows shaded. Open manually in any SVG viewer if desired.

## Measurements

Defaults: 4 samples/second, 320×180 grayscale, one-pixel box blur, 16×9 grid,
changed-pixel threshold 12 on the 0–255 intensity scale. FFmpeg applies display
rotation and scales to the requested dimensions (which may distort aspect ratio;
choose dimensions matching the recording for spatial inspection). Image coordinates
refer to this displayed, resized image, not original encoded pixels.

Each sample contains brightness plus three comparisons:

- `previous`: absolute difference from the preceding sample; null on the first.
- `lag`: difference from approximately two seconds earlier; null until history exists.
- `reference`: difference from a fixed sample, initially the first sample. This
  stays elevated when a changed image becomes still. It is not an adaptive baseline.

Each comparison includes `mean`, `changed_fraction`, `grid_mean` and
`grid_changed_fraction`. Grids are flat row-major arrays with `rows × cols` cells.
Cells are assigned using `floor(x * cols / width)` and `floor(y * rows / height)`;
uneven cells are averaged by their actual pixel counts. A changed pixel has absolute
difference **greater than** `--pixel-threshold`. Means use intensity units 0–255;
fractions use 0–1. Null means unavailable, never zero movement.

Optionally select a presenter rectangle once, without a detector:

```sh
python3 tools/visual_map/visual_map.py /absolute/recording.mp4 \
  --output /absolute/workspace/visual-map-run-02 \
  --region 100 10 220 150 --reference-seconds 3 --lag-seconds 2
```

`--region X0 Y0 X1 Y1` uses half-open resized-image pixels. Adds `region_mean` and
`outside_region_mean` (null if no outside pixels). Candidate rules and the SVG then
use region means; the full-frame/grid evidence remains available.
`--reference-seconds` is an offset from the first **sampled video image**, rounded
to the nearest sample index (Python round). Earlier reference comparisons remain
null. The actual reference source time is recorded. An out-of-range reference fails.
Lag is rounded to an integer number of samples, at least one; effective lag is saved.

## Candidate rules

A sample is flagged when any available previous/lag/reference mean is at least
`--event-threshold` (default 8). The candidate includes the preceding sampling
interval because motion may have occurred between samples. Nearby flagged intervals
are combined across `--merge-gap` (default 0.5 seconds), then runs shorter than
`--min-event` (default 0.5) are excluded. Reference differences keep held changes
in the same candidate. Add `--padding` (default 2 seconds) on each side, clamped
to analyzed coverage; overlapping review windows are merged while preserving their
constituent evidence intervals and triggering signal names.

These are review candidates, not cut recommendations. A poor reference or a permanent
scene change can flag the rest of the recording; adjust the reference/region or inspect
that long window. Durations are approximate at the sampling resolution.

## Timing and reproducibility

Uses the first non-attached-picture video stream. FFmpeg `-copyts -start_at_zero`
retains video delay relative to the container origin. `fps` resamples on a regular
grid; `showinfo` supplies its actual timestamps, rather than assuming the first
video image starts at zero. Timestamps are **source-relative resampled grid times**,
not original frame PTS or exact word/cut boundaries. Sampling can duplicate/drop
images and miss brief motion. The tool needs finite container duration metadata.
Analyzed coverage, media start time, nominal step and reference time are explicit.

The decoder is streamed, retaining only the lag history and reference pixels.
Measurements and timestamp diagnostics are accumulated in memory; JSON size grows
with recording length, sampling rate and grid size. There is no persistent frame
cache. Pixel processing is Python CPU work; benchmark before increasing resolution.
Same input/settings/software produce repeatable measurements in synthetic tests;
bit-identical results across FFmpeg builds/platforms are not promised.

For subsequent AI review, use a candidate's `review_start` / `review_end` to retrieve
original footage plus nearby transcript/audio context. The grid arrays can be drawn
as heatmaps, but this initial tool does not generate frame strips, full-resolution
pixel maps or clips, and does not call an AI. Motion can be caused by lighting,
camera/background changes or compression. Small eye movements may be missed.

## Verification

```sh
python3 -m unittest discover -s tools/visual_map -v
```

Synthetic tests cover spatial/region measurements, invalid settings, held changes,
lag and reference behavior, delayed video timestamps, repeatability, artifacts and
refusal to overwrite outputs. Real-recording/editorial effectiveness is unvalidated.
