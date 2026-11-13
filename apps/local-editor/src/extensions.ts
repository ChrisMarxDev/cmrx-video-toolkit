import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { safeFile, type Extension } from "./render.js";
import { clone, type Project } from "./model.js";
export async function loadExtensions(roots: string[]): Promise<Extension[]> {
  const extensions: Extension[] = [];
  const ids = new Set<string>(),
    kinds = new Set(["video", "graphics"]),
    commands = new Set<string>();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const folder of fs.readdirSync(root).sort()) {
      const dir = path.join(root, folder),
        file = path.join(dir, "extension.json");
      if (!fs.existsSync(file)) continue;
      const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      if (
        manifest.apiVersion !== 1 ||
        !/^[\w-]{1,80}$/.test(manifest.id) ||
        ids.has(manifest.id) ||
        typeof manifest.kind !== "string" ||
        !/^[\w-]{1,80}$/.test(manifest.kind) ||
        kinds.has(manifest.kind) ||
        !Array.isArray(manifest.commands)
      )
        throw Error("Invalid, incompatible or duplicate extension ownership");
      const capabilities = manifest.capabilities ?? {
        render: 1,
        commands: 1,
        ...(manifest.browser ? { inspection: 1 } : {}),
      };
      if (
        !capabilities ||
        typeof capabilities !== "object" ||
        Array.isArray(capabilities) ||
        Object.entries(capabilities).some(
          ([name, version]) =>
            !["render", "commands", "inspection", "validation"].includes(
              name,
            ) || version !== 1,
        )
      )
        throw Error("Unsupported extension capabilities");
      for (const command of manifest.commands) {
        if (
          !command ||
          typeof command.id !== "string" ||
          !/^[\w-]{1,80}$/.test(command.id) ||
          commands.has(command.id) ||
          typeof command.label !== "string"
        )
          throw Error("Invalid or duplicate extension command");
        commands.add(command.id);
      }
      if (manifest.commands.length && !capabilities.commands)
        throw Error("Extension commands capability required");
      if (manifest.browser && !capabilities.inspection)
        throw Error("Extension inspection capability required");
      if (manifest.browser) safeFile(dir, manifest.browser);
      // These modules execute in-process with service privileges. They are trusted code.
      const worker = await import(
        pathToFileURL(safeFile(dir, manifest.worker)).href
      );
      for (const [cap, hook] of [
        ["render", "boxes"],
        ["commands", "command"],
        ["validation", "validateClip"],
      ])
        if (capabilities[cap] && typeof worker[hook] !== "function")
          throw Error(`Missing extension hook: ${hook}`);
      extensions.push({
        ...worker,
        dir,
        manifest: { ...manifest, capabilities },
      } as Extension);
      ids.add(manifest.id);
      kinds.add(manifest.kind);
    }
  }
  return extensions;
}
export function extensionHooks(extensions: Extension[]) {
  return {
    command(project: Project, name: string) {
      const ext = extensions.find((e) =>
        e.manifest.commands.some((c) => c.id === name),
      );
      if (!ext) throw Error("Unknown extension command");
      return ext.command(clone(project), name);
    },
    validate(project: Project) {
      for (const clip of project.clips) {
        const ext = extensions.find((e) => e.manifest.kind === clip.kind);
        if (ext?.manifest.capabilities?.validation && ext.validateClip)
          ext.validateClip(clone(clip));
      }
    },
  };
}
