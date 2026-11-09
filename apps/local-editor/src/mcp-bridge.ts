import { App } from "@modelcontextprotocol/ext-apps";
// Also upgrade already-running adapters whose resource still points at the regular page.
const frame = document.querySelector("iframe");
if (frame) {
  const url = new URL(frame.src);
  if (url.pathname === "/") {
    url.pathname = "/embed";
    frame.src = url.href;
  }
}
const app = new App(
  { name: "cmrx-local-editor", version: "0.1.0" },
  {},
  { autoResize: false },
);
app
  .connect()
  .then(() => app.sendSizeChanged({ height: 640 }))
  .catch((error) => {
    console.warn("MCP host bridge unavailable", error.message);
  });
