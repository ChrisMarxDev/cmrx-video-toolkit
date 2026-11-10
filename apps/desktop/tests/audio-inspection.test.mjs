import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ProjectAgent } from "../src/project-agent.mjs";

test("agent audio inspection measures source/export gain and silence without exposing render folders", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-audio-inspection-"),
  );
  let agent;
  try {
    fs.mkdirSync(path.join(root, "media"));
    const jobs = path.join(root, ".editor/playground");
    fs.mkdirSync(jobs, { recursive: true });
    const source = path.join(root, "media/source.wav"),
      silent = path.join(root, "media/silent.wav"),
      output = path.join(jobs, "export.m4a");
    const ff = (args) => execFileSync("ffmpeg", ["-v", "error", ...args]);
    ff([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-af",
      "volume=0.1",
      source,
    ]);
    ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "1", silent]);
    ff(["-i", source, "-af", "volume=10", "-c:a", "aac", output]);
    const project = {
      assets: [
        { id: "source", path: "media/source.wav" },
        { id: "silent", path: "media/silent.wav" },
      ],
    };
    const context = {
      editor: async () => ({ project }),
      playground: {
        jobsDir: jobs,
        artifact: (id) => (id === "complete" ? output : null),
      },
    };
    agent = new ProjectAgent({
      root: path.join(root, "agent"),
      workspace: root,
    });
    const inspect = (args) => agent.tool("editor_audio", args, context);
    const original = await inspect({ assetId: "source" });
    assert(original.peakDbFS > -39 && original.peakDbFS < -37);
    assert.equal(original.clippingRisk, false);
    const rendered = await inspect({ jobId: "complete" });
    assert(Math.abs(rendered.peakDbFS - original.peakDbFS - 20) < 0.5);
    assert.equal(rendered.sampleRate, 44100);
    assert(rendered.sampleCount > 40000);
    assert.equal((await inspect({ assetId: "silent" })).silent, true);
    await assert.rejects(inspect({ jobId: "pending" }), /completed export/);
    await assert.rejects(
      inspect({ jobId: "complete", assetId: "source" }),
      /Choose one/,
    );
    await assert.rejects(inspect({ assetId: "source", start: -1 }), /range/);
    fs.symlinkSync("/etc/passwd", path.join(root, "media/escaped"));
    project.assets.push({ id: "escaped", path: "media/escaped" });
    await assert.rejects(inspect({ assetId: "escaped" }), /outside/);
  } finally {
    await agent?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
