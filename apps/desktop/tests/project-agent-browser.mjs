import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { startApp } from "../src/server.mjs";
const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
const results =
  process.env.EDITOR_RESULTS || path.join(cache, "cmrx-project-agent-ui");
fs.mkdirSync(results, { recursive: true });
const playwright = await import(
  pathToFileURL(
    process.env.EDITOR_PLAYWRIGHT ||
      path.join(
        os.homedir(),
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js",
      ),
  ).href
);
const { chromium } = playwright.default || playwright;
const workspace = fs.mkdtempSync(path.join(cache, "cmrx-project-agent-ui-"));
fs.mkdirSync(path.join(workspace, ".editor"));
fs.writeFileSync(
  path.join(workspace, ".editor/onboarding.json"),
  JSON.stringify({ complete: true }),
);
let app, browser, tool, emit;
let writes = 0,
  seenKey;
const errors = [];
const server = createServer(async (req, res) => {
  for await (const _ of req) {
  }
  seenKey = req.headers.authorization;
  if (req.method === "POST") writes++;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true, url: "https://example.com/result" }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  app = await startApp({
    workspace,
    agentRoot: path.join(workspace, ".test-agent"),
    home: path.join(workspace, ".test-codex"),
    claudeHome: path.join(workspace, ".test-claude"),
    providerFactory: ({ onEvent, onTool }) => {
      tool = onTool;
      emit = onEvent;
      return {
        async start() {},
        async account() {
          return { connected: true };
        },
        async models() {
          return [{ id: "test", name: "Test", isDefault: true }];
        },
        async prompt() {},
        close() {},
      };
    },
  });
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  await page.locator("#start-screen").waitFor({ state: "hidden" });
  await page.locator("#settings-open").click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByLabel("Key name", { exact: true }).fill("Test key");
  await page
    .getByLabel("Secret key", { exact: true })
    .fill("ui-private-token-123456789");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await page
    .locator("#secret-list")
    .getByText("Test key", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Secret key", { exact: true }).inputValue(),
    "",
  );
  await page.locator('#connection-form [name="name"]').fill("Generic API");
  await page.locator('#connection-form [name="type"]').selectOption("http");
  await page
    .getByLabel("Address", { exact: true })
    .fill(`http://127.0.0.1:${server.address().port}/api`);
  await page
    .locator('#connection-form [name="secretId"]')
    .selectOption({ label: "Test key" });
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  const connection = page.locator("#connection-list .connection-card");
  await connection.getByText("Generic API", { exact: true }).waitFor();
  await connection.getByRole("button", { name: "Test", exact: true }).click();
  await connection.getByText("Connected", { exact: true }).waitFor();
  assert.equal(seenKey, "Bearer ui-private-token-123456789");
  assert(
    !(await page
      .locator("body")
      .innerText()
      .then((s) => s.includes("ui-private-token"))),
  );
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByLabel("Project instructions", { exact: true })
    .fill("Use German. Preserve original audio.");
  await page
    .getByLabel("Project memory", { exact: true })
    .fill("The audience is developers.");
  await page
    .getByRole("button", { name: "Save project notes", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector("#settings-error").textContent,
  );
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  const skill = page
    .locator(".skill-card")
    .filter({ hasText: "video-project" });
  await skill.locator("summary").click();
  await skill
    .getByRole("button", { name: "Read instructions", exact: true })
    .click();
  await skill
    .locator("pre")
    .getByText(/Use the desktop video app/)
    .waitFor();
  await page.screenshot({ path: path.join(results, "skills.png") });
  await page.locator("#settings-close").click();
  await page.locator("#connect-provider").click();
  assert.equal(
    await page.locator('[data-tab="accounts"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#settings-close").click();
  const post = (route, body = {}) =>
    fetch(app.url + "/chat/" + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: JSON.stringify(body),
    });
  await post("login", { provider: "chatgpt" });
  await post("send", { text: "Acceptance test" });
  const id = app.agent.connections.list()[0].id;
  const action = tool("connection_request", {
    connection: id,
    method: "POST",
    route: "publish",
    body: { title: "Preview" },
  });
  await page.getByRole("button", { name: "Run action", exact: true }).waitFor();
  assert.equal(writes, 0);
  await page.screenshot({ path: path.join(results, "approval.png") });
  await page.getByRole("button", { name: "Run action", exact: true }).click();
  await action;
  assert.equal(writes, 1);
  await tool("workspace_write", {
    path: "tools/counter.html",
    content:
      '<!doctype html><html><body><h1>Caption tool</h1><button id="count" onclick="this.textContent=Number(this.textContent)+1">0</button><a id="choices" download="choices.json" href="data:application/json,%7B%22keep%22%3Atrue%7D">Export choices</a></body></html>',
  });
  const link = await tool("tool_open", {
    path: "tools/counter.html",
    title: "Caption tool",
  });
  await page
    .locator("#agent-actions")
    .getByRole("link", { name: "Caption tool", exact: true })
    .click();
  const frame = page.frameLocator("#tool-frame");
  await frame.getByRole("heading", { name: "Caption tool" }).waitFor();
  await frame.locator("#count").click();
  assert.equal(await frame.locator("#count").innerText(), "1");
  const downloadEvent = page.waitForEvent("download", { timeout: 3000 });
  await frame.locator("#choices").click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "choices.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(), "utf8")), {
    keep: true,
  });
  assert.equal(
    await frame.locator("body").evaluate(() => {
      try {
        void window.parent.document.body;
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  assert.equal(
    await frame.locator("body").evaluate(async () => {
      try {
        await fetch("/chat/state");
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  const toolURL = await page.locator("#tool-frame").getAttribute("src");
  assert(toolURL.includes("/tool-frame?ticket="));
  assert(!toolURL.includes(app.token));
  const response = await fetch(app.url + toolURL);
  assert.match(
    response.headers.get("content-security-policy"),
    /sandbox allow-scripts/,
  );

  assert.equal(
    await page
      .locator("#tool-frame")
      .evaluate((el) => el.getAttribute("sandbox")),
    "allow-scripts allow-downloads",
  );
  await page.screenshot({ path: path.join(results, "tool.png") });
  await page.locator("#tool-close").click();
  await emit({
    type: "delta",
    text: `[Docs](https://example.com/docs) [My tool](tool:${link.id}) [Unsafe](javascript:alert(1))`,
    itemId: "reply",
  });
  await emit({ type: "complete" });
  await page
    .locator(".message.assistant")
    .getByRole("link", { name: "Docs", exact: true })
    .waitFor();
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
  await page
    .locator(".message.assistant")
    .getByRole("link", { name: "My tool", exact: true })
    .click();
  await frame.getByRole("heading", { name: "Caption tool" }).waitFor();
  assert.deepEqual(errors, []);
  assert.match(
    fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf8"),
    /Use German/,
  );
  assert.match(
    fs.readFileSync(path.join(workspace, "memory.md"), "utf8"),
    /developers/,
  );
  console.log(
    "PASS: settings keys and generic API, project notes, skill reading, confirmed external action, interactive in-app tool, safe external/tool links; no browser errors.",
  );
} catch (e) {
  console.error(e);
  throw e;
} finally {
  await browser?.close();
  await app?.close();
  await new Promise((r) => server.close(r));
  fs.rmSync(workspace, { recursive: true, force: true });
}
