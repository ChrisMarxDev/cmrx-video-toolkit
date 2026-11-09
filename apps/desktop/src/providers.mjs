import { ClaudeProvider } from "./claude.mjs";
import { CodexProvider } from "./codex.mjs";
/**
 * A provider owns authentication and native conversation IDs, never video state.
 * start(), account(), models(), login(), logout(), prompt(text, editorContext, selection), stop(), close().
 * Events: delta {text}, activity {text}, complete {error?}, error {message}, accountChanged.
 * Tools execute through onTool(name,args); provider-specific protocol stays in its adapter.
 * Claude Code and Codex share the broker tools; further adapters register here.
 */
export const providers = new Map([
  ["chatgpt", (options) => new CodexProvider(options)],
  ["claude", (options) => new ClaudeProvider(options)],
]);
export function createProvider(id, options) {
  const factory = providers.get(id);
  if (!factory) throw Error("Provider not installed: " + id);
  return factory(options);
}
