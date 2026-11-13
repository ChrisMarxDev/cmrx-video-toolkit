import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
const identities = new Map();
export function fileIdentity(file) {
  const real = fs.realpathSync(file),
    s = fs.statSync(real, { bigint: true });
  if (!s.isFile()) throw Error("Render input must be a regular file");
  const key = [real, s.size, s.mtimeNs, s.ctimeNs].join(":");
  let sha256 = identities.get(key);
  if (!sha256) {
    const hash = createHash("sha256"),
      buffer = Buffer.allocUnsafe(1024 * 1024),
      fd = fs.openSync(real, "r");
    try {
      let n;
      while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)))
        hash.update(buffer.subarray(0, n));
    } finally {
      fs.closeSync(fd);
    }
    const after = fs.statSync(real, { bigint: true });
    if (
      after.size !== s.size ||
      after.mtimeNs !== s.mtimeNs ||
      after.ctimeNs !== s.ctimeNs
    )
      throw Error("Render input changed during inspection");
    sha256 = hash.digest("hex");
    if (identities.size > 1000) identities.clear();
    identities.set(key, sha256);
  }
  return { sha256, bytes: Number(s.size) };
}
export function inputFile(root, relative) {
  if (
    typeof relative !== "string" ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative.split("/").some((p) => !p || p === ".." || p === ".")
  )
    throw Error("Invalid render input path");
  const base = fs.realpathSync(root),
    file = path.join(base, relative);
  let current = base;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink())
      throw Error("Render inputs cannot be symlinks");
  }
  if (!fs.realpathSync(file).startsWith(base + path.sep))
    throw Error("Render input escaped project");
  return file;
}
export function describeInputs(root, project, files, engine) {
  const { revision, comments, ...document } = project;
  const media = (project.assets ?? []).map((a) => a.path);
  const entries = [...new Set([...files, ...media])]
    .sort()
    .map((name) => ({ path: name, ...fileIdentity(inputFile(root, name)) }));
  return { schemaVersion: 1, document, files: entries, engine };
}
export function inputFingerprint(manifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
export function captureFiles(root, dest, files) {
  for (const name of [...new Set(files)]) {
    const source = inputFile(root, name),
      before = fileIdentity(source),
      target = path.join(dest, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE);
    if (
      fileIdentity(source).sha256 !== before.sha256 ||
      fileIdentity(target).sha256 !== before.sha256
    )
      throw Error("Render inputs changed during capture; retry");
  }
}
export function createRenderJob({
  revision,
  kind = "export",
  engine,
  inputManifest,
  ...details
}) {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    revision,
    kind,
    engine,
    status: "running",
    phase: "preparing",
    cancelRequested: false,
    createdAt: new Date().toISOString(),
    ...details,
    ...(inputManifest
      ? { inputManifest, fingerprint: inputFingerprint(inputManifest) }
      : {}),
  };
}
export function requestCancellation(job) {
  if (job.status !== "running") throw Error("No running job");
  job.cancelRequested = true;
  job.phase = "canceling";
}
export function jobProjection(job) {
  return {
    schemaVersion: 1,
    id: job.id,
    revision: job.revision,
    kind: job.kind ?? "export",
    status: job.status === "cancelled" ? "canceled" : job.status,
    phase:
      job.status !== "running"
        ? job.status === "cancelled"
          ? "canceled"
          : job.status
        : job.cancelRequested
          ? "canceling"
          : (job.phase ?? (job.waitingForRender ? "waiting" : "rendering")),
    engine: publicRenderJob(job).engine ?? null,
    cancelRequested: !!job.cancelRequested,
  };
}

export function publicRenderJob(job) {
  const { inputManifest, engine, ...rest } = job;
  const summary = engine
    ? {
        id: engine.id,
        version: engine.version,
        contractVersion: engine.contractVersion,
        sdkVersion: engine.sdkVersion,
        fluviePin: engine.fluviePin,
      }
    : undefined;
  return {
    ...rest,
    ...(summary ? { engine: summary } : {}),
    ...(inputManifest
      ? {
          inputManifest: {
            schemaVersion: inputManifest.schemaVersion,
            fileCount: inputManifest.files?.length ?? inputManifest.fileCount,
            fingerprint: job.fingerprint,
          },
        }
      : {}),
  };
}
