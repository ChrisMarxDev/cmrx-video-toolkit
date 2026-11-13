import fs from "node:fs";
import { publicProxy } from "../../local-editor/dist/playback-proxy.mjs";
// Called only after the parent service has authenticated this request.
export const mediaPaths = new Set([
  "/chat/overlay-preview",
  "/chat/overlay",
  "/chat/artifact",
]);
export async function serveMedia(
  { playground, playbackProxies, autoPreview, connection },
  req,
  res,
  url,
) {
  if (url.pathname === "/chat/overlay-preview") {
    const file = playground.overlayArtifact(
      url.searchParams.get("id"),
      url.searchParams.get("track"),
    );
    if (!file) throw Error("Choose a completed graphics preview");
    if (typeof autoPreview === "function" && !autoPreview()) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "preparing", deferred: true }));
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        publicProxy(
          playbackProxies.request(
            file,
            url.searchParams.get("quality"),
            true,
            url.searchParams.get("retry") === "1",
            url.searchParams.get("refresh") === "1",
          ),
        ),
      ),
    );
    return;
  }
  if (["/chat/artifact", "/chat/overlay"].includes(url.pathname)) {
    const id = url.searchParams.get("id");
    const isOverlay = url.pathname === "/chat/overlay";
    let file = isOverlay
      ? playground.overlayArtifact(id, url.searchParams.get("track"))
      : playground.artifact(id);
    if (file && isOverlay && url.searchParams.has("quality")) {
      const preview = playbackProxies.request(
        file,
        url.searchParams.get("quality"),
        true,
      );
      if (preview.status === "ready") file = preview.file;
    }
    if (file) {
      const size = fs.statSync(file).size;
      const range = req.headers.range;
      let start = 0,
        end = size - 1,
        status = 200;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) {
          res.writeHead(416, { "Content-Range": `bytes */${size}` });
          res.end();
          return;
        }
        start = match[1]
          ? Number(match[1])
          : Math.max(0, size - Number(match[2]));
        end =
          match[1] && match[2]
            ? Math.min(Number(match[2]), size - 1)
            : size - 1;
        if (start > end || start >= size) {
          res.writeHead(416, { "Content-Range": `bytes */${size}` });
          res.end();
          return;
        }
        status = 206;
      }
      res.writeHead(status, {
        "Content-Type": isOverlay ? "video/webm" : "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        ...(status === 206
          ? { "Content-Range": `bytes ${start}-${end}/${size}` }
          : {}),
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    if (isOverlay) throw Error("Graphics preview not ready");
    const r = await fetch(
      connection.url + "/api/artifact?id=" + encodeURIComponent(id),
      { headers: { Authorization: "Bearer " + connection.token } },
    );
    if (!r.ok) throw Error("Preview not ready");
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Disposition": "attachment; filename=preview.mp4",
    });
    const { Readable } = await import("node:stream");
    Readable.fromWeb(r.body).pipe(res);
    return;
  }
}
