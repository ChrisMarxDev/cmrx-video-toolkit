#!/usr/bin/env python3
"""Inspect a GLB, scaffold an isolated Flutter Scene capture, or encode its frames."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

BUNDLE = Path(__file__).resolve().parents[1]


def inspect_glb(path):
    with open(path, "rb") as f:
        header = f.read(20)
        if len(header) != 20:
            raise ValueError("Truncated GLB header")
        magic, version, length, size, kind = struct.unpack("<4sIIII", header)
        if magic != b"glTF" or version != 2 or length != path.stat().st_size:
            raise ValueError("Expected a complete GLB version 2 file")
        if kind != 0x4E4F534A or size % 4 or size > min(length - 20, 32 * 1024 * 1024):
            raise ValueError("Invalid or oversized GLB JSON chunk")
        doc = json.loads(f.read(size))
        while f.tell() < length:
            chunk_header = f.read(8)
            if len(chunk_header) != 8:
                raise ValueError("Truncated GLB chunk")
            chunk_size, _ = struct.unpack("<II", chunk_header)
            if chunk_size % 4 or chunk_size > length - f.tell():
                raise ValueError("Invalid GLB chunk length")
            f.seek(chunk_size, 1)
    if doc.get("asset", {}).get("version") != "2.0":
        raise ValueError("Expected glTF 2.0 asset metadata")
    external = [item["uri"] for group in ("buffers", "images")
                for item in doc.get(group, [])
                if "uri" in item and not item["uri"].startswith("data:")]
    if external:
        raise ValueError("GLB has external buffers/textures; embed them before capture")
    with open(path, "rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    return {"sha256": digest, "bytes": length,
            "meshes": len(doc.get("meshes", [])),
            "skins": len(doc.get("skins", [])),
            "animations": [{"index": i, "name": a.get("name"),
                            "channels": len(a.get("channels", []))}
                           for i, a in enumerate(doc.get("animations", []))],
            "extensions_required": doc.get("extensionsRequired", []),
            "note": "Container inventory only; not a deformation or renderer compatibility check"}


def scaffold(model, output, platform):
    info = inspect_glb(model)
    if info["meshes"] == 0:
        raise ValueError("Model has no mesh; export the character, not armature-only motion")
    # Never create a nested repo or write assets into the software checkout.
    if subprocess.run(["git", "-C", str(output.parent), "rev-parse", "--show-toplevel"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        raise ValueError("Choose a new capture directory outside Git working trees")
    output.mkdir(exist_ok=False)
    subprocess.run(["flutter", "create", "--no-pub", "--platforms", platform,
                    "--project-name", "meshy_capture", str(output)], check=True)
    (output / "test/widget_test.dart").unlink(missing_ok=True)
    (output / "assets").mkdir(exist_ok=True)
    shutil.copyfile(model, output / "assets/model.glb")
    shutil.copyfile(BUNDLE / "assets/main.dart", output / "lib/main.dart")
    shutil.copyfile(BUNDLE / "assets/pubspec.yaml", output / "pubspec.yaml")
    (output / "model-manifest.json").write_text(json.dumps(info, indent=2) + "\n")
    if platform == "macos":
        import plistlib
        plist = output / "macos/Runner/Info.plist"
        data = plistlib.loads(plist.read_bytes())
        data["FLTEnableFlutterGPU"] = True
        plist.write_bytes(plistlib.dumps(data))
    else:
        runner = output / "linux/runner/my_application.cc"
        text = runner.read_text()
        anchor = "g_autoptr(FlDartProject) project = fl_dart_project_new();"
        if text.count(anchor) != 1:
            raise ValueError("Runner template changed; enable Flutter GPU in the disposable runner manually")
        runner.write_text(text.replace(anchor, anchor +
                          "\n  fl_dart_project_set_enable_flutter_gpu(project, TRUE);"))
    print(json.dumps({"project": str(output), "model": info}, indent=2))


def encode(frames, output):
    info = json.loads((frames / "complete.json").read_text())
    count, fps = info["frames"], info["fps"]
    if not isinstance(count, int) or count < 1 or not isinstance(fps, int) or fps < 1:
        raise ValueError("Invalid completed capture metadata")
    expected = {f"frame-{i:06}.png" for i in range(count)}
    if {p.name for p in frames.glob("frame-*.png")} != expected:
        raise ValueError("Frame sequence does not match complete.json")
    if output.exists():
        raise FileExistsError(output)
    if output.suffix.lower() != ".mov":
        raise ValueError("Use .mov for the alpha-capable ProRes output")
    # ProRes 4444 retains alpha; downstream composition can make an ordinary MP4.
    with tempfile.TemporaryDirectory(prefix=".meshy-encode-", dir=output.parent) as temp:
        partial = Path(temp) / "capture.mov"
        subprocess.run(["ffmpeg", "-v", "error", "-n", "-framerate", str(fps),
                        "-i", str(frames / "frame-%06d.png"), "-frames:v", str(count),
                        "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le",
                        str(partial)], check=True)
        os.link(partial, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    inspect = sub.add_parser("inspect")
    inspect.add_argument("model", type=Path)
    create = sub.add_parser("scaffold")
    create.add_argument("--model", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    create.add_argument("--platform", choices=("macos", "linux"), default="macos")
    video = sub.add_parser("encode")
    video.add_argument("--frames", type=Path, required=True)
    video.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            print(json.dumps(inspect_glb(args.model), indent=2))
        elif args.command == "scaffold":
            scaffold(args.model.resolve(), args.output.resolve(), args.platform)
        else:
            encode(args.frames, args.output)
        return 0
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
