import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  graphicsDispatcher,
  bindGraphicsComposition,
} from "../src/graphics-clips.mjs";
import { Playground } from "../src/playground.mjs";
test("graphics dispatch binds ordinary composition imports and rejects escaping source modules", () => {
  const p = {
    clips: [
      { kind: "graphics", props: { source: "lib/paper.dart" } },
      { kind: "graphics", props: { source: "lib/badge.dart" } },
    ],
  };
  const source = graphicsDispatcher(p, "video_playground");
  assert.match(source, /package:video_playground\/paper.dart/);
  assert.match(source, /package:video_playground\/badge.dart/);
  assert.match(source, /graphicsClip/);
  for (const input of [
    "import 'graphics.dart';",
    'import "package:video_playground/graphics.dart" as g;',
  ]) {
    const bound = bindGraphicsComposition(input, "video_playground");
    assert(bound.bound);
    assert.match(bound.source, /_cmrx_render\/graphics_stack.dart/);
  }
  assert.equal(
    bindGraphicsComposition("import 'another.dart';", "video_playground").bound,
    false,
  );
  for (const source of [
    "../secret.dart",
    "lib/../secret.dart",
    "lib/.hidden.dart",
    "lib/bad'code.dart",
  ])
    assert.throws(
      () =>
        graphicsDispatcher(
          { clips: [{ kind: "graphics", props: { source } }] },
          "video_playground",
        ),
      /source/,
    );
});
test("render acceptance rejects export/cache duration or resolution mismatches and invalid metadata", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-render-timing-"),
  );
  try {
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify({ revision: 0, fps: 24 }),
    );
    const p = new Playground({ workspace: root });
    const job = { duration: 10, width: 640, height: 360 };
    let metadata = {
      format: { duration: "10" },
      streams: [{ codec_type: "video", width: 640, height: 360 }],
    };
    p.execRaw = async () => ({ output: JSON.stringify(metadata) });
    await p.verifyTiming(root, "preview.mp4", job);
    metadata.format.duration = "1";
    await assert.rejects(
      p.verifyTiming(root, "preview.mp4", job),
      /does not match the timeline/,
    );
    metadata.format.duration = "N/A";
    await assert.rejects(
      p.verifyTiming(root, "overlay.webm", job),
      /does not match/,
    );
    metadata.format.duration = "10";
    metadata.streams[0].width = 320;
    await assert.rejects(
      p.verifyTiming(root, "preview.mp4", job),
      /does not match/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolved instance dispatch omits unused legacy imports and hidden instances cannot fall back to legacy graphics", () => {
  const source = graphicsDispatcher(
    { graphicsMode: "instances", clips: [] },
    "video_playground",
  );
  assert.doesNotMatch(source, /as legacy/);
  assert.match(source, /if\(clips.isEmpty\) return const SizedBox.shrink/);
  assert.match(
    graphicsDispatcher({ clips: [] }, "video_playground"),
    /legacy.buildGraphics/,
  );
});
