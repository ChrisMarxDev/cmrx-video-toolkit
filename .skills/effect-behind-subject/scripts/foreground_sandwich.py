#!/usr/bin/env python3
"""Inspect whether a base video and alpha cutout can form an editable foreground sandwich."""
import argparse
import json
from pathlib import Path
import subprocess
import sys


def probe(path, run=subprocess.run):
    if not path.is_file():
        raise ValueError(f"Video does not exist: {path}")
    completed = run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def video_stream(info):
    stream = next((item for item in info.get("streams", []) if item.get("codec_type") == "video"), None)
    if stream is None:
        raise ValueError("Video has no video stream")
    return stream


def number(value, label):
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Missing or invalid {label}") from exc


def has_alpha(stream):
    pixel_format = str(stream.get("pix_fmt", "")).lower()
    if "a" in pixel_format and pixel_format.startswith(("yuva", "rgba", "bgra", "argb", "abgr", "gbrap")):
        return True
    tags = stream.get("tags", {})
    return str(tags.get("alpha_mode", "")).lower() in {"1", "true", "straight", "premultiplied"}


def inspect_pair(base_path, cutout_path, tolerance=0.1, run=subprocess.run):
    if tolerance < 0:
        raise ValueError("Duration tolerance must be nonnegative")
    for path in (base_path, cutout_path):
        if not path.is_file():
            raise ValueError(f"Video does not exist: {path}")
    base = video_stream(probe(base_path, run))
    cutout = video_stream(probe(cutout_path, run))
    base_duration = number(base.get("duration"), "base duration")
    cutout_duration = number(cutout.get("duration"), "cutout duration")
    duration_delta = abs(base_duration - cutout_duration)
    errors = []
    warnings = []
    if not has_alpha(cutout):
        errors.append("Cutout video has no detectable alpha-capable pixel format")
    if duration_delta > tolerance:
        errors.append(
            f"Durations differ by {duration_delta:.3f}s (allowed {tolerance:.3f}s); use a cutout from this exact edited range"
        )
    if (base.get("width"), base.get("height")) != (cutout.get("width"), cutout.get("height")):
        warnings.append("Dimensions differ; fit both clips to the same scene canvas and verify alignment")
    if base.get("r_frame_rate") != cutout.get("r_frame_rate"):
        warnings.append("Frame rates differ; preview a moving edge to verify frame-accurate alignment")
    return {
        "ready": not errors,
        "base": {
            "path": str(base_path.resolve()),
            "duration_seconds": base_duration,
            "dimensions": [base.get("width"), base.get("height")],
            "frame_rate": base.get("r_frame_rate"),
        },
        "cutout": {
            "path": str(cutout_path.resolve()),
            "duration_seconds": cutout_duration,
            "dimensions": [cutout.get("width"), cutout.get("height")],
            "frame_rate": cutout.get("r_frame_rate"),
            "pixel_format": cutout.get("pix_fmt"),
            "has_alpha": has_alpha(cutout),
        },
        "duration_delta_seconds": duration_delta,
        "warnings": warnings,
        "errors": errors,
        "layer_order": ["base clip", "content", "alpha cutout"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    inspect = subcommands.add_parser("inspect", help="Check a base clip and foreground cutout before composing")
    inspect.add_argument("--base", type=Path, required=True)
    inspect.add_argument("--cutout", type=Path, required=True)
    inspect.add_argument("--duration-tolerance", type=float, default=0.1)
    args = parser.parse_args()
    try:
        result = inspect_pair(args.base, args.cutout, args.duration_tolerance)
        print(json.dumps(result, indent=2))
        return 0 if result["ready"] else 1
    except (ValueError, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
