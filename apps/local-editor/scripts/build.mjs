import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist/public", { recursive: true });
await Promise.all([
  build({
    entryPoints: ["src/mcp-bridge.ts"],
    outfile: "dist/mcp-bridge.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
  }),
  build({
    entryPoints: ["src/server.ts"],
    outfile: "dist/server.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/app.tsx"],
    outfile: "dist/public/app.js",
    bundle: true,
    format: "esm",
    target: "es2022",
    jsx: "automatic",
    sourcemap: true,
    external: ["/Fraunces.ttf"],
  }),
  build({
    entryPoints: ["src/transcript.ts"],
    outfile: "dist/transcript.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: ["src/timeline.ts"],
    outfile: "dist/timeline.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: ["src/model.ts"],
    outfile: "dist/model.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
]);
await copyFile("src/index.html", "dist/public/index.html");
await copyFile(
  "resources/fonts/Fraunces.ttf",
  "dist/public/Fraunces.ttf",
);
await copyFile(
  "resources/fonts/Fraunces-OFL.txt",
  "dist/public/Fraunces-OFL.txt",
);
