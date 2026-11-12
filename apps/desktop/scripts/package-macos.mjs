#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { packager } from "@electron/packager";
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const get = (name) => {
  const i = process.argv.indexOf("--" + name);
  if (i < 0 || !process.argv[i + 1]) throw Error("Required: --" + name);
  return path.resolve(process.argv[i + 1]);
};
const out = get("output"),
  sdk = get("sdk"),
  cache = get("pub-cache"),
  media = get("media-bin");
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw Error("Build on an Apple Silicon Mac");
if (out === repo || out.startsWith(repo + path.sep))
  throw Error("Output must be outside the checkout");
const run = (cmd, args, cwd = repo) =>
  execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
const dirty = !!run("git", ["status", "--porcelain"]).trim();
if (dirty && !process.argv.includes("--development"))
  throw Error(
    "Commit the reviewed source first, or use --development for an unreleasable candidate",
  );
const flutter = "abaf9c523780a608bd46686fd5e53740a07077f8",
  fluvie = "10e442c1bb469118516df3335547f85ec92155e6";
if (
  JSON.parse(fs.readFileSync(path.join(sdk, "bin/cache/flutter.version.json")))
    .frameworkRevision !== flutter
)
  throw Error("Flutter revision mismatch");
if (
  fs
    .readFileSync(path.join(sdk, "bin/cache/cmrx-test-port-patch"), "utf8")
    .trim() !== flutter
)
  throw Error("Run prepare-macos-sdk first");
for (const name of ["ffmpeg", "ffprobe"]) {
  const file = path.join(media, name);
  const linked = run("otool", ["-L", file])
    .split("\n")
    .slice(1)
    .filter((x) => x.trim());
  if (linked.some((x) => !/^\s+\/(System\/|usr\/lib\/)/.test(x)))
    throw Error(name + " has non-system dependencies");
  if (!run("file", [file]).includes("arm64"))
    throw Error(name + " must support Apple Silicon");
}
const mediaBuild = path.resolve(media, "../..");
const mediaManifest = JSON.parse(
  fs.readFileSync(path.join(mediaBuild, "manifest.json")),
);
for (const name of ["ffmpeg", "ffprobe"])
  if (
    createHash("sha256")
      .update(fs.readFileSync(path.join(media, name)))
      .digest("hex") !== mediaManifest[name]?.sha256
  )
    throw Error("Media build receipt mismatch: " + name);
const staging = path.join(out, "staging");
if (fs.existsSync(staging)) throw Error("Choose a new output directory");
fs.mkdirSync(staging, { recursive: true });
const copy = (src, dest) => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  run("/bin/cp", ["-cR", src, dest]);
};
const files = run("git", [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
]).split("\0");
const prefixes = [
  "apps/desktop/src/",
  "apps/desktop/resources/",
  "apps/desktop/skills/",
  "apps/desktop/templates/",
  "components/",
  ".skills/",
  "scripts/",
  "video_tools/",
  "flow/",
  "docs/",
];
for (const name of new Set(files)) {
  if (
    !name ||
    !(
      prefixes.some((p) => name.startsWith(p)) ||
      [
        "LICENSE",
        "THIRD_PARTY.md",
        "apps/desktop/package.json",
        "apps/desktop/package-lock.json",
        "apps/local-editor/package.json",
        "apps/local-editor/package-lock.json",
      ].includes(name)
    )
  )
    continue;
  const source = path.join(repo, name);
  if (fs.lstatSync(source).isSymbolicLink())
    throw Error("No source symlinks: " + name);
  if (fs.statSync(source).isFile()) copy(source, path.join(staging, name));
}
run("npm", ["--prefix", "apps/local-editor", "run", "build"]);
copy(
  path.join(repo, "apps/local-editor/dist"),
  path.join(staging, "apps/local-editor/dist"),
);
for (const app of ["desktop", "local-editor"])
  run(
    "npm",
    ["ci", "--omit=dev", "--ignore-scripts"],
    path.join(staging, "apps", app),
  );
const version = JSON.parse(
  fs.readFileSync(path.join(repo, "apps/desktop/package.json")),
).version;
fs.writeFileSync(
  path.join(staging, "package.json"),
  JSON.stringify({
    name: "cmrx-chat-editor",
    productName: "CMRX Chat Editor",
    version,
    main: "apps/desktop/src/desktop.cjs",
  }),
);
const runtime = path.join(staging, "runtime");
fs.mkdirSync(runtime);
copy(sdk, path.join(runtime, "sdk"));
// Ship only public SDK/runtime material, never builder Git config or credentials.
for (const name of [".git", ".dart_tool", "examples", "dev", "docs", "engine"])
  fs.rmSync(path.join(runtime, "sdk", name), { recursive: true, force: true });
const fluvieSource = path.join(cache, "git", "fluvie-" + fluvie);
for (const name of ["packages", "LICENSE", "pubspec.yaml", "pubspec.lock"])
  if (fs.existsSync(path.join(fluvieSource, name)))
    copy(
      path.join(fluvieSource, name),
      path.join(runtime, "cache/git", "fluvie-" + fluvie, name),
    );
for (const name of ["hosted/pub.dev", "hosted-hashes/pub.dev"])
  copy(path.join(cache, name), path.join(runtime, "cache", name));
fs.rmSync(path.join(runtime, "cache/hosted/pub.dev/.cache"), {
  recursive: true,
  force: true,
});
copy(media, path.join(runtime, "bin"));
copy(path.join(mediaBuild, "licenses"), path.join(runtime, "licenses/media"));
copy(
  path.join(mediaBuild, "manifest.json"),
  path.join(runtime, "media-build.json"),
);
copy(
  path.join(mediaBuild, "cmrx-media-corresponding-source.tar.gz"),
  path.join(out, "cmrx-media-corresponding-source.tar.gz"),
);
const sha = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = {
  schemaVersion: 1,
  platform: "darwin",
  arch: "arm64",
  minimumOS: "15.0",
  flutter,
  fluvie,
  electron: "43.0.0",
  source: run("git", ["rev-parse", "HEAD"]).trim(),
  dirty,
  media: Object.fromEntries(
    ["ffmpeg", "ffprobe"].map((n) => [
      n,
      {
        unsignedSha256: sha(path.join(media, n)),
        version: run(path.join(media, n), ["-version"]).split("\n")[0],
      },
    ]),
  ),
};
fs.writeFileSync(
  path.join(runtime, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const apps = await packager({
  icon: path.join(repo, "apps/desktop/resources/app-icon.icns"),
  dir: staging,
  out: path.join(out, "app"),
  name: "CMRX Chat Editor",
  appBundleId: "dev.cmrx.chat-editor",
  appVersion: version,
  buildVersion: version,
  platform: "darwin",
  arch: "arm64",
  electronVersion: "43.0.0",
  asar: false,
  prune: false,
  derefSymlinks: false,
  osxUniversal: false,
  appCategoryType: "public.app-category.video",
  darwinDarkModeSupport: true,
  extendInfo: {
    LSMinimumSystemVersion: "15.0",
    NSCameraUsageDescription: "Record camera footage for your video project when you choose camera recording.",
    NSMicrophoneUsageDescription: "Record microphone audio for your video project when you choose audio recording.",
  },
  download: {
    checksums: {
      "electron-v43.0.0-darwin-arm64.zip":
        "e6994f68dba65a6371577eaf68ac69a5858d2c52371869837c64affc6157eca5",
    },
  },
});
// The packager may absolutize source symlinks even with dereferencing disabled.
// Relocate those links into the shipped bundle and keep framework links relative.
const bundle = path.join(apps[0], "CMRX Chat Editor.app");
const iconName = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIconFile", path.join(bundle, "Contents/Info.plist")]).trim();
const installedIcon = path.join(bundle, "Contents/Resources", iconName.endsWith(".icns") ? iconName : iconName + ".icns");
if (sha(installedIcon) !== sha(path.join(repo, "apps/desktop/resources/app-icon.icns")))
  throw Error("Packaged launcher icon differs from approved CMRX artwork");
function relocateLinks(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) relocateLinks(file);
    else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(file);
      if (target.startsWith(staging + path.sep)) {
        const shipped = path.join(bundle, "Contents/Resources/app", path.relative(staging, target));
        fs.unlinkSync(file);
        fs.symlinkSync(path.relative(path.dirname(file), shipped), file);
      }
    }
  }
}
relocateLinks(bundle);
fs.writeFileSync(
  path.join(out, "candidate.json"),
  JSON.stringify(
    {
      ...manifest,
      version,
      bundleId: "dev.cmrx.chat-editor",
      app: path.join(apps[0], "CMRX Chat Editor.app"),
    },
    null,
    2,
  ) + "\n",
);
console.log(path.join(out, "candidate.json"));
