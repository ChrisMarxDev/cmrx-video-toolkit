// Run only with explicit browser-automation permission from the host.
const { chromium } = require("playwright");
const fs = require("fs");
const assert = require("assert");
const root = process.env.REVIEW_FIXTURES;
assert(
  root && process.env.REVIEW_URL,
  "Set REVIEW_FIXTURES to full_flow.py output and REVIEW_URL to the printed server URL.",
);
fs.mkdirSync(root + "/browser-tests", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fixtureEvidence = JSON.parse(fs.readFileSync(root + "/evidence.json"));
  const results = [],
    run = Date.now();
  try {
    await page.goto(process.env.REVIEW_URL);
    if (await page.locator("#empty").isVisible()) {
      assert(await page.locator("#begin").isVisible());
      assert(!(await page.locator(".action-bar").isVisible()));
    }
    for (let i = 0; i < 2; i++) {
      const workspace = root + "/browser-tests/compact-" + run + "-" + i;
      await page
        .locator(
          (await page.locator("#empty").isVisible())
            ? "#begin"
            : "#open-button",
        )
        .click();
      await page
        .locator("#path")
        .fill(root + `/original ${i}.${i ? "mkv" : "mp4"}`);
      if (!(await page.locator("details").evaluate((e) => e.open)))
        await page.locator("summary").click();
      await page.locator("#workspace-path").fill(workspace);
      await page
        .locator("#transcript-path")
        .fill(fixtureEvidence.videos[i].workspace + "/review.json");
      await page.locator("#prepare").click();
      await page.waitForFunction(
        async (workspace) => {
          const state = await fetch("/api/state", {
            headers: {
              "X-Review-Token": sessionStorage.getItem("review-token"),
            },
          }).then((r) => r.json());
          return (
            state.workspace === workspace &&
            !state.job.busy &&
            !document.querySelector("#export-button").disabled
          );
        },
        workspace,
        { timeout: 120000 },
      );
      await page.waitForTimeout(1000);
      await page.waitForFunction(
        () => document.querySelector("video").readyState >= 2,
      );
      const read = () =>
        JSON.parse(fs.readFileSync(workspace + "/review.json"));
      const geometry = () => page.locator(".video-shell").boundingBox();
      const initialGeometry = await geometry();
      async function saved() {
        await page.waitForTimeout(650);
        assert.equal(await page.locator("#save-status").textContent(), "Saved");
      }
      async function draw(a, b) {
        await page.locator("#timeline-scroll").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        const bounds = await page.locator("#timeline").boundingBox();
        const duration = read().source.duration;
        // Empty space below the packed bars is always available for a new range.
        await page.mouse.move(
          bounds.x + (bounds.width * a) / duration,
          bounds.y + bounds.height - 4,
        );
        await page.mouse.down();
        await page.mouse.move(
          bounds.x + (bounds.width * b) / duration,
          bounds.y + bounds.height - 4,
          { steps: 12 },
        );
        await page.mouse.up();
        await page.locator("#comment-popover").waitFor({ state: "visible" });
      }
      async function dismiss() {
        await page.locator("#item-text").press("Escape");
      }
      await page.locator("#play").click();
      await page.waitForTimeout(400);
      await page.locator("#play").click();
      assert((await page.locator("video").evaluate((v) => v.currentTime)) > 0);
      await page.locator("#search").fill("zzzznonexistent");
      assert.equal(await page.locator(".passage").count(), 0);
      await page.locator("#search").fill("");
      assert((await page.locator(".passage").count()) > 0);
      await draw(0.3, 1);
      await dismiss();
      assert.equal(await page.locator(".bar").count(), 0);
      await draw(0.3, 1);
      await page.locator("#positive").click();
      await page.locator("#positive").click();
      await dismiss();
      await saved();
      assert.equal(read().marks.length, 0);
      await draw(0, 2);
      await page.locator("#positive").click();
      await dismiss();
      await saved();
      await draw(4, 6);
      await page.locator("#negative").click();
      await dismiss();
      await saved();
      await draw(7, 9);
      await page.locator("#item-text").fill("Keep the explanation clear");
      await page.locator("#item-text").press("Enter");
      await saved();
      assert.equal(read().marks.length, 3);
      assert.deepEqual(
        read().marks.map((m) => m.kind),
        ["good", "bad", "comment"],
      );
      await page.locator(".bar.comment").focus();
      const beforeNudge = read().marks[2].source_start;
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await saved();
      assert(
        Math.abs(read().marks[2].source_start - beforeNudge - 0.2) < 0.001,
      );
      await page.locator("#undo").click();
      await page.locator("#undo").click();
      await saved();
      assert.deepEqual(
        await geometry(),
        initialGeometry,
        "Adding content must not move/resize the video",
      );
      assert.equal(
        new Set(
          await page
            .locator(".bar")
            .evaluateAll((nodes) => nodes.map((n) => n.style.top)),
        ).size,
        1,
        "Non-overlapping comments share a row",
      );
      // Selecting and resizing a range use visible handles, not timing forms.
      await page.locator(".bar.comment").click();
      await page.locator("#item-text").press("Escape");
      await page.locator(".bar.comment").click();
      const bar = await page.locator(".bar.comment").boundingBox();
      await page.mouse.move(bar.x + bar.width / 2, bar.y + 12);
      await page.mouse.down();
      await page.mouse.move(bar.x + bar.width / 2 + 25, bar.y + 12, {
        steps: 8,
      });
      await page.mouse.up();
      await saved();
      const moved = read().marks.find((m) => m.kind === "comment");
      assert(moved.source_start > 7);
      const edge = await page.locator(".bar.comment .edge.end").boundingBox();
      await page.mouse.move(edge.x + 6, edge.y + 12);
      await page.mouse.down();
      await page.mouse.move(edge.x + 26, edge.y + 12, { steps: 8 });
      await page.mouse.up();
      await saved();
      assert(
        read().marks.find((m) => m.kind === "comment").source_end >
          moved.source_end,
      );
      await page.locator("#undo").click();
      await saved();
      assert.equal(
        read().marks.find((m) => m.kind === "comment").source_end,
        moved.source_end,
      );
      await page.locator("#redo").click();
      await saved();
      // Opposite decisions are rejected without leaving the project unsavable.
      await draw(0.5, 1.5);
      await page.locator("#negative").click();
      assert(await page.locator("#error").isVisible());
      await dismiss();
      assert.equal(read().marks.length, 3);
      await draw(1, 3);
      await page.locator("#item-text").fill("Overlapping neutral direction");
      await page.locator("#item-text").press("Enter");
      await saved();
      assert.equal(
        new Set(
          await page
            .locator(".bar")
            .evaluateAll((nodes) => nodes.map((n) => n.style.top)),
        ).size,
        2,
      );
      // Transcript click opens the same range editor; an empty selection is discarded.
      await page.locator(".passage").first().click();
      await page.locator("#comment-popover").waitFor({ state: "visible" });
      await dismiss();
      await page.locator(".bar.good").click();
      assert.equal(
        await page.locator("#positive").getAttribute("aria-pressed"),
        "true",
      );
      await page.locator("#positive").click();
      await saved();
      assert.equal(read().marks[0].kind, "comment");
      await page.locator("#positive").click();
      await saved();
      assert.deepEqual(await geometry(), initialGeometry);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
      );
      await page.screenshot({
        path: root + `/browser-tests/video-${i}-desktop.png`,
        fullPage: true,
      });
      await dismiss();
      await page.reload();
      await page.waitForSelector(".bar");
      assert.equal(await page.locator(".bar").count(), 4);
      await page.setViewportSize({ width: 800, height: 700 });
      await page.locator(".bar.good").click();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
      );
      const pop = await page.locator("#comment-popover").boundingBox();
      assert(
        pop.x >= 0 &&
          pop.y >= 0 &&
          pop.x + pop.width <= 800 &&
          pop.y + pop.height <= 700,
      );
      await page.screenshot({
        path: root + `/browser-tests/video-${i}-narrow.png`,
        fullPage: true,
      });
      await dismiss();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator("#export-button").click();
      await page.locator("#render-cut").check();
      await page.locator('#export-form button[type="submit"]').click();
      await page.waitForFunction(
        () =>
          !document.querySelector("#export-result").hidden &&
          !document.querySelector("#export-button").disabled,
        null,
        { timeout: 120000 },
      );
      assert.equal(
        await page.locator("#error").isVisible(),
        false,
        await page.locator("#error").textContent(),
      );
      results.push({
        video: i,
        workspace,
        export: await page.locator("#export-result").textContent(),
        marks: read().marks.length,
        stableLayout: true,
      });
    }
    // Opening old rectangle annotations must neither hide nor rewrite their data.
    const legacy = fixtureEvidence.videos[0].workspace,
      before = JSON.parse(fs.readFileSync(legacy + "/review.json"));
    await page
      .locator(
        (await page.locator("#empty").isVisible()) ? "#begin" : "#open-button",
      )
      .click();
    await page.locator("#path").fill(legacy + "/review.json");
    if (!(await page.locator("details").evaluate((e) => e.open)))
      await page.locator("summary").click();
    await page.locator("#workspace-path").fill("");
    await page.locator("#transcript-path").fill("");
    await page.locator("#prepare").click();
    await page.waitForTimeout(1200);
    assert.equal(
      await page.locator(".bar").count(),
      before.marks.length + before.objects.length,
    );
    for (const obj of before.objects)
      assert(await page.locator(`.bar[data-id="${obj.id}"]`).count());
    assert.deepEqual(
      JSON.parse(fs.readFileSync(legacy + "/review.json")).objects,
      before.objects,
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      root + "/browser-tests/ui-evidence.json",
      JSON.stringify(
        {
          passed: true,
          interface: "Compact comment workspace",
          errors,
          results,
          legacyObjectsPreserved: true,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
