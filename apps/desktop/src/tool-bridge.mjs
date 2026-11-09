// Private stdio MCP transport for the unmodified Claude Code process.
import fs from "node:fs";
import { createInterface } from "node:readline";
import { toolContent } from "./tool-content.mjs";
import { tools } from "./tools.mjs";
const connection = JSON.parse(
  fs.readFileSync(process.env.CHAT_EDITOR_CONNECTION),
);
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
createInterface({ input: process.stdin }).on("line", async (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.id === undefined) return;
  try {
    let result;
    if (m.method === "initialize")
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "local-video-editor", version: "0.1.0" },
      };
    else if (m.method === "ping") result = {};
    else if (m.method === "tools/list")
      result = {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      };
    else if (m.method === "tools/call") {
      if (!tools.some((t) => t.name === m.params?.name))
        throw Error("Unknown editor tool");
      const r = await fetch(connection.url + "/chat/tool", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + connection.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: m.params.name,
          args: m.params.arguments || {},
        }),
      });
      const value = await r.json();
      result = {
        content: toolContent(value),
        ...(!r.ok ? { isError: true } : {}),
      };
    } else throw Error("Unsupported MCP method");
    send({ jsonrpc: "2.0", id: m.id, result });
  } catch (e) {
    send({
      jsonrpc: "2.0",
      id: m.id,
      error: { code: -32603, message: e.message },
    });
  }
});
