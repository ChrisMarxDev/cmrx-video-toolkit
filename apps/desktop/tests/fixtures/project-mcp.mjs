import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
const server = new Server(
  { name: "project-agent-fixture", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_info",
      description: "Read fixture info",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    },
    {
      name: "publish_item",
      description: "Fixture side effect",
      inputSchema: {
        type: "object",
        properties: { title: { type: "string" } },
      },
      annotations: { readOnlyHint: false },
    },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  if (params.name === "publish_item")
    fs.appendFileSync(
      "fixture-actions.jsonl",
      JSON.stringify(params.arguments) + "\n",
    );
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          name: params.name,
          secretEcho: process.env.API_KEY,
          url: "https://example.com/result/123",
        }),
      },
    ],
  };
});
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: "fixture://brief", name: "Brief", mimeType: "text/plain" },
  ],
}));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [],
}));
server.setRequestHandler(ReadResourceRequestSchema, async () => ({
  contents: [{ uri: "fixture://brief", text: "Project brief from fixture" }],
}));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "brief",
      description: "Reusable brief",
      arguments: [{ name: "theme", required: true }],
    },
  ],
}));
server.setRequestHandler(GetPromptRequestSchema, async ({ params }) => ({
  messages: [
    {
      role: "user",
      content: { type: "text", text: "Brief: " + params.arguments?.theme },
    },
  ],
}));
await server.connect(new StdioServerTransport());
