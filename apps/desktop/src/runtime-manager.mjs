import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

// Pin reviewed, protocol-tested releases. Never run a user's PATH installation.
export const releases = {
  chatgpt: {
    version: "0.166.0",
    darwin: {
      hashes: {
        arm64:
          "c48824462fc57681eafb0925d97b11b589010475613904f570b42fea53e240d5",
        x64: "db0c38713c36199b12e7c8d1629386c35a4ce8f99e1c9ce72f1725a74df67b57",
      },
      codeModeHashes: {
        arm64:
          "7abd50fe5f033495a7b693c45fb82dc57093a18f1c4ba3e8043577de46c5c7c5",
        x64: "b35c775d5e5f8d60d05e0de7154e5bbbf320b6d0e28a3237d42cc8a742ccaf65",
      },
    },
    codeModeHashes: {
      x64: "7588334fd47bc4003d970b70dfd4d1e4578491b1e9baa72976a4c2d7e97590da",
      arm64: "ac98d1f878e353a16cba711fd47bfef2f6c814109bdd819ee2b6b6d6a19701e7",
    },
    hashes: {
      x64: "a0bf572d2f93f056c6712a6da348e96078dc84f3885fd7be67807ef389cb3978",
      arm64: "94eb707605ec2646b2e05b7edf7c4e7b3ccf02b16237c34ae9beb8cfb7f810a9",
    },
  },
  claude: {
    version: "2.1.318",
    darwin: {
      hashes: {
        arm64:
          "677a2ea7bf576cedd20e191d973914ed8a41796f53a63b1923381ddc4d5b5e7d",
        x64: "ee9c8577a528aa8efa478bf552b17efa40bb58aa4981d2913c13d383a4d409a4",
      },
    },
    hashes: {
      x64: "708c77b204db30086ff6f1ed34577bda03e1be74ced80557cbf7b54249ebf0bd",
      arm64: "53a0d7e219d7b0804ecba5dbc002745e89f786cc946d2de85a6470d5b2d1fb06",
    },
  },
};
export function releaseFor(
  id,
  arch = process.arch,
  platform = process.platform,
) {
  const pinned = releases[id];
  const release =
    platform === "darwin" && pinned ? { ...pinned, ...pinned.darwin } : pinned;
  if (!["linux", "darwin"].includes(platform) || !release?.hashes[arch])
    throw Error(
      "This engine supports macOS and Linux on Intel/AMD or ARM64. Download the app for your device.",
    );
  const file = `codex-${arch === "x64" ? "x86_64" : "aarch64"}-${platform === "darwin" ? "apple-darwin" : "unknown-linux-musl"}`;
  return {
    version: release.version,
    checksum: release.hashes[arch],
    archive: id === "chatgpt",
    member: file,
    ...(id === "chatgpt"
      ? {
          companions: [
            {
              name: "codex-code-mode-host",
              archive: true,
              member: file.replace("codex-", "codex-code-mode-host-"),
              checksum: release.codeModeHashes[arch],
              url: `https://github.com/openai/codex/releases/download/rust-v${release.version}/${file.replace("codex-", "codex-code-mode-host-")}.tar.gz`,
            },
          ],
        }
      : {}),
    url:
      id === "chatgpt"
        ? `https://github.com/openai/codex/releases/download/rust-v${release.version}/${file}.tar.gz`
        : `https://downloads.claude.ai/claude-code-releases/${release.version}/${platform}-${arch}/claude`,
  };
}
const hash = (data) => createHash("sha256").update(data).digest("hex");
// Extract only the named regular file, without tar, a shell or archive paths.
function executableFromTar(archive, member) {
  const tar = gunzipSync(archive, { maxOutputLength: 600 * 1024 * 1024 });
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString().replace(/\0.*$/s, "");
    const size = parseInt(
      header.subarray(124, 136).toString().replace(/\0.*$/s, "").trim() || "0",
      8,
    );
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + 512 + size > tar.length
    )
      throw Error("The downloaded engine archive is incomplete. Please retry.");
    if (
      (name === member || name === "./" + member) &&
      [0, 48].includes(header[156])
    )
      return tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw Error("The downloaded engine archive is invalid. Please retry.");
}
export class RuntimeManager {
  constructor({
    root = path.join(os.homedir(), ".local/share/cmrx-chat-editor/runtimes"),
    fetchImpl = fetch,
    resolveRelease = releaseFor,
  } = {}) {
    Object.assign(this, { root, fetchImpl, resolveRelease });
    this.tasks = new Map();
  }
  prepare(id, onProgress = () => {}) {
    if (this.tasks.has(id)) return this.tasks.get(id).promise;
    const controller = new AbortController();
    const task = { controller };
    this.tasks.set(id, task);
    task.promise = this.install(id, onProgress, controller.signal).finally(() =>
      this.tasks.delete(id),
    );
    return task.promise;
  }
  async install(id, progress, signal) {
    const release = this.resolveRelease(id),
      dir = path.join(this.root, id, release.version + "-" + process.arch),
      executable = path.join(dir, id === "chatgpt" ? "codex" : "claude");
    await this.installArtifact(id, progress, signal, release, executable);
    for (const companion of release.companions || []) {
      signal.throwIfAborted();
      await this.installArtifact(
        id,
        progress,
        signal,
        companion,
        path.join(dir, companion.name),
      );
    }
    return executable;
  }
  async installArtifact(id, progress, signal, release, executable) {
    const dir = path.dirname(executable),
      receipt = executable + ".json";
    progress({ phase: "checking", text: "Preparing secure sign-in…" });
    try {
      const saved = JSON.parse(fs.readFileSync(receipt));
      if (
        saved.release === release.checksum &&
        hash(fs.readFileSync(executable)) === saved.binary
      ) {
        fs.chmodSync(executable, 0o700);
        return executable;
      }
    } catch {}
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temporary = executable + "." + process.pid + ".download";
    try {
      const response = await this.fetchImpl(release.url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(900000)]),
      });
      if (!response.ok || !response.body) throw Error("Download unavailable");
      const total = Number(response.headers.get("content-length")) || 0;
      const fd = fs.openSync(temporary, "w", 0o600);
      let received = 0,
        lastUpdate = 0;
      const digest = createHash("sha256");
      try {
        for await (const chunk of response.body) {
          received += chunk.length;
          if (received > 600 * 1024 * 1024)
            throw Error("Download is too large");
          fs.writeSync(fd, chunk);
          digest.update(chunk);
          if (Date.now() - lastUpdate > 150) {
            const percent = total
              ? Math.min(100, Math.round((received / total) * 100))
              : null;
            progress({
              phase: "downloading",
              percent,
              text: `Preparing ${id === "chatgpt" ? "ChatGPT" : "Claude"} · ${percent === null ? Math.round(received / 1048576) + " MB" : percent + "%"}`,
            });
            lastUpdate = Date.now();
          }
        }
      } finally {
        fs.closeSync(fd);
      }
      signal.throwIfAborted();
      progress({ phase: "verifying", text: "Checking your download…" });
      if (digest.digest("hex") !== release.checksum)
        throw Error("Download verification failed. Please retry.");
      const binary = release.archive
        ? executableFromTar(fs.readFileSync(temporary), release.member)
        : fs.readFileSync(temporary);
      fs.writeFileSync(temporary, binary, { mode: 0o700 });
      fs.chmodSync(temporary, 0o700);
      fs.renameSync(temporary, executable);
      fs.writeFileSync(
        receipt + ".tmp",
        JSON.stringify({ release: release.checksum, binary: hash(binary) }),
        { mode: 0o600 },
      );
      fs.renameSync(receipt + ".tmp", receipt);
      return executable;
    } catch (error) {
      if (signal.aborted) throw Error("Connection canceled");
      if (/verification|archive/.test(error.message)) throw error;
      throw Error(
        "We couldn't prepare sign-in. Check your internet connection and try Connect again.",
      );
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  cancel(id) {
    this.tasks.get(id)?.controller.abort();
  }
  close() {
    for (const task of this.tasks.values()) task.controller.abort();
  }
}
