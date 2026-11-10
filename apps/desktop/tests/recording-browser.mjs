import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createWorkspace } from "../src/workspace-library.mjs";
const { _electron: electron } = createRequire(import.meta.url)(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-recorder-ui-"),
  ),
  studio = path.join(root, "Studio"),
  project = path.join(studio, "projects/Showcase");
createWorkspace(studio);
fs.mkdirSync(path.join(project, ".editor"), { recursive: true });
fs.writeFileSync(
  path.join(project, ".editor/onboarding.json"),
  '{"complete":true}',
);
const original = {
  schemaVersion: 1,
  revision: 0,
  name: "Showcase",
  width: 1280,
  height: 720,
  fps: 30,
  clips: [],
  assets: [],
};
fs.writeFileSync(path.join(project, "project.json"), JSON.stringify(original));
let app;
try {
  app = await electron.launch({
    executablePath: process.env.EDITOR_ELECTRON || "/usr/bin/electron43",
    args: [
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
      "--user-data-dir=" + path.join(root, "profile"),
      fileURLToPath(new URL("../src/desktop.cjs", import.meta.url)),
      "--workspace",
      project,
    ],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      CHAT_WORKSPACE_DIR: studio,
      CHAT_DESKTOP_TEST_PROVIDER: fileURLToPath(
        new URL("fixtures/desktop-provider.mjs", import.meta.url),
      ),
    },
  });
  const shell = await app.firstWindow();
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    page = app
      .context()
      .pages()
      .find((p) => p.url().startsWith("http:"));
    if (!page) await new Promise((r) => setTimeout(r, 50));
  }
  assert(page);
  const editor = page.frameLocator("#editor");
  await editor
    .getByRole("button", { name: "More timeline actions", exact: true })
    .click();
  await editor
    .getByRole("menuitem", { name: "Record screen or camera…", exact: true })
    .click();
  let recorder;
  for (let i = 0; i < 100 && !recorder; i++) {
    recorder = app
      .context()
      .pages()
      .find((p) => p.url().endsWith("/recorder.html"));
    if (!recorder) await new Promise((r) => setTimeout(r, 50));
  }
  assert(recorder);
  await recorder
    .getByRole("button", { name: "Start recording", exact: true })
    .waitFor();
  await recorder.waitForFunction(() => document.body.dataset.ready === "true");
  const errors = [];
  recorder.on("pageerror", (e) => errors.push(e.message));
  // Synthetic devices exercise real Chromium encoders and native IPC/disk/remux.
  // No real desktop, camera or microphone is accessed by this test.
  await recorder.evaluate(() => {
    const devices = [
      { kind: "videoinput", deviceId: "cam-a", label: "Demo camera A" },
      { kind: "videoinput", deviceId: "cam-b", label: "Demo camera B" },
      { kind: "audioinput", deviceId: "mic-a", label: "Demo microphone" },
    ];
    const video = (color) => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 360;
      c.style.cssText =
        "position:fixed;top:0;left:0;width:2px;height:2px;pointer-events:none";
      document.body.append(c);
      const ctx = c.getContext("2d");
      let frame = 0;
      const paint = () => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "white";
        ctx.fillRect((frame++ % 100) * 6, 0, 4, 4);
      };
      const stream = c.captureStream(0);
      setInterval(() => {
        paint();
        stream.getVideoTracks()[0].requestFrame();
      }, 1000 / 30);
      paint();
      stream.getVideoTracks()[0].requestFrame();
      return stream;
    };
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      value: async () => devices,
    });
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      value: async () => {
        window.screenCapture = video("#ff0000");
        return window.screenCapture;
      },
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async (constraints) => {
        if (constraints.video)
          return video(
            constraints.video.deviceId?.exact === "cam-b"
              ? "#0000ff"
              : "#00ff00",
          );
        const audio = new AudioContext(),
          tone = audio.createOscillator(),
          destination = audio.createMediaStreamDestination();
        tone.frequency.value = 440;
        tone.connect(destination);
        tone.start();
        window.testAudio = audio;
        return destination.stream;
      },
    });
  });
  await recorder.getByLabel("Camera", { exact: true }).selectOption("default");
  await recorder.locator("#camera-preview").waitFor();
  await recorder.getByLabel("Camera", { exact: true }).selectOption("cam-b");
  await recorder
    .getByLabel("Microphone", { exact: true })
    .selectOption("mic-a");
  await recorder.waitForFunction(
    () => !document.querySelector("#start").disabled,
  );
  assert.equal(await recorder.locator("#camera").inputValue(), "cam-b");
  assert.equal(await recorder.locator("#microphone").inputValue(), "mic-a");
  await recorder.waitForFunction(() => innerWidth <= 480 && innerHeight < 580);
  await recorder.screenshot({ path: path.join(root, "setup.png") });
  await recorder
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await recorder
    .getByRole("button", { name: "Stop & save", exact: true })
    .waitFor();
  await recorder
    .locator("#clock")
    .getByText("00:02", { exact: true })
    .waitFor();
  await recorder.waitForFunction(() => innerWidth <= 360 && innerHeight <= 180);
  await recorder.screenshot({ path: path.join(root, "recording.png") });
  // OS source ending must stop all independent tracks and save them once.
  if (process.env.CHAT_TEST_RECORDING_CLOSE === "1") {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("/recorder.html"))
        .close();
    });
  } else {
    await recorder.evaluate(() =>
      window.screenCapture.getVideoTracks()[0].stop(),
    );
    // Track.stop itself does not emit ended, unlike OS sharing revocation.
    await recorder.evaluate(() =>
      window.screenCapture
        .getVideoTracks()[0]
        .dispatchEvent(new Event("ended")),
    );
  }
  if (!recorder.isClosed())
    await recorder.waitForEvent("close", { timeout: 30000 });
  const folders = fs.readdirSync(path.join(project, "assets/recordings"));
  assert.equal(folders.length, 1);
  const folder = path.join(project, "assets/recordings", folders[0]);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(folder, "manifest.json")),
  );
  assert.equal(manifest.status, "complete");
  assert.deepEqual(
    manifest.tracks.map((t) => t.name),
    ["screen", "camera", "microphone"],
  );
  assert(manifest.tracks.every((t) => t.media.duration > 1));
  assert(manifest.tracks.every((t) => t.offsetMs >= 0));
  const pixel = (file) =>
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      path.join(folder, file),
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ]);
  const s = pixel("screen.webm"),
    c = pixel("camera.webm");
  assert(s[0] > 200 && s[2] < 30, `screen ${s.toJSON()}`);
  assert(c[2] > 200 && c[0] < 30, `camera ${c.toJSON()}`);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(project, "project.json"))),
    original,
    "capture leaves the timeline untouched",
  );

  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.locator("#assets-project").click();
  await page
    .getByRole("button", { name: "Open folder recordings", exact: true })
    .click();
  await page.getByRole("button", { name: /Preview asset Recording/ }).click();
  assert(
    (await page.locator("#asset-detail").innerText()).includes(
      "screen + camera + microphone",
    ),
  );
  await page.screenshot({ path: path.join(root, "saved.png") });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: native recorder entry, selectable camera, actual separate MediaRecorder streams, IPC save/remux, stop/save handling, decoded red/blue media, asset discovery and unchanged timeline. Synthetic devices; OS picker/hardware not exercised. " +
      root,
  );
} finally {
  await app?.close();
}
