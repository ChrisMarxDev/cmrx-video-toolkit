import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";

const quote = (value) => JSON.stringify(value);
const canonical = (value) => fs.realpathSync(value);
const sourceRoots = [
  "lib",
  "assets",
  "shaders",
  "test",
  "tools",
  "skills",
  "script.md",
  "pubspec.yaml",
];
function regularTree(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
    throw Error("Worker inputs must be regular files and directories");
  return stat.isFile()
    ? [root]
    : fs
        .readdirSync(root)
        .flatMap((name) => regularTree(path.join(root, name)));
}

/** Fail-closed Seatbelt worker. No host environment, account directories or external network. */
export function macosProfile({
  readable,
  writable,
  protectedPaths = [],
  home,
  temporary,
  port,
}) {
  return `(version 1)
(deny default)
(allow process-exec process-fork)
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/"))
(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/usr/bin") (subpath "/bin") (subpath "/dev") (literal "/private/etc/localtime") (literal "/private/etc/hosts"))
(allow file-write* (literal "/dev/null") (literal "/dev/tty"))
${readable.map((p) => `(allow file-read* (subpath ${quote(p)}))`).join("\n")}
${[...writable, home, temporary].map((p) => `(allow file-read* file-write* (subpath ${quote(p)}))`).join("\n")}
${protectedPaths.map((p) => `(deny file-write* (subpath ${quote(p)}))`).join("\n")}
; Flutter tester requires its private local WebSocket; no other network endpoints.
${port ? `(allow network-bind (local ip "localhost:${port}"))\n(allow network-inbound (local ip "localhost:${port}"))\n(allow network-outbound (remote ip "localhost:${port}"))` : ""}
`;
}

export class MacOSWorker {
  constructor({ owner, toolkit, appSkills }) {
    Object.assign(this, {
      owner,
      toolkit: canonical(toolkit),
      appSkills: canonical(appSkills),
    });
  }
  async exec(argv, original, cwd, timeout, readOnlySource) {
    const owner = this.owner,
      worker = canonical(owner.worker);
    const work = path.join(
      worker,
      "projects",
      createHash("sha256").update(original).digest("hex").slice(0, 20),
    );
    fs.mkdirSync(work, { recursive: true });
    const home = path.join(worker, "home"),
      temporary = path.join(worker, "tmp");
    for (const dir of [home, temporary]) fs.mkdirSync(dir, { recursive: true });
    const mapping = [
      ["/runtime/fluvie", path.join(worker, "fluvie")],
      ["/toolkit", this.toolkit],
      ["/app-skills", this.appSkills],
      ["/sdk", path.join(worker, "sdk")],
      ["/cache", path.join(worker, "cache")],
      ["/work", work],
      ...(owner.skillRoot ? [["/skills", canonical(owner.skillRoot)]] : []),
    ];
    const paths = new Map(mapping);
    const translate = (text) =>
      text.replace(
        /\/(?:runtime\/fluvie|toolkit|app-skills|sdk|cache|work|skills)(?=\/|$|[^a-zA-Z0-9_-])/g,
        (key) => paths.get(key) || key,
      );
    const inputs = [
      ...sourceRoots,
      "project.json",
      ...fs
        .readdirSync(original)
        .filter((n) =>
          /^(overlay.*|cmrx_.*|timeline_thumbnails)\.dart$/.test(n),
        ),
    ];
    for (const name of inputs) {
      const src = path.join(original, name),
        dest = path.join(work, name);
      if (!fs.existsSync(src)) {
        fs.rmSync(dest, { recursive: true, force: true });
        continue;
      }
      const files = regularTree(src);
      fs.rmSync(dest, { recursive: true, force: true });
      for (const file of files) {
        const target = path.join(work, path.relative(original, file));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (/\.(dart|yaml)$/.test(file))
          fs.writeFileSync(target, translate(fs.readFileSync(file, "utf8")));
        else fs.copyFileSync(file, target);
      }
    }
    const media = path.join(owner.workspace, "media");
    if (fs.existsSync(media)) {
      regularTree(media);
      if (!fs.existsSync(path.join(work, "media")))
        fs.symlinkSync(canonical(media), path.join(work, "media"));
    }
    const launchers = path.join(worker, "bin");
    fs.mkdirSync(launchers, { recursive: true });
    fs.writeFileSync(
      path.join(launchers, "dart"),
      '#!/bin/sh\nexec "$FLUTTER_ROOT/bin/cache/dart-sdk/bin/dart" "$@"\n',
      { mode: 0o700 },
    );
    fs.writeFileSync(
      path.join(launchers, "flutter"),
      '#!/bin/sh\nexec "$FLUTTER_ROOT/bin/cache/dart-sdk/bin/dart" "$FLUTTER_ROOT/bin/cache/flutter_tools.snapshot" "$@"\n',
      { mode: 0o700 },
    );
    const bin = process.env.CHAT_RUNTIME_BIN;
    const readable = [
      launchers,
      work,
      this.toolkit,
      this.appSkills,
      ...(bin ? [canonical(bin)] : []),
      ...(owner.skillRoot ? [canonical(owner.skillRoot)] : []),
      ...(fs.existsSync(media) ? [canonical(media)] : []),
    ];
    const protectedPaths = [
      path.join(work, "project.json"),
      ...(readOnlySource ? inputs.map((n) => path.join(work, n)) : []),
    ];
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const chosen = server.address().port;
        server.close(() => resolve(chosen));
      });
    });
    const profile = macosProfile({
      port,
      readable,
      writable: [
        work,
        ...["sdk", "cache", "fluvie"].map((n) => path.join(worker, n)),
      ],
      protectedPaths,
      home,
      temporary,
    });
    const env = {
      HOME: home,
      TMPDIR: temporary + "/",
      PUB_CACHE: path.join(worker, "cache"),
      PATH: [launchers, bin, "/usr/bin", "/bin"].filter(Boolean).join(":"),
      LANG: "en_US.UTF-8",
      CI: "true",
      CMRX_TEST_PORT: String(port),
      FLUTTER_SUPPRESS_ANALYTICS: "true",
      FLUTTER_ROOT: path.join(worker, "sdk"),
      DEVELOPER_DIR: "/cmrx-no-developer-tools",
    };
    try {
      const result = await owner.host(
        "/usr/bin/sandbox-exec",
        ["-p", profile, ...argv.map(translate)],
        timeout,
        { cwd: translate(cwd), env },
      );
      if (!readOnlySource && cwd === "/work") {
        // Explicit editor_exec writes stay within the same source roots as editor_write.
        // Persist portable virtual paths, never machine-specific SDK/worker paths.
        const reverse = (text) =>
          [...mapping]
            .sort((a, b) => b[1].length - a[1].length)
            .reduce(
              (value, [virtual, actual]) => value.replaceAll(actual, virtual),
              text,
            );
        for (const root of sourceRoots)
          for (const file of regularTree(path.join(work, root))) {
            const dest = path.join(original, path.relative(work, file));
            owner.file(path.relative(owner.workspace, dest), true);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const bytes = /\.(dart|yaml)$/.test(file)
              ? Buffer.from(reverse(fs.readFileSync(file, "utf8")))
              : fs.readFileSync(file);
            if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(bytes))
              fs.writeFileSync(dest, bytes);
          }
      }
      return result;
    } finally {
      // Copy only regular generated artifacts. Never expose service receipts or write original media.
      for (const name of fs.readdirSync(work)) {
        if (
          !/\.(mp4|webm|png|render\.json)$/.test(name) &&
          ![
            "graphics-thumbnails.json",
            "graphics-thumbnails-error.txt",
          ].includes(name)
        )
          continue;
        const file = path.join(work, name),
          stat = fs.lstatSync(file);
        if (stat.isFile() && !stat.isSymbolicLink()) {
          const dest = path.join(original, name);
          // Refuse even dangling symlinks when opening the original destination.
          const fd = fs.openSync(
            dest,
            fs.constants.O_WRONLY |
              fs.constants.O_CREAT |
              fs.constants.O_TRUNC |
              fs.constants.O_NOFOLLOW,
            0o600,
          );
          try {
            fs.writeFileSync(fd, fs.readFileSync(file));
          } finally {
            fs.closeSync(fd);
          }
        }
      }
    }
  }
}
