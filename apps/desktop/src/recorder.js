const $ = (s) => document.querySelector(s),
  call = (action, data) => window.recording.command(action, data);
let begun = false,
  phase = "setup",
  camera,
  microphone,
  screen,
  recorders = [],
  started = 0,
  clock,
  offsets = {},
  stopping,
  failure,
  stopRequested = false,
  preparing = false;
function error(e) {
  $("#error").textContent = e.message || String(e);
}
function resize() {
  const view = !$("#sources").hidden ? "sources" : phase;
  void call("layout", {
    view,
    height: Math.ceil($("main").getBoundingClientRect().height),
  }).catch(() => {});
}
function show(next) {
  phase = next;
  for (const id of ["setup", "capture", "saving", "complete"])
    $("#" + id).hidden = id !== next;
  resize();
}
function release() {
  for (const stream of [camera, microphone, screen])
    stream?.getTracks().forEach((t) => t.stop());
  camera = microphone = screen = null;
  clearInterval(clock);
}
let enumeration = 0;
async function devices() {
  const request = ++enumeration;
  const devices = await navigator.mediaDevices.enumerateDevices();
  if (request !== enumeration) return;
  for (const [id, kind] of [
    ["camera", "videoinput"],
    ["microphone", "audioinput"],
  ]) {
    const select = $("#" + id),
      value = select.value;
    for (const opt of [...select.options])
      if (!["", "default"].includes(opt.value)) opt.remove();
    for (const d of devices.filter(
      (d) => d.kind === kind && d.deviceId && d.deviceId !== "default",
    )) {
      const o = new Option(
        d.label ||
          (id === "camera" ? "Camera" : "Microphone") +
            " " +
            (select.options.length - 1),
        d.deviceId,
      );
      select.append(o);
    }
    if ([...select.options].some((o) => o.value === value))
      select.value = value;
  }
}
let devicePending = 0;
const generation = { camera: 0, microphone: 0 };
async function setDevice(kind) {
  const version = ++generation[kind],
    id = $("#" + kind).value;
  devicePending++;
  $("#start").disabled = true;
  $("#error").textContent = "";
  if (kind === "camera") {
    camera?.getTracks().forEach((t) => t.stop());
    camera = null;
    $("#camera-preview").hidden = true;
  } else {
    microphone?.getTracks().forEach((t) => t.stop());
    microphone = null;
  }
  try {
    if (!id) return;
    await call("permission", { kind });
    const deviceId = id === "default" ? undefined : { exact: id };
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "camera"
        ? {
            video: {
              deviceId,
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          }
        : { audio: { deviceId }, video: false },
    );
    if (version !== generation[kind] || phase !== "setup") {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    if (kind === "camera") {
      camera = stream;
      $("#camera-preview").srcObject = stream;
      $("#camera-preview").hidden = false;
    } else microphone = stream;
    await devices();
  } catch (e) {
    if (version === generation[kind]) {
      $("#" + kind).value = "";
      error(e);
    }
  } finally {
    devicePending--;
    $("#start").disabled = preparing || devicePending > 0;
  }
}
$("#camera").onchange = () => void setDevice("camera");
$("#microphone").onchange = () => void setDevice("microphone");
async function save() {
  show("saving");
  $("#retry").hidden = true;
  try {
    await call("finish", { offsets });
    await call("close");
  } catch (e) {
    phase = "interrupted";
    $("#saving").hidden = true;
    $("#retry").hidden = false;
    error(e);
  }
}
async function stop() {
  if (stopping || !["capture", "saving"].includes(phase)) return stopping;
  if (phase === "saving") return;
  stopping = (async () => {
    try {
      await Promise.all(
        recorders.map(
          (r) =>
            new Promise((resolve, reject) => {
              r.recorder.onstop = () => resolve();
              r.recorder.onerror = (e) =>
                reject(e.error || Error("Recording failed"));
              if (r.recorder.state === "inactive") resolve();
              else r.recorder.stop();
            }),
        ),
      );
      await Promise.all(recorders.map((r) => r.tail));
      if (failure) throw failure;
      release();
      await save();
    } catch (e) {
      release();
      await call("interrupt", { reason: e.message }).catch(() => {});
      show("complete");
      $("#complete h2").textContent = "Capture interrupted";
      $("#complete p").textContent =
        "Partial sources were retained in the project.";
      error(e);
    }
  })();
  return stopping;
}
$("#start").onclick = async () => {
  if (preparing || devicePending || phase !== "setup") return;
  preparing = true;
  $("#start").disabled = true;
  $("#error").textContent = "";
  try {
    if (!$("#screen").checked && !camera && !microphone)
      throw Error("Choose a screen, camera or microphone.");
    if ($("#screen").checked)
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
    const streams = [
      ["screen", screen],
      ["camera", camera],
      ["microphone", microphone],
    ].filter(([, s]) => s);
    for (const [name, stream] of streams)
      if (stream.getTracks().some((t) => t.readyState !== "live"))
        throw Error(name + " stopped. Select it again.");
    const tracks = streams.map(([name, stream]) => {
      const candidates =
        name === "microphone"
          ? ["audio/webm;codecs=opus", "audio/webm"]
          : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
      const mime = candidates.find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) throw Error("This build cannot encode " + name + ".");
      return { name, stream, mime };
    });
    const result = await call("begin", {
      tracks: tracks.map(({ name, mime }) => ({ name, mime })),
    });
    begun = true;
    offsets = {};
    started = performance.now();
    recorders = tracks.map(({ name, stream, mime }) => {
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        ...(name === "microphone"
          ? { audioBitsPerSecond: 128000 }
          : { videoBitsPerSecond: 8000000 }),
      });
      const r = { recorder, tail: Promise.resolve(), queuedBytes: 0 };
      recorder.onstart = () => {
        offsets[name] = Math.max(0, performance.now() - started);
      };
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return;
        r.queuedBytes += e.data.size;
        if (r.queuedBytes > 32 * 1024 * 1024) {
          failure = Error(
            "Storage cannot keep up. Recording stopped; partial files are retained.",
          );
          error(failure);
          void stop();
          return;
        }
        r.tail = r.tail.then(async () => {
          for (
            let offset = 0;
            offset < e.data.size;
            offset += 4 * 1024 * 1024
          ) {
            await call("chunk", {
              name,
              bytes: await e.data
                .slice(offset, offset + 4 * 1024 * 1024)
                .arrayBuffer(),
            });
          }
          r.queuedBytes -= e.data.size;
        });
        r.tail.catch((e) => {
          failure = e;
          error(e);
          void stop();
        });
      };
      recorder.onerror = (e) => {
        failure = e.error || Error("Recording failed");
        error(failure);
        void stop();
      };
      stream.getTracks().forEach((t) =>
        t.addEventListener(
          "ended",
          () => {
            if (phase === "capture") void stop();
          },
          { once: true },
        ),
      );
      recorder.start(1000);
      return r;
    });
    $("#stop").title = result.shortcut || "Stop & save";
    $("#shortcut").textContent = result.shortcut
      ? result.shortcut + " · Stop & save"
      : "";
    show("capture");
    clock = setInterval(() => {
      const s = Math.floor((performance.now() - started) / 1000);
      $("#clock").textContent =
        String(Math.floor(s / 60)).padStart(2, "0") +
        ":" +
        String(s % 60).padStart(2, "0");
    }, 250);
    if (stopRequested) void stop();
  } catch (e) {
    screen?.getTracks().forEach((t) => t.stop());
    screen = null;
    error(e);
    if (begun) {
      release();
      await call("interrupt", { reason: e.message }).catch(() => {});
      show("complete");
      $("#complete h2").textContent = "Capture interrupted";
    }
  } finally {
    preparing = false;
    $("#start").disabled = false;
  }
};
$("#stop").onclick = () => void stop();
$("#retry").onclick = () => void save();
$("#folder").onclick = () => call("folder").catch(error);
$("#done").onclick = () => call("close");
$("#cancel").onclick = () => call("close");
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || preparing) return;
  if (!$("#sources").hidden) $("#source-cancel").click();
  else if (phase === "setup") void call("close");
});
window.recording.onStop(() => {
  if (preparing) stopRequested = true;
  else void stop();
});
window.recording.onSources((sources) => {
  $("#sources").hidden = false;
  resize();
  $("#source-list").replaceChildren();
  for (const source of sources) {
    const b = document.createElement("button"),
      img = document.createElement("img");
    img.src = source.thumbnail;
    img.alt = "";
    b.append(img, document.createTextNode(source.name));
    b.onclick = () => {
      $("#sources").hidden = true;
      resize();
      call("source", { id: source.id }).catch(error);
    };
    $("#source-list").append(b);
  }
});
$("#source-cancel").onclick = () => {
  $("#sources").hidden = true;
  resize();
  call("source", { id: null }).catch(error);
};
window.addEventListener("beforeunload", release);
const info = await call("info").catch((e) => {
  error(e);
  return { project: "Recording", interrupted: 0 };
});
$("#project").textContent = info.project;
await devices().catch(error);
document.body.dataset.ready = "true";

if (info.interrupted) {
  $("#status").textContent =
    "Interrupted recording files are retained in this project.";
  $("#recovery").hidden = false;
  $("#recovery").onclick = () => call("recovery").catch(error);
}

new ResizeObserver(resize).observe($("main"));
resize();
