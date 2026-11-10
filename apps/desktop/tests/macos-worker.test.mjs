import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { macosProfile } from "../src/macos-worker.mjs";
import { releaseFor } from "../src/runtime-manager.mjs";
test("Mac provider artifacts use Darwin checksums and the matching companion", () => {
  for (const arch of ["arm64", "x64"]) {
    for (const provider of ["chatgpt", "claude"]) {
      const mac = releaseFor(provider, arch, "darwin"),
        linux = releaseFor(provider, arch, "linux");
      assert.match(mac.url, /darwin/);
      assert.notEqual(mac.checksum, linux.checksum);
      assert.match(mac.checksum, /^[a-f0-9]{64}$/);
      if (provider === "chatgpt") {
        assert.match(mac.companions[0].url, /apple-darwin/);
        assert.notEqual(
          mac.companions[0].checksum,
          linux.companions[0].checksum,
        );
      }
    }
  }
});
test(
  "native Mac containment denies account reads, original writes, network and unrelated output paths",
  { skip: process.platform !== "darwin" },
  async () => {
    const base = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "cmrx-seatbelt-")),
    );
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const work = path.join(base, "work"),
        account = path.join(base, "account"),
        original = path.join(base, "original");
      fs.mkdirSync(work);
      fs.mkdirSync(account);
      fs.writeFileSync(path.join(account, "token"), "fixture-secret");
      fs.writeFileSync(original, "original");
      const profile = macosProfile({
        readable: [original],
        writable: [work],
        home: work,
        temporary: work,
      });
      const run = (script) =>
        spawnSync(
          "/usr/bin/sandbox-exec",
          ["-p", profile, "/bin/sh", "-c", script],
          {
            cwd: work,
            env: { PATH: "/usr/bin:/bin", HOME: work },
            encoding: "utf8",
            timeout: 5000,
          },
        );
      assert.equal(run("echo ok > result").status, 0);
      assert.equal(run(`/bin/cat '${original}'`).stdout, "original");
      assert.notEqual(run(`/bin/cat '${account}/token'`).status, 0);
      assert.notEqual(run(`echo corrupt > '${original}'`).status, 0);
      assert.notEqual(run(`echo escape > '${base}/escape'`).status, 0);
      assert.equal(
        spawnSync("/usr/bin/nc", ["-G", "1", "-z", "127.0.0.1", String(port)])
          .status,
        0,
      );
      assert.notEqual(run(`/usr/bin/nc -G 1 -z 127.0.0.1 ${port}`).status, 0);
      const withPort = macosProfile({
        readable: [original],
        writable: [work],
        home: work,
        temporary: work,
        port,
      });
      assert.equal(
        spawnSync(
          "/usr/bin/sandbox-exec",
          [
            "-p",
            withPort,
            "/usr/bin/nc",
            "-G",
            "1",
            "-z",
            "127.0.0.1",
            String(port),
          ],
          { cwd: work, timeout: 3000 },
        ).status,
        0,
      );
      assert.equal(fs.readFileSync(original, "utf8"), "original");
      assert(!fs.existsSync(path.join(base, "escape")));
    } finally {
      server.close();
      fs.rmSync(base, { recursive: true, force: true });
    }
  },
);
test(
  "Mac worker persists authored source and refuses symlink artifact destinations",
  { skip: process.platform !== "darwin" },
  async () => {
    const base = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "cmrx-worker-copy-")),
    );
    try {
      const workspace = path.join(base, "workspace"),
        worker = path.join(base, "worker");
      for (const dir of [
        workspace,
        worker,
        ...["sdk", "cache", "fluvie"].map((n) => path.join(worker, n)),
      ])
        fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(path.join(workspace, "lib"));
      fs.writeFileSync(path.join(workspace, "lib", "main.dart"), "old");
      const { MacOSWorker } = await import("../src/macos-worker.mjs");
      const owner = {
        workspace,
        worker,
        file(relative) {
          assert(!relative.startsWith(".."));
        },
        async host(cmd, args, timeout, options) {
          const r = spawnSync(cmd, args, {
            ...options,
            timeout,
            encoding: "utf8",
          });
          if (r.status !== 0) throw Error(r.stderr);
          return r.stdout;
        },
      };
      const adapter = new MacOSWorker({
        owner,
        toolkit: workspace,
        appSkills: workspace,
      });
      await adapter.exec(
        ["/bin/sh", "-c", "echo authored > lib/new.dart"],
        workspace,
        "/work",
        5000,
        false,
      );
      assert.equal(
        fs.readFileSync(path.join(workspace, "lib/new.dart"), "utf8"),
        "authored\n",
      );
      const outside = path.join(base, "outside");
      fs.symlinkSync(outside, path.join(workspace, "output.png"));
      await assert.rejects(
        adapter.exec(
          ["/bin/sh", "-c", "echo frame > output.png"],
          workspace,
          "/work",
          5000,
          true,
        ),
      );
      assert(!fs.existsSync(outside));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  },
);
