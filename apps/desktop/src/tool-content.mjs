import { createHash } from "node:crypto";
import { tools } from "./tools.mjs";
import { agentInstructions } from "./agent-instructions.mjs";
export function toolContent(value) {
  if (!Array.isArray(value?.content))
    return [{ type: "text", text: JSON.stringify(value) }];
  return value.content.map((c) =>
    c.type === "image" &&
    /^image\/(png|jpeg|webp)$/.test(c.mimeType) &&
    typeof c.data === "string" &&
    c.data.length < 6000000
      ? { type: "image", mimeType: c.mimeType, data: c.data }
      : c.type === "text"
        ? { type: "text", text: String(c.text) }
        : { type: "text", text: JSON.stringify(c) },
  );
}
export function codexContent(value) {
  return toolContent(value).map((c) =>
    c.type === "image"
      ? { type: "inputImage", imageUrl: `data:${c.mimeType};base64,${c.data}` }
      : { type: "inputText", text: c.text },
  );
}
export const toolVersion = createHash("sha256")
  .update(JSON.stringify(tools))
  .update(agentInstructions)
  .digest("hex");
