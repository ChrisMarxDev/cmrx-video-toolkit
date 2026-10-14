# Video tools

Reusable local media operations, independent of art direction. The flow owns edits
and timing; skills choose framing and style; these tools produce new media assets.
No original or existing output is overwritten. Run from the toolkit root.

## Reframe and gradient

```bash
python3 -m video_tools reframe input.mp4 framed.mp4 \
  --canvas 540:960 --box 468:468:36:204 --crop 1080:1080:270:0
```

Canvas is width:height. Box and optional crop are width:height:x:y; crop coordinates
refer to the input file's actual pixels. The source is fitted inside the box without
stretching. The canvas has a deterministic navy/teal gradient with a subtle violet
highlight and a thin border around the box. This supports opaque footage or alpha
foregrounds. Use `--border-width 0` to remove the outline; omit `--crop` to
preserve the whole input frame. For the current borderless explainer style:

```bash
python3 -m video_tools reframe foreground.mov portrait.mp4 \
  --box 504:336:18:326 --border-width 0
```

Only Python and FFmpeg/FFprobe are required.

## Person cutout

```bash
bash video_tools/setup.sh
.tools/video-tools-venv/bin/python -m video_tools cutout edited.mp4 foreground.mov
# Check a short test first:
.tools/video-tools-venv/bin/python -m video_tools cutout edited.mp4 test.mov --seconds 3
```

The optional isolated environment uses ONNX Runtime, not PyTorch. It downloads the
14 MB RVM MobileNetV3 FP32 model, with a pinned SHA-256. Frames are processed in
sequence with recurrent state; memory is bounded. Output is ProRes 4444 MOV with
alpha and the source audio stream copied when container-compatible. It can be
large. The cutout preserves the person in color; “silhouette” here means removing
the room, not turning the person into a black shape. Use the alpha asset in a new
composition or pass it through `reframe` to place it on the gradient.

Default processing width is 810 px, 30 fps; use `--width`, `--fps`, and
`--downsample` when needed. These are render choices, not changes to the edit map.
Work on the edited footage and retain its timeline revision in the project.
Audio is copied once; a presenter inset must be muted. Test hair, hands, fast motion,
and consecutive frames: this is estimated matting, not a guaranteed perfect mask.
No cloud upload or automatic clip/timeline mutation occurs.

Each output has a JSON sidecar with settings and input path/stat information;
cutouts include model checksum and provenance. Temporary intermediates are local.
An MP4 composite is opaque; retain the alpha MOV to change backgrounds later.

## Provenance

Model: [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting),
[ONNX instructions](https://github.com/PeterL1n/RobustVideoMatting/blob/master/documentation/inference.md),
release v1.0.0, `rvm_mobilenetv3_fp32.onnx`. Upstream lists GPL-3.0; model and runtime
remain isolated under ignored `.tools/`. The local adapter is authored here rather
than copying upstream implementation. Review upstream licensing before bundling
third-party artifacts in another product. No models are committed to this repository.
