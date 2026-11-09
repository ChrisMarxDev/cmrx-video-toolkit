import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-markdown-"));
let app, browser;
const markdown = `## Editing plan

A **bold _nested_** idea, *emphasis*, ~~removed~~ and \`inline code\`.

3. First step
   - Nested item
4. Second step

> A quoted note

| Clip | Status |
| :--- | ---: |
| Opening | **Ready** |

- [x] Checked
- [ ] Pending

---

\`\`\`js
const markup = '<img src=x onerror=alert(1)>';
\`\`\`

Fish &amp; chips

[Preview](artifact:render-1) and [Tool](tool:tool-1) and [Website](https://example.com/?x=1&y=2)

[Unsafe](javascript:alert(1)) [File](file:///etc/passwd) [Credentials](https://user:password@example.com)

<img src="https://tracking.invalid/pixel" onerror="window.injected=true">

![remote image](https://tracking.invalid/image.png)`;
try {
  fs.mkdirSync(root + "/.editor");
  fs.writeFileSync(
    root + "/.editor/onboarding.json",
    JSON.stringify({ complete: true }),
  );
  fs.writeFileSync(
    root + "/.editor/chat.json",
    JSON.stringify([
      { role: "assistant", text: markdown, provider: "chatgpt" },
    ]),
  );
  app = await startApp({
    workspace: root,
    autoPreview: false,
    providerFactory: ({ onEvent }) => ({
      async start() {},
      async account() {
        return { connected: true };
      },
      async prompt() {
        onEvent({
          type: "delta",
          itemId: "stream",
          text: "### Streamed\n\n```js\ncon",
        });
        await new Promise((r) => setTimeout(r, 100));
        onEvent({
          type: "delta",
          itemId: "stream",
          text: "st value = 1;\n```",
        });
        onEvent({ type: "complete" });
      },
      close() {},
    }),
  });
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 950 },
    }),
    errors = [],
    tracking = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("tracking.invalid")) tracking.push(r.url());
  });
  await page.goto(
    app.url +
      "/#" +
      new URLSearchParams({ token: app.token, editorToken: app.editorToken }),
  );
  const message = page.locator(".message.assistant .message-body").first();
  await message
    .getByRole("heading", { name: "Editing plan", exact: true })
    .waitFor();
  assert.equal(await message.locator("strong em").textContent(), "nested");
  assert.equal(await message.locator("ol").getAttribute("start"), "3");
  assert.equal(await message.locator("ol ul li").textContent(), "Nested item");
  assert.equal(
    await message.locator("blockquote").textContent(),
    "A quoted note",
  );
  assert.equal(
    await message.locator("table tbody td strong").textContent(),
    "Ready",
  );
  assert.equal(
    await message
      .getByRole("checkbox", { name: "Completed", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await message.locator("pre code").textContent(),
    "const markup = '<img src=x onerror=alert(1)>';",
  );
  assert((await message.textContent()).includes("Fish & chips"));
  assert.equal(await message.locator("[data-artifact]").count(), 0);
  assert.equal(
    await message.getByRole("link", { name: "Preview", exact: true }).count(),
    0,
  );
  assert.equal(
    await message
      .getByRole("link", { name: "Tool", exact: true })
      .getAttribute("data-tool"),
    "tool-1",
  );
  for (const name of ["Unsafe", "File", "Credentials"])
    assert.equal(
      await message.getByRole("link", { name, exact: true }).count(),
      0,
    );
  assert.equal(await message.locator("img,script").count(), 0);
  assert.deepEqual(tracking, []);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await fetch(app.url + "/chat/login", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + app.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider: "chatgpt" }),
  });
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Stream an example");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("heading", { name: "Streamed", exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".message-body pre code")].some(
      (c) => c.textContent === "const value = 1;",
    ),
  );
  await page.screenshot({ path: root + "/markdown.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: persisted and streamed Markdown, nested lists/emphasis, tables/tasks, code, entities, app links and XSS/no-image-fetch boundaries. Evidence " +
      root,
  );
} finally {
  await browser?.close();
  await app?.close();
}
