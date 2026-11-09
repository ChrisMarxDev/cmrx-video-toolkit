import { setupAssetManager } from "/asset-manager.mjs";
import { setupAgentUI } from "/agent-settings.mjs";
import { setupOnboarding } from "/onboarding.mjs";
import { setupProviderUI } from "/settings-view.mjs";
import { decorateBrandMentions, setBrandedText } from "/brand-ui.mjs";
import { renderComments } from "/comment-payload.mjs";
import { renderMessage } from "/message-view.mjs";
const $ = (s) => document.querySelector(s),
  params = new URLSearchParams(location.hash.slice(1));
let stored = {};
try {
  stored = JSON.parse(sessionStorage.getItem("connection") || "{}");
} catch {}
const token = params.get("token") || stored.token,
  editorToken = params.get("editorToken") || stored.editorToken;
if (token && editorToken)
  try {
    sessionStorage.setItem(
      "connection",
      JSON.stringify({ token, editorToken }),
    );
  } catch {}
history.replaceState(null, "", location.pathname);
if (!token || !editorToken) {
  $("#error").textContent =
    "Open this workspace from the desktop app to connect securely.";
  $("#send").disabled = true;
} else {
  let latestState;
  let importingVideo = false;
  const assetStatus = document.createElement("div");
  assetStatus.id = "asset-import-status";
  assetStatus.setAttribute("role", "status");
  $("#prompt").parentNode.append(assetStatus);
  let dropping = false;
  async function importFiles(files, { attach = false } = {}) {
    if (dropping || latestState?.locked) {
      showError(Error("Wait for the current edit or import to finish"));
      return;
    }
    if (
      files.length > 20 ||
      (attach && files.length + assetManager.attachments().length > 20)
    ) {
      showError(Error("Attach up to 20 assets per message"));
      return;
    }
    dropping = true;
    $("#send").disabled = true;
    const saved = [];
    try {
      for (const file of files) {
        if (file.size > 2 * 1024 ** 3)
          throw Error("Files must be smaller than 2 GB");
        const extension =
          {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/bmp": "bmp",
            "image/svg+xml": "svg",
          }[file.type] || "bin";
        const name = file.name || "pasted-image." + extension;
        assetStatus.textContent = "Importing " + name + "…";
        const response = await fetch("/chat/asset-import", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "X-File-Name": encodeURIComponent(name),
            "Content-Type": "application/octet-stream",
          },
          body: file,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Import failed");
        if (attach) assetManager.addImported(result);
        saved.push(result.name);
        if (result.warning) showError(Error(result.warning));
      }
    } catch (error) {
      showError(error);
    } finally {
      dropping = false;
      $("#send").disabled = !connected || !!latestState?.switching || sending;
      assetStatus.textContent = saved.length
        ? "Added: " + saved.join(", ")
        : "No files added";
    }
  }
  function acceptDrops(doc) {
    doc.addEventListener("dragover", (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect =
        latestState?.locked || dropping ? "none" : "copy";
      assetStatus.textContent = "Drop files to add them to this project";
    });
    doc.addEventListener("drop", (e) => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      importFiles(files);
    });
  }
  $("#prompt").addEventListener("paste", (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const images = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    const files = images.length
      ? images
      : Array.from(e.clipboardData?.files || []).filter((file) =>
          file.type.startsWith("image/"),
        );
    if (!files.length) return; // Plain text keeps normal browser paste behavior.
    e.preventDefault();
    importFiles(files, { attach: true });
  });
  acceptDrops(document);
  $("#editor").addEventListener("load", () => {
    if ($("#editor").contentDocument) acceptDrops($("#editor").contentDocument);
  });

  let draftLoaded = false,
    draftTimer;
  const persistDraft = () =>
    call("draft", { text: $("#prompt").value }).catch(() => {});
  window.addEventListener("beforeunload", () => {
    clearTimeout(draftTimer);
    fetch("/chat/draft", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: $("#prompt").value }),
      keepalive: true,
    }).catch(() => {});
  });
  let commentPositions = {};
  let queuedComments = [],
    commentSignature = "",
    sending = false;
  window.addEventListener("message", (e) => {
    if (e.source !== $("#editor").contentWindow || e.origin !== location.origin)
      return;
    if (e.data?.type === "cmrx:add-video") {
      void importVideo();
      return;
    }
    if (e.data?.type !== "cmrx:comment-positions") return;
    if (JSON.stringify(commentPositions) === JSON.stringify(e.data.positions))
      return;
    commentPositions = e.data.positions;
    commentSignature = "";
    signature = "";
  });
  const openComment = (comment) => {
    $("#editor").contentWindow?.postMessage(
      { type: "cmrx:open-comment", id: comment.id },
      location.origin,
    );
  };
  const syncPreview = () => {
    if (!latestState) return;
    const s = latestState;
    const overlay = s.overlay
      ? {
          ...s.overlay,
          url:
            "/chat/overlay?id=" +
            encodeURIComponent(s.overlay.id) +
            "&token=" +
            encodeURIComponent(token),
        }
      : null;
    $("#editor").contentWindow?.postMessage(
      {
        type: "cmrx:preview",
        overlay,
        locked: s.locked || importingVideo,
        canImportVideo: s.projectInfo?.selected !== false,
      },
      location.origin,
    );
  };
  // Keep the base editor intact; its optional comments dock starts closed in chat mode.
  $("#editor").onload = () => {
    const doc = $("#editor").contentDocument;
    const theme = doc.createElement("link");
    theme.rel = "stylesheet";
    theme.href = "/editor-theme.css";
    doc.head.append(theme);
    const style = doc.createElement("style");
    style.textContent = ".clip-controls{display:none!important}";
    doc.head.append(style);
    const close = () => {
      const button = doc.querySelector(
        '[aria-label="Toggle comments"][aria-expanded="true"]',
      );
      if (button) {
        button.click();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(close);
    observer.observe(doc.body, { childList: true, subtree: true });
    close();
    setTimeout(() => observer.disconnect(), 10000);
    syncPreview();
  };
  $("#editor").src = "/editor?fit=1#token=" + encodeURIComponent(editorToken);
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
  async function call(route, body = {}) {
    const r = await fetch("/chat/" + route, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error);
    return value;
  }
  function showError(e) {
    setBrandedText($("#error"), e.message);
  }
  const openTool = async (link) => {
    try {
      const result = await call("tool-ticket", { id: link.id });
      $("#tool-title").textContent = link.title;
      $("#tool-frame").removeAttribute("srcdoc");
      $("#tool-frame").src = result.url;
      $("#tool-dialog").showModal();
    } catch (e) {
      showError(e);
    }
  };
  $("#tool-close").onclick = () => {
    $("#tool-dialog").close();
    $("#tool-frame").src = "about:blank";
  };
  const providerUI = setupProviderUI({ call, onError: showError });
  const agentUI = setupAgentUI({ call, onError: showError, openTool });
  const assetManager = setupAssetManager({
    call,
    token,
    onError: showError,
    onPrompt: (text) => {
      $("#prompt").value = text;
      persistDraft();
    },
  });
  const onboarding = setupOnboarding({ call, onError: showError });
  let forceScroll = true;
  let signature = "",
    connected = false;
  const stream = new EventSource(
    "/chat/events?token=" + encodeURIComponent(token),
  );
  stream.onmessage = ({ data }) => {
    const s = JSON.parse(data);
    connected = s.connected;
    latestState = s;
    if (!draftLoaded) {
      draftLoaded = true;
      $("#prompt").value = s.draft || "";
    }
    queuedComments = s.pendingComments || [];
    const nextComments = JSON.stringify(queuedComments);
    if (nextComments !== commentSignature) {
      commentSignature = nextComments;
      const attachments = $("#comment-attachments");
      attachments.hidden = !queuedComments.length;
      attachments.replaceChildren();
      if (queuedComments.length) {
        attachments.append(
          renderComments(
            queuedComments,
            document,
            openComment,
            commentPositions,
          ),
        );
      }
    }
    syncPreview();
    $("#render").disabled = !!s.locked || s.running;
    $("#preview-status").textContent = s.locked
      ? "Working on your project…"
      : s.running
        ? "Updating preview…"
        : s.overlay?.stale
          ? "Preview update pending"
          : s.overlay
            ? "Ready to edit"
            : "Ready to edit";
    $("#preview-status").classList.toggle("stale", !!s.overlay?.stale);
    $("#engine-status").textContent = s.engine?.available
      ? "Ready"
      : "Needs setup";
    $("#engine-detail").textContent = s.engine?.available
      ? "Custom graphics and toolkit commands are available."
      : "Missing: " + (s.engine?.missing || []).join(", ");
    providerUI.update(s);
    agentUI.update(s);
    onboarding.update(s);
    const blank = !(s.clipCount ?? s.mediaCount);
    const welcome = $("#welcome");
    if (welcome) {
      welcome.querySelector("h1").textContent = blank
        ? "What are we making?"
        : "Describe the edit";
      welcome.querySelector("p").textContent = blank
        ? "Start with an idea. Add recordings later."
        : "Or mark a moment in the timeline.";
    }
    const suggestion = $("#suggestion");
    if (suggestion) {
      suggestion.textContent = blank
        ? "Develop a script"
        : "Tighten the opening";
      suggestion.dataset.prompt = blank
        ? "Help me develop a script. Let's start with the audience and the main idea."
        : "Trim the first second of this video.";
    }
    $("#prompt").placeholder = blank
      ? "Describe your idea, or work on your script…"
      : "Ask for an edit, or refer to a comment…";
    $("#send").disabled = !connected || !!s.switching || sending || dropping;
    $("#send").textContent =
      s.locked || s.running || s.queue?.length || s.queuePaused
        ? "Queue"
        : "Send";
    const immediate = $("#send-now");
    immediate.hidden =
      !(s.busy && s.canSteer) && !s.queue?.length && !s.queuePaused;
    immediate.disabled =
      !connected ||
      !!s.switching ||
      sending ||
      dropping ||
      (s.busy ? !s.canSteer : !!s.locked || !!s.running);
    const queue = $("#message-queue");
    const queueSignature = JSON.stringify([
      s.queue || [],
      s.queuePaused,
      commentPositions,
    ]);
    if (queue.dataset.signature !== queueSignature) {
      queue.dataset.signature = queueSignature;
      queue.hidden = !s.queue?.length;
      queue.replaceChildren();
      if (s.queue?.length) {
        const heading = document.createElement("div");
        heading.className = "queue-heading";
        const title = document.createElement("span");
        title.textContent = `${s.queuePaused ? "Paused" : "Up next"} · ${s.queue.length}`;
        heading.append(title);
        if (s.queuePaused) {
          const resume = document.createElement("button");
          resume.type = "button";
          resume.textContent = "Resume";
          resume.disabled = !connected;
          resume.onclick = () => call("queue-resume").catch(showError);
          heading.append(resume);
        }
        queue.append(heading);
        s.queue.forEach((item, index) => {
          const row = document.createElement("div");
          row.className = "queued-message";
          const content = document.createElement("div");
          for (const asset of item.assets || []) {
            const chip = document.createElement("span");
            chip.className = "asset-chip";
            chip.textContent = "Asset · " + asset.path.split("/").at(-1);
            content.append(chip);
          }
          if (item.text) {
            const text = document.createElement("p");
            setBrandedText(text, item.text);
            content.append(text);
          }
          if (item.comments?.length)
            content.append(
              renderComments(
                item.comments,
                document,
                openComment,
                commentPositions,
              ),
            );
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = "×";
          remove.setAttribute(
            "aria-label",
            `Remove queued message ${index + 1}`,
          );
          remove.onclick = () =>
            call("queue-remove", { id: item.id }).catch(showError);
          row.append(content, remove);
          queue.append(row);
        });
      }
    }
    $("#stop").hidden = !(s.busy || s.running || s.importing);
    $("#stop").textContent = s.importing ? "Cancel" : "Stop";
    setBrandedText($("#activity"), s.activity);
    setBrandedText(
      $("#error"),
      s.error ||
        (!s.busy && s.jobs?.at(-1)?.status === "failed"
          ? "Render failed. Ask the assistant to fix it, or try again."
          : ""),
    );
    $("#jobs").replaceChildren(
      ...(s.jobs || [])
        .filter((job) => job.kind !== "overlay")
        .slice(-1)
        .map((job) => {
          const el = document.createElement("div");
          el.className = "job";
          if (job.artifact && job.status === "complete") {
            const a = document.createElement("a");
            a.href =
              "/chat/artifact?id=" +
              encodeURIComponent(job.id) +
              "&token=" +
              encodeURIComponent(token);
            a.textContent = "Download latest export";
            a.download = "preview.mp4";
            el.append(a);
          } else
            el.textContent = job.waitingForRender
              ? "Waiting for render slot…"
              : "Preview · " + job.status;
          return el;
        }),
    );
    const next = JSON.stringify(s.messages);
    if (next !== signature) {
      const list = $("#messages");
      const oldScroll = list.scrollTop;
      const stick =
        forceScroll ||
        list.scrollHeight - list.scrollTop - list.clientHeight < 90;
      forceScroll = false;
      signature = next;
      if (s.messages.length) {
        $("#messages").replaceChildren(
          ...s.messages.map((m) => {
            const el = document.createElement("div");
            el.className = "message " + m.role;
            const label = document.createElement("div");
            label.className = "message-author";
            const author =
              m.role === "user"
                ? "You"
                : m.provider === "claude"
                  ? "Claude"
                  : m.provider === "chatgpt"
                    ? "ChatGPT"
                    : "Assistant";
            setBrandedText(label, author);
            el.append(label);
            if (m.comments?.length)
              el.append(
                renderComments(
                  m.comments,
                  document,
                  openComment,
                  commentPositions,
                ),
              );
            for (const asset of m.assets || []) {
              const chip = document.createElement("span");
              chip.className = "asset-chip";
              chip.textContent = "Asset · " + asset.path.split("/").at(-1);
              el.append(chip);
            }
            if (m.text) el.append(decorateBrandMentions(renderMessage(m.text)));
            return el;
          }),
        );
        list.scrollTop = stick ? list.scrollHeight : oldScroll;
      }
    }
  };
  stream.onerror = () => {
    $("#error").textContent = "Connection lost. Reconnecting…";
    $("#send").disabled = true;
  };
  $("#messages").addEventListener("click", (event) => {
    const a = event.target.closest("a");
    if (!a) return;
    if (a.dataset.tool) {
      event.preventDefault();
      const link = latestState?.links?.find((l) => l.id === a.dataset.tool);
      if (link) openTool(link);
    }
    if (a.dataset.artifact) {
      a.href =
        "/chat/artifact?id=" +
        encodeURIComponent(a.dataset.artifact) +
        "&token=" +
        encodeURIComponent(token);
    }
  });
  async function importVideo() {
    if (importingVideo || latestState?.locked) return;
    importingVideo = true;
    syncPreview();
    try {
      await call("import");
    } catch (e) {
      showError(e);
    } finally {
      importingVideo = false;
      syncPreview();
    }
  }
  async function send(delivery) {
    const draft = $("#prompt").value;
    const text = draft.trim();
    if (
      (!text && !queuedComments.length && !assetManager.attachments().length) ||
      sending ||
      dropping ||
      !connected
    )
      return;
    try {
      sending = true;
      $("#send").disabled = true;
      $("#send-now").disabled = true;
      forceScroll = true;
      await call("send", {
        ...(delivery ? { delivery } : {}),
        text,
        comments: queuedComments,
        assets: assetManager.attachments(),
      });
      assetManager.clear();
      if ($("#prompt").value === draft) {
        $("#prompt").value = "";
        $("#prompt").style.height = "64px";
        clearTimeout(draftTimer);
        persistDraft();
      }
    } catch (e) {
      showError(e);
    } finally {
      sending = false;
      $("#send").disabled = !connected || !!latestState?.switching || dropping;
      $("#send-now").disabled =
        !connected ||
        !!latestState?.switching ||
        dropping ||
        (latestState?.busy
          ? !latestState.canSteer
          : !!latestState?.locked || !!latestState?.running);
    }
  }
  $("#send-now").onclick = () => send("now");
  $("form").onsubmit = (e) => {
    e.preventDefault();
    send();
  };
  $("#prompt").oninput = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persistDraft, 300);
    const input = $("#prompt");
    input.style.height = "auto";
    input.style.height = Math.min(170, Math.max(64, input.scrollHeight)) + "px";
  };
  $("#prompt").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(e.ctrlKey || e.metaKey ? "now" : undefined);
    }
  };
  $("#render").onclick = () => call("render").catch(showError);
  $("#stop").onclick = () => call("stop").catch(showError);
  $("#suggestion").onclick = () => {
    $("#prompt").value = $("#suggestion").dataset.prompt;
    $("#prompt").focus();
  };
  const divider = $("#divider");
  divider.onpointerdown = (e) => {
    divider.setPointerCapture(e.pointerId);
    divider.onpointermove = (e) => {
      $("#chat").style.width =
        Math.max(310, Math.min(innerWidth - 326, e.clientX)) + "px";
    };
    divider.onpointerup = () => (divider.onpointermove = null);
  };
  divider.onkeydown = (e) => {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      $("#chat").style.width =
        Math.max(
          310,
          $("#chat").offsetWidth + (e.key === "ArrowLeft" ? -20 : 20),
        ) + "px";
    }
  };
}
