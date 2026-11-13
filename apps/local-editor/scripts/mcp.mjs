#!/usr/bin/env node
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
const root = fileURLToPath(new URL("../", import.meta.url));
export const resourceUri = "ui://cmrx-local-editor/workspace.html";
export function createEditorMcp(workspace) {
  const server = new McpServer({ name: "cmrx-local-editor", version: "0.1.0" });
  const connection = async () => {
    const c = JSON.parse(
      await fs.readFile(
        path.join(workspace, ".editor/connection.json"),
        "utf8",
      ),
    );
    const url = new URL(c.url);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.username ||
      url.password ||
      !/^[a-f0-9]{64}$/.test(c.token)
    )
      throw Error("Expected a running loopback editor workspace");
    return { ...c, url: url.origin };
  };
  const state = async () => {
    const c = await connection();
    const response = await fetch(c.url + "/api/state", {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw Error(`Editor returned HTTP ${response.status}`);
    return response.json();
  };
  registerAppTool(
    server,
    "open_editor",
    {
      description:
        "Open this running local JavaScript video workspace. Preview, timeline, comments, transcripts and layer controls edit the same revision-checked project.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri } },
    },
    async () => {
      try {
        const { project } = await state();
        return {
          content: [
            {
              type: "text",
              text: `${project.name} · revision ${project.revision}`,
            },
          ],
          structuredContent: { name: project.name, revision: project.revision },
        };
      } catch {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Editor unavailable. Start the configured workspace service first.",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "apply_editor_operations",
    {
      description:
        "Apply an atomic document batch through the running Workspace. One revision/undo step; source files and external actions are outside this transaction. Reuse operationId only for identical retries.",
      inputSchema: {
        revision: z.number().int(),
        operationId: z.string().optional(),
        label: z.string().optional(),
        operations: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
      },
    },
    async (args) => {
      const c = await connection();
      const response = await fetch(c.url + "/api/operations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...args, actor: "mcp" }),
      });
      const value = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(value) }],
        structuredContent: value,
        ...(!response.ok ? { isError: true } : {}),
      };
    },
  );
  server.registerTool(
    "get_editor_state",
    {
      description:
        "Read the current project, selection-independent document state and undo availability.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const value = await state();
      return {
        content: [{ type: "text", text: JSON.stringify(value) }],
        structuredContent: value,
      };
    },
  );
  registerAppResource(
    server,
    "Local editor",
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const c = await connection();
      const bridge = await fs.readFile(
        path.join(root, "dist/mcp-bridge.js"),
        "utf8",
      );
      const url = `${c.url}/embed#token=${c.token}`;
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{display:block;border:0;width:100%;height:640px}</style></head><body><iframe title="CMRX video editor" src="${url}" allow="autoplay; fullscreen; clipboard-write"></iframe><script>${bridge.replaceAll("</script", "<\\/script")}</script></body></html>`;
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                prefersBorder: false,
                csp: {
                  frameDomains: [c.url],
                  resourceDomains: [c.url],
                  connectDomains: [c.url],
                },
              },
            },
          },
        ],
      };
    },
  );
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const i = process.argv.indexOf("--workspace");
  const workspace = path.resolve(
    i >= 0
      ? process.argv[i + 1]
      : process.env.LOCAL_EDITOR_WORKSPACE ||
          path.join(root, "workspaces/demo"),
  );
  const server = createEditorMcp(workspace);
  await server.connect(new StdioServerTransport());
  process.once("SIGTERM", () => server.close());
  process.once("SIGINT", () => server.close());
}
