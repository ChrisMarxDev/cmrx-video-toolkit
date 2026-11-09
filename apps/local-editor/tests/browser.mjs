import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
fs.mkdirSync(cache, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, "cmrx-editor-browser-"));
const results = process.env.EDITOR_RESULTS || "test-results";
execFileSync(process.execPath, ["scripts/demo.mjs", "--workspace", root]);
const proc = spawn(
  process.execPath,
  ["dist/server.mjs", "--workspace", root, "--port", "0"],
  { stdio: "pipe" },
);
let browser;
let connection;
const errors = [];
fs.mkdirSync(results, { recursive: true });
try {
  for (let n = 0; n < 100; n++) {
    const f = path.join(root, ".editor/connection.json");
    if (fs.existsSync(f)) {
      connection = JSON.parse(fs.readFileSync(f, "utf8"));
      break;
    }
    await wait(100);
  }
  assert.ok(connection, "Server must start");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EDITOR_CHROMIUM
      ? { executablePath: process.env.EDITOR_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  const url = connection.url + "/#token=" + connection.token;
  await page.goto(url);
  await page.getByText("Connected", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector(".stage video")?.readyState >= 2,
  );
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".clip-media")];
    return (
      canvases.length > 0 && canvases.every((el) => el.dataset.ready === "true")
    );
  });
  assert.ok(await page.locator('.clip-media[data-waveform="true"]').count());
  const originalPixels = await page
    .locator('[data-clip="opening"] canvas')
    .evaluate((el) => el.toDataURL());
  assert.ok(originalPixels.length > 1000);
  await page.screenshot({
    path: path.join(results, "desktop.png"),
    fullPage: true,
  });
  const speed = page.getByRole("combobox", {
    name: "Playback speed",
    exact: true,
  });
  assert.equal(await speed.inputValue(), "1");
  await speed.selectOption("2");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await wait(500);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const media = await page
    .locator(".stage video")
    .first()
    .evaluate((v) => ({
      time: v.currentTime,
      width: v.videoWidth,
      rate: v.playbackRate,
      pitch: v.preservesPitch,
    }));
  assert.equal(media.rate, 2);
  assert.equal(media.pitch, true);
  assert.ok(
    Number(
      await page
        .getByRole("slider", { name: "Timeline playhead", exact: true })
        .getAttribute("aria-valuenow"),
    ) > 0.7,
    "Playhead advances at double speed",
  );
  await speed.selectOption("1");
  assert.ok(
    media.width > 0 && media.time > 0,
    "Source video decoded and played",
  );
  const clip = page.locator('[data-clip="opening"]');
  await clip.scrollIntoViewIfNeeded();
  const box = await clip.boundingBox();
  await page.mouse.move(box.x + 50, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 24, { steps: 8 });
  await page.mouse.up();
  await page.getByText("rev 1", { exact: true }).waitFor();
  assert.equal(
    await page
      .locator('[data-clip="opening"] canvas')
      .evaluate((el) => el.toDataURL()),
    originalPixels,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "project.json"))).clips[0].start,
    1,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByText("rev 2", { exact: true }).waitFor();
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "project.json"))).clips[0].start,
    0,
  );
  const right = await page
    .getByRole("button", { name: "Trim end Opening · take A", exact: true })
    .boundingBox();
  await page.mouse.move(right.x + 5, right.y + 22);
  await page.mouse.down();
  await page.mouse.move(right.x - 75, right.y + 22, { steps: 8 });
  await page.mouse.up();
  await page.getByText("rev 3", { exact: true }).waitFor();
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "project.json"))).clips[0]
      .duration,
    3,
  );
  await page.locator('[data-clip="signal"]').click();
  assert.equal(await page.locator(".inspector").count(), 0);
  assert.equal(
    await page.getByRole("heading", { name: "Workspace tools" }).count(),
    0,
  );
  const agent = (...args) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["scripts/agent.mjs", ...args, "--workspace", root],
        { encoding: "utf8" },
      ),
    );
  agent(
    "patch",
    "3",
    "signal",
    JSON.stringify({
      props: { strength: 0.8, customAgentData: "preserve-me" },
    }),
  );
  await page.getByText("rev 4", { exact: true }).waitFor();
  let project = JSON.parse(fs.readFileSync(path.join(root, "project.json")));
  assert.equal(
    project.clips.find((c) => c.id === "signal").props.strength,
    0.8,
  );
  assert.equal(
    project.clips.find((c) => c.id === "signal").props.customAgentData,
    "preserve-me",
  );
  project.clips.find((c) => c.id === "signal").name = "Agent signal";
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(project));
  await page.getByText("rev 5", { exact: true }).waitFor();
  await page
    .locator('[data-clip="signal"].selected')
    .filter({ hasText: "Agent signal" })
    .waitFor();
  fs.writeFileSync(path.join(root, "project.json"), "{incomplete");
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Undo", exact: true }).isDisabled(),
    true,
  );
  project = await fetch(connection.url + "/api/state", {
    headers: { Authorization: `Bearer ${connection.token}` },
  })
    .then((r) => r.json())
    .then((s) => s.project);
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(project));
  await page.getByRole("alert").waitFor({ state: "hidden" });
  // A gesture holds its base revision even if an external edit arrives mid-drag.
  const current = await page.locator('[data-clip="opening"]').boundingBox();
  await page.mouse.move(current.x + 50, current.y + 22);
  await page.mouse.down();
  await page.mouse.move(current.x + 90, current.y + 22);
  project.name = "Concurrent agent edit";
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(project));
  await page.getByText("rev 6", { exact: true }).waitFor();
  await page.mouse.up();
  await page
    .getByRole("alert")
    .filter({ hasText: "Revision conflict" })
    .waitFor();
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "project.json"))).clips[0].start,
    0,
  );
  await page.getByRole("button", { name: "Dismiss notice" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Render preview", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.locator(".jobs, .modal").count(), 0);
  agent("tool", "add-card", "6");
  await page.getByText("rev 7", { exact: true }).waitFor();
  const other = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  other.on("pageerror", (e) => errors.push(e.message));
  await other.goto(url);
  await other.getByText("rev 7", { exact: true }).waitFor();
  assert.equal(
    await other.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await other.screenshot({
    path: path.join(results, "phone.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByText("rev 7", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Undo", exact: true }).isEnabled(),
    true,
  );
  // Basic UI stays small; precise mutations remain available to the agent.
  const readProject = () =>
    JSON.parse(fs.readFileSync(path.join(root, "project.json")));
  let revision = 7;
  const committed = async () => {
    revision++;
    await page.getByText(`rev ${revision}`, { exact: true }).waitFor();
    await other.getByText(`rev ${revision}`, { exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Undo"]')?.disabled,
    );
    return readProject();
  };
  const seek = async (time) => {
    const ruler = page.getByRole("slider", {
      name: "Timeline playhead",
      exact: true,
    });
    const zoom = Number(
      await page
        .getByRole("slider", { name: "Timeline zoom", exact: true })
        .inputValue(),
    );
    await ruler.click({ position: { x: time * zoom, y: 5 } });
  };
  assert.equal(await page.locator('input[aria-label="Playhead"]').count(), 0);
  await seek(2);
  assert.equal(await page.locator("h1, .take-preview").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Add footage", exact: true })
      .count(),
    0,
  );
  const context = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/agent.mjs", "context", "--workspace", root],
      { encoding: "utf8" },
    ),
  );
  assert.equal(context.project.revision, revision);
  execFileSync(process.execPath, [
    "scripts/agent.mjs",
    "patch",
    String(revision),
    "opening",
    JSON.stringify({ name: "CLI checked" }),
    "--workspace",
    root,
  ]);
  assert.equal(
    (await committed()).clips.find((c) => c.id === "opening").name,
    "CLI checked",
  );
  await page.locator('[data-clip="opening"]').click();
  await seek(1);
  await page
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Shorten this pause");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  let commented = await committed();
  const note = commented.comments[0];
  assert.equal(note.anchor.type, "clip");
  assert.equal(note.anchor.sourceTime, 1);
  await other.getByText("Shorten this pause", { exact: true }).waitFor();
  agent("patch", String(revision), "opening", JSON.stringify({ start: 1 }));
  await committed();
  await page
    .getByRole("button", { name: "Comment: Shorten this pause", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("slider", { name: "Timeline playhead", exact: true })
      .getAttribute("aria-valuenow"),
    "2",
  );
  await page.getByRole("button", { name: "Split", exact: true }).click();
  commented = await committed();
  assert.notEqual(commented.comments[0].anchor.clipId, "opening");
  await page
    .getByRole("button", { name: "Comment: Shorten this pause", exact: true })
    .click();
  // Select the right half explicitly, then remove it: the comment survives.
  await page
    .locator(`[data-clip="${commented.comments[0].anchor.clipId}"]`)
    .click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await committed();
  await page
    .getByRole("button", { name: "Clip removed", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  assert.equal((await committed()).comments[0].status, "resolved");
  await page.getByRole("heading", { name: "Resolved", exact: true }).waitFor();
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await committed();
  await page
    .getByRole("combobox", { name: "Comment attachment", exact: true })
    .selectOption("timeline");
  await page
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Overall pacing");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  assert.equal((await committed()).comments[1].anchor.type, "timeline");
  await page.reload();
  await page.getByText("Overall pacing", { exact: true }).waitFor();
  await page.getByText("Shorten this pause", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(results, "desktop-comments.png"),
    fullPage: true,
  });
  // Commands work from the editing surface, including focused toolbar buttons.
  await page.locator('[data-clip="second"]').click();
  await page.getByRole("textbox", { name: "Comment", exact: true }).focus();
  await page.locator('[data-clip="second"]').click();
  assert.equal(
    await page
      .locator('[data-clip="second"]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Home");
  assert.equal(
    Number(
      await page
        .getByRole("slider", { name: "Timeline playhead", exact: true })
        .getAttribute("aria-valuenow"),
    ),
    0,
  );
  await page.keyboard.press("ArrowRight");
  assert.ok(
    Math.abs(
      Number(
        await page
          .getByRole("slider", { name: "Timeline playhead", exact: true })
          .getAttribute("aria-valuenow"),
      ) -
        1 / 24,
    ) < 0.001,
  );
  await page.keyboard.press("Shift+ArrowRight");
  assert.ok(
    Math.abs(
      Number(
        await page
          .getByRole("slider", { name: "Timeline playhead", exact: true })
          .getAttribute("aria-valuenow"),
      ) -
        11 / 24,
    ) < 0.001,
  );
  await page.keyboard.press("End");
  await page
    .getByRole("button", { name: "Toggle comments", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  const beforeNudge = readProject().clips.find((c) => c.id === "second").start;
  await page.keyboard.press("Alt+ArrowRight");
  assert.ok(
    Math.abs(
      (await committed()).clips.find((c) => c.id === "second").start -
        beforeNudge -
        1 / 24,
    ) < 0.001,
  );
  await page.keyboard.press("Control+z");
  assert.equal(
    (await committed()).clips.find((c) => c.id === "second").start,
    beforeNudge,
  );
  await seek(5);
  await page.getByRole("button", { name: "Split", exact: true }).focus();
  const beforeKeyboardSplit = readProject().clips.length;
  await page.keyboard.press("s");
  assert.equal((await committed()).clips.length, beforeKeyboardSplit + 1);
  await page.keyboard.press("Control+z");
  assert.equal((await committed()).clips.length, beforeKeyboardSplit);
  await page.keyboard.press("Control+Shift+Z");
  assert.equal((await committed()).clips.length, beforeKeyboardSplit + 1);
  await page.keyboard.press("Delete");
  assert.equal((await committed()).clips.length, beforeKeyboardSplit);
  await page.keyboard.press("Control+z");
  assert.equal((await committed()).clips.length, beforeKeyboardSplit + 1);
  await page.keyboard.press("m");
  const commentField = page.getByRole("textbox", {
    name: "Comment",
    exact: true,
  });
  await commentField.fill("");
  await page.keyboard.type("s c m + - ? are text here");
  const typingRevision = readProject().revision;
  await page.keyboard.press("Backspace");
  assert.equal(readProject().revision, typingRevision);
  assert.equal(
    await page
      .getByRole("complementary", { name: "Keyboard shortcuts", exact: true })
      .count(),
    0,
  );
  await commentField.fill("Keyboard feedback");
  const beforeNewline = readProject().revision;
  await commentField.press("Shift+Enter");
  await page.keyboard.type("Second line");
  assert.equal(readProject().revision, beforeNewline);
  await commentField.press("Enter");
  assert.equal(
    (await committed()).comments.at(-1).body,
    "Keyboard feedback\nSecond line",
  );
  await page.locator('[data-clip="second"]').focus();
  await page.keyboard.press("=");
  assert.equal(
    await page
      .getByRole("slider", { name: "Timeline zoom", exact: true })
      .inputValue(),
    "90",
  );
  await page.keyboard.press("-");
  assert.equal(
    await page
      .getByRole("slider", { name: "Timeline zoom", exact: true })
      .inputValue(),
    "80",
  );
  await page.keyboard.press("c");
  assert.equal(
    await page
      .getByRole("button", { name: "Toggle comments", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.keyboard.press("c");
  await page.keyboard.press("?");
  await page
    .getByRole("complementary", { name: "Keyboard shortcuts", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("complementary", { name: "Keyboard shortcuts", exact: true })
      .count(),
    0,
  );
  const resize = page.getByRole("separator", { name: "Resize timeline" });
  const initialTimeline = await page.locator(".timeline-panel").boundingBox();
  const separatorBox = await resize.boundingBox();
  const revisionBeforeResize = readProject().revision;
  await page.mouse.move(separatorBox.x + 100, separatorBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(separatorBox.x + 100, separatorBox.y - 80, {
    steps: 5,
  });
  await page.mouse.up();
  assert.ok(
    (await page.locator(".timeline-panel").boundingBox()).height >
      initialTimeline.height + 60,
  );
  const resizeValue = Number(await resize.getAttribute("aria-valuenow"));
  await resize.focus();
  await page.keyboard.press("ArrowDown");
  assert.ok(Number(await resize.getAttribute("aria-valuenow")) < resizeValue);
  assert.equal(
    readProject().revision,
    revisionBeforeResize,
    "Dock sizing is UI-only",
  );
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 600],
    [844, 390],
    [390, 844],
    [320, 480],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        };
      };
      return {
        preview: rect(".stage"),
        timeline: rect(".timeline-panel"),
        overflow:
          document.documentElement.scrollHeight > innerHeight ||
          document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(
      layout.overflow,
      false,
      `No page overflow at ${width}x${height}`,
    );
    for (const [name, r] of Object.entries(layout).filter(
      ([name]) => name !== "overflow",
    )) {
      assert.ok(
        r.top >= 0 &&
          r.bottom <= height + 1 &&
          r.left >= 0 &&
          r.right <= width + 1,
        `${name} stays on screen at ${width}x${height}: ${JSON.stringify(r)}`,
      );
      assert.ok(
        r.width > 40 && r.height > 40,
        `${name} remains visible at ${width}x${height}`,
      );
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: path.join(results, "single-screen.png") });
  // Exact duplicates must each be hit-testable, including when unselected.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await resize.focus();
  for (let n = 0; n < 6; n++) await page.keyboard.press("ArrowUp");
  const overlapProject = readProject();
  const original = overlapProject.clips.find((c) => c.id === "second");
  overlapProject.clips.push(
    { ...original, id: "duplicate-a" },
    { ...original, id: "duplicate-b" },
  );
  const candidateFile = path.join(root, "overlaps.json");
  fs.writeFileSync(candidateFile, JSON.stringify(overlapProject));
  agent("replace", String(revision), candidateFile);
  await committed();
  const positions = [];
  for (const id of ["second", "duplicate-a", "duplicate-b"]) {
    const card = page.locator(`[data-clip="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    assert.equal(await card.getAttribute("aria-pressed"), "true");
    positions.push((await card.boundingBox()).y);
    assert.equal(
      await card.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return document
          .elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
          ?.closest("[data-clip]")
          ?.getAttribute("data-clip");
      }),
      id,
    );
  }
  assert.equal(new Set(positions).size, 3);
  let overlapBox = await page
    .locator('[data-clip="duplicate-b"]')
    .boundingBox();
  await page.mouse.move(overlapBox.x + 25, overlapBox.y + 25);
  await page.mouse.down();
  await page.mouse.move(overlapBox.x + 105, overlapBox.y + 25, { steps: 8 });
  await page.mouse.up();
  const moved = await committed();
  assert.equal(
    moved.clips.find((c) => c.id === "duplicate-b").start,
    original.start + 1,
  );
  assert.equal(
    moved.clips.find((c) => c.id === "duplicate-b").track,
    original.track,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page.locator('[data-clip="duplicate-b"]').scrollIntoViewIfNeeded();
  overlapBox = await page.locator('[data-clip="duplicate-b"]').boundingBox();
  const targetTrack = await page.locator('[data-track="1"]').boundingBox();
  await page.mouse.move(overlapBox.x + 25, overlapBox.y + 25);
  await page.mouse.down();
  await page.mouse.move(overlapBox.x + 25, targetTrack.y + 32, { steps: 8 });
  await page.mouse.up();
  assert.equal(
    (await committed()).clips.find((c) => c.id === "duplicate-b").track,
    1,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".clip-media")].every(
      (el) => el.dataset.ready === "true",
    ),
  );
  for (const c of readProject().clips.filter((c) => c.kind === "video")) {
    assert.equal(
      Number(
        await page
          .locator(`[data-clip="${c.id}"] canvas`)
          .getAttribute("data-source-in"),
      ),
      c.in,
    );
  }
  await page.screenshot({ path: path.join(results, "overlap-lanes.png") });
  // Ruler replaces the separate transport scrubber and supports drag seeking.
  const rulerBox = await page.locator(".ruler").boundingBox();
  await page.mouse.move(rulerBox.x + 80, rulerBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(rulerBox.x + 240, rulerBox.y + 5, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.locator(".ruler").getAttribute("aria-valuenow"), "3");
  // Pinch-style wheel events zoom around the pointer, without browser page zoom.
  await page.setViewportSize({ width: 800, height: 720 });
  // Allow the responsive fit measurement to settle before sampling the scroll anchor.
  await page.waitForFunction(
    () =>
      document.querySelector(".timeline").getBoundingClientRect().width < 850,
  );
  const viewport = page.locator(".timeline-scroll");
  await viewport.evaluate((el) => {
    el.scrollLeft = 60;
  });
  const beforeZoom = await viewport.evaluate((el) => ({
    scroll: el.scrollLeft,
    width: el.clientWidth,
  }));
  const anchorX = 350;
  const anchorTime = (beforeZoom.scroll + anchorX - 100) / 80;
  assert.equal(
    await viewport.evaluate((el, x) => {
      const box = el.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -30,
        clientX: box.left + x,
      });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    }, anchorX),
    true,
  );
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('input[aria-label="Timeline zoom"]').value,
      ) > 100,
  );
  const zoomed = Number(
    await page
      .getByRole("slider", { name: "Timeline zoom", exact: true })
      .inputValue(),
  );
  const scrolled = await viewport.evaluate((el) => el.scrollLeft);
  assert.ok(Math.abs((scrolled + anchorX - 100) / zoomed - anchorTime) < 0.03);
  const zoomRevision = readProject().revision;
  await viewport.hover();
  await page.mouse.wheel(80, 0);
  await page.waitForFunction(
    (before) => document.querySelector(".timeline-scroll").scrollLeft > before,
    scrolled,
  );
  assert.equal(
    Number(
      await page
        .getByRole("slider", { name: "Timeline zoom", exact: true })
        .inputValue(),
    ),
    zoomed,
  );
  assert.equal(readProject().revision, zoomRevision);
  // Vertical mouse wheels pan horizontally; Space-drag is a hand tool, not a cut.
  const navigationProject = readProject();
  await viewport.evaluate((el) => {
    el.scrollLeft = 40;
  });
  await viewport.hover();
  await page.mouse.wheel(0, 45);
  await page.waitForFunction(
    () => document.querySelector(".timeline-scroll").scrollLeft > 60,
  );
  const wheelScroll = await viewport.evaluate((el) => el.scrollLeft);
  const navigationBox = await viewport.boundingBox();
  await page.locator(".timeline").focus();
  await page.keyboard.down("Space");
  await page.mouse.move(navigationBox.x + 220, navigationBox.y + 70);
  await page.mouse.down();
  await page.mouse.move(navigationBox.x + 250, navigationBox.y + 70, {
    steps: 5,
  });
  await page.mouse.up();
  await page.keyboard.up("Space");
  assert.ok(
    (await viewport.evaluate((el) => el.scrollLeft)) < wheelScroll - 20,
  );
  assert.equal(
    await page.getByRole("button", { name: "Play", exact: true }).count(),
    1,
  );
  assert.deepEqual(readProject(), navigationProject);
  // Transcript imports persist as source time and seek the assembled timeline.
  await page
    .getByRole("button", { name: "Toggle transcript", exact: true })
    .click();
  await page.getByText("No transcript yet", { exact: true }).waitFor();
  await page
    .getByLabel("Transcript source", { exact: true })
    .selectOption("take-a");
  await page.getByLabel("Transcript file", { exact: true }).setInputFiles({
    name: "source.srt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "1\n00:00:00,000 --> 00:00:07,000\nSynthetic transcript fixture",
    ),
  });
  await page.locator(".transcript-cue").first().waitFor();
  assert.equal(
    readProject().assets.find((a) => a.id === "take-a").transcript[0].text,
    "Synthetic transcript fixture",
  );
  await page.locator(".transcript-cue").first().click();
  assert.equal(
    await page.locator(".transcript-cue").first().getAttribute("data-active"),
    "true",
  );
  await page.screenshot({ path: path.join(results, "transcript.png") });
  await page.reload();
  await page.getByText("Connected", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Toggle transcript", exact: true })
    .click();
  await page.locator(".transcript-cue").first().waitFor();

  await page.getByRole("textbox", { name: "Comment", exact: true }).waitFor();
  // Independent panes resize/reorder without changing authored state.
  const layoutRevision = readProject().revision;
  assert.equal(await page.locator(".dock-pane").count(), 3);
  await page
    .getByRole("button", { name: "Toggle transcript", exact: true })
    .focus();
  await page.keyboard.press("t");
  assert.equal(await page.locator(".dock-pane").count(), 2);
  await page.keyboard.press("t");
  assert.equal(await page.locator(".dock-pane").count(), 3);
  assert.equal(await page.getByRole("tablist").count(), 0);
  const previewPane = page.locator('[data-pane="preview"]');
  const beforeWidth = (await previewPane.boundingBox()).width;
  const dockDivider = page.getByRole("separator", {
    name: "Resize Preview and Comments",
    exact: true,
  });
  const divider = await dockDivider.boundingBox();
  await page.mouse.move(divider.x + 2, divider.y + 60);
  await page.mouse.down();
  await page.mouse.move(divider.x - 70, divider.y + 60, { steps: 5 });
  await page.mouse.up();
  assert.ok((await previewPane.boundingBox()).width < beforeWidth - 50);
  const order = () =>
    page
      .locator(".dock-pane")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.pane));
  await page
    .getByRole("button", { name: "Move Transcript panel", exact: true })
    .dragTo(
      page.getByRole("button", { name: "Move Comments panel", exact: true }),
    );
  assert.deepEqual(await order(), ["comments", "preview", "transcript"]);
  await page
    .getByRole("button", { name: "Move Comments panel", exact: true })
    .focus();
  await page.keyboard.press("Alt+ArrowRight");
  assert.deepEqual(await order(), ["preview", "comments", "transcript"]);
  await page
    .getByRole("button", { name: "Toggle comments", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("complementary", { name: "Transcript", exact: true })
      .isVisible(),
    true,
  );
  await page
    .getByRole("button", { name: "Toggle comments", exact: true })
    .click();
  await page.screenshot({ path: path.join(results, "docked-workspace.png") });
  await page.reload();
  await page.getByText("Connected", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Toggle transcript", exact: true })
    .click();
  assert.deepEqual(await order(), ["preview", "comments", "transcript"]);
  assert.equal(readProject().revision, layoutRevision);
  // Precise edits remain in the timeline toolbar and preserve undo/source bounds.
  revision = readProject().revision;
  const editClip = readProject().clips.find(
    (c) => c.kind === "video" && c.duration > 0.5,
  );
  await page.locator(`[data-clip="${editClip.id}"]`).click();
  await page
    .getByLabel("Clip position", { exact: true })
    .fill(String(editClip.start + 0.5));
  await page.getByLabel("Clip position", { exact: true }).press("Enter");
  assert.equal(
    (await committed()).clips.find((c) => c.id === editClip.id).start,
    editClip.start + 0.5,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page
    .getByLabel("Clip duration", { exact: true })
    .fill(String(editClip.duration - 0.25));
  await page.getByLabel("Clip duration", { exact: true }).press("Enter");
  assert.equal(
    (await committed()).clips.find((c) => c.id === editClip.id).duration,
    editClip.duration - 0.25,
  );
  await page.getByLabel("Clip duration", { exact: true }).fill("999");
  await page.getByLabel("Clip duration", { exact: true }).press("Enter");
  const extended = (await committed()).clips.find((c) => c.id === editClip.id);
  assert.equal(
    extended.in + extended.duration,
    readProject().assets.find((a) => a.id === editClip.assetId).duration,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page
    .getByLabel("Clip layer", { exact: true })
    .selectOption(String((editClip.track + 1) % 8));
  assert.equal(
    (await committed()).clips.find((c) => c.id === editClip.id).track,
    (editClip.track + 1) % 8,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await seek(editClip.start + editClip.duration / 2);
  const playheadBeforeTrim = await page
    .getByRole("slider", { name: "Timeline playhead", exact: true })
    .getAttribute("aria-valuenow");
  await page.locator(`[data-clip="${editClip.id}"] .handle.right`).focus();
  await page.keyboard.press("ArrowLeft");
  assert.ok(
    Math.abs(
      (await committed()).clips.find((c) => c.id === editClip.id).duration -
        editClip.duration +
        1 / readProject().fps,
    ) < 0.001,
  );
  assert.equal(
    await page
      .getByRole("slider", { name: "Timeline playhead", exact: true })
      .getAttribute("aria-valuenow"),
    playheadBeforeTrim,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page
    .getByRole("button", { name: "Trim start to playhead", exact: true })
    .click();
  assert.equal(
    (await committed()).clips.find((c) => c.id === editClip.id).start,
    Number(playheadBeforeTrim),
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  await page.locator(`[data-clip="${editClip.id}"]`).focus();
  await page.keyboard.press("w");
  assert.equal(
    (await committed()).clips.find((c) => c.id === editClip.id).duration,
    Number(playheadBeforeTrim) - editClip.start,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  assert.equal(
    await page
      .getByRole("button", { name: "Toggle snapping", exact: true })
      .count(),
    0,
  );
  const beforeCancel = readProject().revision;
  const clipForCancel = page.locator(`[data-clip="${editClip.id}"]`);
  await clipForCancel.scrollIntoViewIfNeeded();
  const cancelBox = await clipForCancel.boundingBox();
  const snapRuler = await page.locator(".ruler").boundingBox();
  await page.mouse.click(cancelBox.x + 1, snapRuler.y + 5);
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(
    cancelBox.x + cancelBox.width / 2 + 60,
    cancelBox.y + 24,
    { steps: 5 },
  );
  await page.mouse.move(
    cancelBox.x + cancelBox.width / 2 + 5,
    cancelBox.y + 24,
  );
  assert.equal(await page.locator(".snap-guide").count(), 0);
  await page.keyboard.down("Shift");
  await page.mouse.move(
    cancelBox.x + cancelBox.width / 2 + 6,
    cancelBox.y + 24,
  );
  await page.locator(".snap-guide").waitFor();
  await page.keyboard.up("Shift");
  await page.mouse.move(
    cancelBox.x + cancelBox.width / 2 + 7,
    cancelBox.y + 24,
  );
  assert.equal(await page.locator(".snap-guide").count(), 0);
  await page.locator(".edit-feedback").waitFor();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.locator(".edit-feedback").count(), 0);
  assert.equal(readProject().revision, beforeCancel);
  await page.getByLabel("Clip position", { exact: true }).fill("99");
  await page.getByLabel("Clip position", { exact: true }).press("Escape");
  await page.getByLabel("Clip position", { exact: true }).press("Tab");
  assert.equal(readProject().revision, beforeCancel);
  // Layer overrides keep clip flags and flow through both connected clients.
  revision = readProject().revision;
  const clipsBeforeLayers = structuredClone(readProject().clips);
  await page.getByRole("button", { name: "Mute layer 0", exact: true }).click();
  assert.equal((await committed()).layers[0].muted, true);
  assert.deepEqual(readProject().clips, clipsBeforeLayers);
  assert.equal(
    await page
      .locator(".stage video")
      .evaluateAll((videos) => videos.every((v) => v.muted)),
    true,
  );
  const baseVideos = readProject().clips.filter(
    (c) => c.kind === "video" && c.track === 0,
  ).length;
  const videosBeforeDisable = await page.locator(".stage video").count();
  await page
    .getByRole("button", { name: "Disable layer 0", exact: true })
    .click();
  await committed();
  assert.equal(
    await page.locator(".stage video").count(),
    videosBeforeDisable - baseVideos,
  );
  await page
    .getByRole("button", { name: "Enable layer 0", exact: true })
    .click();
  await committed();
  assert.equal(await page.locator(".stage video").count(), videosBeforeDisable);
  await page
    .getByRole("button", { name: "Unmute layer 0", exact: true })
    .click();
  await committed();
  const baseClip = readProject().clips.find((c) => c.track === 0);
  await page.locator(`[data-clip="${baseClip.id}"]`).focus();
  await page.keyboard.press("Shift+M");
  assert.equal((await committed()).layers[0].muted, true);
  await page.keyboard.press("Shift+V");
  assert.equal((await committed()).layers[0].disabled, true);
  await page.reload();
  await page.getByText(`rev ${revision}`, { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Unmute layer 0", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Enable layer 0", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await committed()).layers[0].disabled, false);
  assert.deepEqual(readProject().clips, clipsBeforeLayers);
  // Editing text preserves anchors/status, survives reload and participates in undo.
  const savedComment = structuredClone(readProject().comments[0]);
  const commentCard = page.locator(`[data-comment="${savedComment.id}"]`);
  await commentCard
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  const editText = page.getByRole("textbox", {
    name: "Edit comment text",
    exact: true,
  });
  await editText.fill("   ");
  assert.equal(
    await page
      .getByRole("button", { name: "Save comment", exact: true })
      .isDisabled(),
    true,
  );
  await editText.fill("Updated feedback\nSecond line");
  await editText.press("Enter");
  let updatedComment = (await committed()).comments.find(
    (c) => c.id === savedComment.id,
  );
  assert.equal(updatedComment.body, "Updated feedback\nSecond line");
  assert.deepEqual(updatedComment.anchor, savedComment.anchor);
  assert.equal(updatedComment.status, savedComment.status);
  await page.reload();
  await page.getByText(`rev ${revision}`, { exact: true }).waitFor();
  await commentCard.getByText("Updated feedback", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  assert.equal(readProject().comments[0].body, savedComment.body);
  await commentCard
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await editText.fill("Discard this draft");
  await editText.press("Escape");
  assert.equal(await editText.count(), 0);
  assert.equal(readProject().revision, revision);
  await commentCard
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await editText.fill("Retain this local draft");
  const otherEdit = await fetch(connection.url + "/api/comment-update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      revision,
      id: savedComment.id,
      patch: { body: "Concurrent saved feedback" },
    }),
  });
  assert.equal(otherEdit.status, 200);
  await committed();
  assert.equal(await editText.inputValue(), "Retain this local draft");
  assert.equal(
    await page
      .getByRole("button", { name: "Save comment", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Cancel comment edit", exact: true })
    .click();
  await commentCard
    .getByText("Concurrent saved feedback", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await committed();
  // Fit a long timeline and keep unequal take choices independently.
  project = readProject();
  revision = project.revision;
  const video = project.clips.find((c) => c.kind === "video");
  video.in = 0;
  video.start = 0;
  video.duration = 4;
  project.layers = {};
  project.clips.push({
    ...project.clips.find((c) => c.kind !== "video"),
    id: "long-tail",
    start: 580,
    duration: 10,
  });
  project.takeSections = ["intro", "outro"].map((id) => ({
    id,
    label: id,
    assetId: video.assetId,
    takes: [
      { id: "a", label: "A", sourceStart: 0, sourceEnd: 1 },
      { id: "b", label: "B", sourceStart: 1, sourceEnd: 3 },
    ],
  }));
  const update = await fetch(connection.url + "/api/project", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ revision, project }),
  });
  assert.equal(update.status, 200);
  await committed();
  await page.getByRole("button", { name: "Fit timeline", exact: true }).click();
  await page.waitForTimeout(100);
  assert.ok(
    await page
      .locator(".timeline-scroll")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  );
  await page.getByLabel("Take alternative", { exact: true }).selectOption("b");
  await page
    .getByRole("button", { name: "Keep take for section", exact: true })
    .click();
  await committed();
  await page.getByLabel("Take section", { exact: true }).selectOption("outro");
  await page
    .getByRole("button", { name: "Keep take for section", exact: true })
    .click();
  await committed();
  assert.equal(readProject().takeSections[0].preferredTakeId, "b");
  assert.equal(readProject().takeSections[1].preferredTakeId, "a");
  await page.getByLabel("Take section", { exact: true }).selectOption("intro");
  await page.getByRole("button", { name: "Replay take", exact: true }).click();
  await page
    .getByRole("button", { name: "Play", exact: true })
    .waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(results, "section-takes.png") });
  // T3 propagates an opaque origin through the app wrapper into its nested iframe.
  const sandbox = await browser.newPage({
    viewport: { width: 900, height: 700 },
  });
  sandbox.on("pageerror", (e) => errors.push(e.message));
  const wrapper = `<iframe src="${connection.url}/embed#token=${connection.token}" style="width:100%;height:640px"></iframe>`;
  await sandbox.setContent(
    `<iframe sandbox="allow-scripts allow-forms" style="width:100%;height:660px" srcdoc="${wrapper.replaceAll('"', "&quot;")}"></iframe>`,
  );
  const embedded = sandbox.frameLocator("iframe").frameLocator("iframe");
  await embedded.getByText("Connected", { exact: true }).waitFor();
  assert.equal(
    await embedded.locator("body").evaluate(() => {
      try {
        sessionStorage.getItem("x");
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  await embedded
    .getByLabel("Take alternative", { exact: true })
    .selectOption("a");
  await embedded
    .getByRole("button", { name: "Keep take for section", exact: true })
    .click();
  await committed();
  assert.equal(readProject().takeSections[0].preferredTakeId, "a");
  await embedded
    .getByRole("button", { name: "Play", exact: true })
    .waitFor({ timeout: 5000 });
  assert.ok(
    await embedded
      .locator(".stage video")
      .first()
      .evaluate((v) => v.readyState >= 2),
  );
  await sandbox.screenshot({ path: path.join(results, "mcp-sandbox.png") });
  await sandbox.close();
  for (const [origin, capability, status] of [
    ["null", connection.token, 200],
    ["null", "wrong", 403],
    ["https://untrusted.example", connection.token, 403],
  ]) {
    const res = await fetch(connection.url + "/api/state?token=" + capability, {
      headers: { Origin: origin },
    });
    assert.equal(res.status, status);
    assert.equal(
      res.headers.get("Access-Control-Allow-Origin"),
      status === 200 ? "null" : null,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: playback, move, trim, undo, agent extension edits, no inspector, external/invalid/conflicting edits, live second client, 390px layout, reload, agent CLI and comment anchor/split/delete/undo/resolve persistence.",
  );
} catch (e) {
  if (browser) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    for (const [i, p] of pages.entries()) {
      await p.screenshot({
        path: `${results}/failure-${i}.png`,
        fullPage: true,
      });
      console.error(await p.locator("body").innerText());
    }
  }
  throw e;
} finally {
  await browser?.close();
  proc.kill("SIGTERM");
  await new Promise((resolve) => proc.once("exit", resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
