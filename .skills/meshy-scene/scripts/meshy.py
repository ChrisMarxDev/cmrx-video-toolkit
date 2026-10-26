#!/usr/bin/env python3
"""Small, resumable Meshy task client. Python standard library only."""
import argparse
import json
import math
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

API = "https://api.meshy.ai"
ENDPOINTS = {
    "text-to-3d": "/openapi/v2/text-to-3d",
    "image-to-3d": "/openapi/v1/image-to-3d",
    "remesh": "/openapi/v1/remesh",
    "rigging": "/openapi/v1/rigging",
    "animations": "/openapi/v1/animations",
    "text-to-motion": "/openapi/v1/text-to-motion",
}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # In particular, never forward an API bearer token to another host.
        return None


def request(path, payload=None):
    token = os.environ.get("MESHY_API_KEY")
    if not token:
        raise ValueError("Set MESHY_API_KEY in the environment")
    req = Request(API + path, headers={"Authorization": f"Bearer {token}",
                                      "Content-Type": "application/json"},
                  data=None if payload is None else json.dumps(payload).encode())
    try:
        with build_opener(NoRedirect()).open(req, timeout=60) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"Meshy HTTP {exc.code}; no automatic retry") from None
    except (URLError, TimeoutError):
        raise RuntimeError("Meshy connection failed; submission outcome may be unknown") from None


def save(path, value):
    # Receipts may contain private prompts and temporary signed download URLs.
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", opener=lambda p, f: os.open(p, f, 0o600)) as f:
        json.dump(value, f, indent=2)
        f.write("\n")
    tmp.replace(path)


def submit(kind, payload, receipt):
    if not isinstance(payload, dict) or not payload:
        raise ValueError("Request must be a nonempty JSON object")
    if not os.environ.get("MESHY_API_KEY"):
        raise ValueError("Set MESHY_API_KEY in the environment")
    # Reserve before the paid POST. An ambiguous response must never trigger a
    # second paid job just because the command is rerun with the same receipt.
    state = {"schema": 1, "kind": kind, "request": payload,
             "submission": "unknown", "created_at": time.time()}
    with open(receipt, "x", encoding="utf-8",
              opener=lambda p, f: os.open(p, f, 0o600)) as f:
        json.dump(state, f, indent=2)
    result = request(ENDPOINTS[kind], payload)
    task_id = result.get("result")
    if not isinstance(task_id, str) or not task_id:
        raise RuntimeError("No task ID returned; reconcile the reserved receipt before resubmitting")
    state.update(task_id=task_id, submission="accepted")
    save(receipt, state)
    return state


def refresh(receipt):
    state = json.loads(receipt.read_text())
    if not state.get("task_id"):
        raise ValueError("Receipt has no task ID; reconcile with Meshy task history, do not resubmit")
    path = ENDPOINTS[state["kind"]] + "/" + quote(state["task_id"], safe="")
    state["task"] = request(path)
    save(receipt, state)
    return state


def poll(receipt, wait=0, interval=5):
    if not math.isfinite(wait) or not math.isfinite(interval) or wait < 0 or interval <= 0:
        raise ValueError("wait must be finite and >= 0; interval must be finite and > 0")
    deadline = time.monotonic() + wait
    while True:
        state = refresh(receipt)
        status = state["task"].get("status")
        print(json.dumps({"task_id": state["task_id"], "status": status,
                          "progress": state["task"].get("progress")}), flush=True)
        if status == "SUCCEEDED":
            return 0
        if status in ("FAILED", "CANCELED", "CANCELLED", "EXPIRED"):
            return 1
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return 2  # Resumable pending task, not a new submission.
        time.sleep(min(interval, remaining))


def download(receipt, field, output):
    from scene_capture import inspect_glb
    state = refresh(receipt)  # Refresh expiring signed URL immediately before use.
    if state["task"].get("status") != "SUCCEEDED":
        raise ValueError("Task has not succeeded")
    value = state["task"]
    for key in field.split("."):
        value = value[key]
    if not isinstance(value, str) or urlsplit(value).scheme != "https":
        raise ValueError("Selected field must be a nonempty HTTPS download URL")
    if output.exists():
        raise FileExistsError(output)
    part = output.with_suffix(output.suffix + ".part")
    # Asset requests never receive MESHY_API_KEY. Refuse redirects; refresh the
    # receipt if a provider CDN URL stops working instead of following blindly.
    try:
        with open(part, "xb") as dest:
            try:
                with build_opener(NoRedirect()).open(value, timeout=60) as source:
                    total = 0
                    while chunk := source.read(1024 * 1024):
                        total += len(chunk)
                        if total > 400 * 1024 * 1024:
                            raise ValueError("Download exceeds 400 MiB")
                        dest.write(chunk)
            except (HTTPError, URLError, TimeoutError):
                raise RuntimeError("Asset download failed; rerun download to refresh URL") from None
        info = inspect_glb(part)
        # Atomic publication without overwriting a concurrently created file.
        os.link(part, output)
    finally:
        # Do not delete a pre-existing partial file owned by another invocation.
        if 'dest' in locals():
            part.unlink(missing_ok=True)
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("submit", help="Submit one paid task; never automatically retried")
    create.add_argument("kind", choices=ENDPOINTS)
    create.add_argument("--request", type=Path, required=True)
    create.add_argument("--receipt", type=Path, required=True)
    status = sub.add_parser("status", help="Refresh a receipt; exit 2 means still pending")
    status.add_argument("--receipt", type=Path, required=True)
    status.add_argument("--wait", type=float, default=0)
    status.add_argument("--interval", type=float, default=5)
    get = sub.add_parser("download", help="Download and inspect a GLB from a successful task")
    get.add_argument("--receipt", type=Path, required=True)
    get.add_argument("--field", required=True, help="Dot path in task response, e.g. model_urls.glb")
    get.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "submit":
            state = submit(args.kind, json.loads(args.request.read_text()), args.receipt)
            print(json.dumps({"task_id": state["task_id"], "receipt": str(args.receipt)}))
        elif args.command == "status":
            return poll(args.receipt, args.wait, args.interval)
        else:
            print(json.dumps(download(args.receipt, args.field, args.output), indent=2))
        return 0
    except (ValueError, KeyError, OSError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
