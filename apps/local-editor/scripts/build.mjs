import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist/public", { recursive: true });
await Promise.all([
  build({
    entryPoints: ["src/playback-proxy.mjs"],
    outfile: "dist/playback-proxy.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
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
    // Desktop/review builds are user-facing. React's development JSX runtime
    // allocates debug tasks/stacks on every playback frame.
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        process.env.EDITOR_DEV === "1" ? "development" : "production",
      ),
    },
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
await copyFile("src/matrix-loader.css", "dist/public/matrix-loader.css");
await copyFile("src/index.html", "dist/public/index.html");
await copyFile("src/resize-handles.css", "dist/public/resize-handles.css");
await copyFile("resources/fonts/Fraunces.ttf", "dist/public/Fraunces.ttf");
await copyFile(
  "resources/fonts/Fraunces-OFL.txt",
  "dist/public/Fraunces-OFL.txt",
);

await copyFile("resources/ldrs/LICENSE", "dist/public/LDRS-LICENSE.txt");
