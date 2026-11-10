import { matrixCells } from "/matrix-loader.mjs";
import { confirmRemoval } from "/confirm-removal.mjs";
import { setBrandedText } from "/brand-ui.mjs";
export function setupAssetManager({ call, token, onError, onPrompt }) {
  const $ = (s) => document.querySelector(s),
    el = (tag, text) => {
      const e = document.createElement(tag);
      if (text) setBrandedText(e, text);
      return e;
    };
  const open = $("#assets-open");
  const dialog = el("dialog");
  dialog.id = "assets-dialog";
  dialog.setAttribute("aria-label", "Asset manager");
  dialog.innerHTML = `<header><h2>Assets</h2><button type="button" id="assets-close" aria-label="Close assets">×</button></header><div class="asset-toolbar"><button id="assets-library" type="button">Workspace</button><button id="assets-project" type="button">Project</button><input id="assets-search" type="search" aria-label="Search assets" placeholder="Search assets…"><select id="assets-type" aria-label="Filter asset type"><option value="">All types</option></select><button type="button" id="assets-refresh" aria-label="Refresh assets">↻</button></div><nav id="assets-breadcrumb" aria-label="Asset folders"></nav><div class="asset-feedback"><span id="assets-loading" class="matrix-loader" aria-hidden="true" hidden>${matrixCells}</span><p id="assets-status" role="status"></p></div><div class="asset-browser"><div id="assets-grid"></div><section id="asset-detail" aria-label="Asset details"><p>Choose an asset to preview it.</p></section></div>`;
  document.body.append(dialog);
  const settings = el("section");
  settings.className = "asset-library-settings";
  settings.innerHTML =
    '<h3>Asset library</h3><label>Library folder<input id="asset-library-folder" readonly></label><div class="settings-row"><button type="button" id="asset-library-choose">Choose folder</button><button type="button" id="asset-library-open">Open folder</button></div><p id="asset-library-state" class="settings-caption"></p>';
  $('[data-settings-panel="project"]').append(settings);
  const chips = el("div");
  chips.id = "asset-attachments";
  chips.setAttribute("aria-label", "Attached assets");
  chips.hidden = true;
  $("#prompt").parentNode.insertBefore(chips, $("#prompt"));
  let attached = [],
    workspaceOwned = false,
    scope = "library",
    folder = "",
    items = [],
    selectedAsset = null,
    query = "",
    type = "",
    sequence = 0,
    busy = false,
    projectName = "";
  const previewURL = (item) =>
    "/chat/asset-preview?" +
    new URLSearchParams({ scope: item.scope, path: item.path, token });
  const error = (e) => {
    $("#assets-status").textContent = e.message;
    onError(e);
  };
  const renderChips = () => {
    chips.hidden = attached.length === 0;
    chips.replaceChildren(
      ...attached.map((item) => {
        const chip = el("span");
        chip.className = "asset-chip";
        const image = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(item.path);
        chip.title = item.name;
        if (image) {
          chip.classList.add("asset-chip-image");
          const thumbnail = document.createElement("img");
          thumbnail.src = previewURL(item);
          thumbnail.alt = item.name;
          thumbnail.width = thumbnail.height = 56;
          chip.append(thumbnail);
        }
        if (!image) chip.append(el("span", item.name));
        const remove = el("button", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove asset " + item.name);
        remove.onclick = () => {
          attached = attached.filter((a) => a.path !== item.path);
          renderChips();
        };
        chip.append(remove);
        return chip;
      }),
    );
  };
  async function attach(item, prompt) {
    if (attached.length >= 20)
      throw Error("Attach up to 20 assets per message");
    if (busy) return;
    busy = true;
    $("#assets-status").textContent = "Preparing project copy…";
    try {
      const copy = await call("assets-use", {
        scope: item.scope,
        path: item.path,
      });
      if (!attached.some((a) => a.path === copy.path)) attached.push(copy);
      renderChips();
      dialog.close();
      $("#asset-detail").replaceChildren();
      $("#prompt").focus();
      if (prompt)
        onPrompt(
          `Generate a standalone preview for the attached asset ${copy.name}. Keep the asset source editable and save the preview in its folder.`,
        );
    } finally {
      busy = false;
    }
  }
  function detail(item) {
    selectedAsset = item.scope + ":" + item.path;
    for (const card of dialog.querySelectorAll(".asset-card[data-key]"))
      if (card.hasAttribute("aria-pressed"))
        card.setAttribute(
          "aria-pressed",
          String(card.dataset.key === selectedAsset),
        );
    const d = $("#asset-detail");
    d.replaceChildren(
      el("h3", item.name),
      el("p", item.description || item.type),
    );
    if (item.preview) {
      const media = el(
        item.preview.type === "image"
          ? "img"
          : item.preview.type === "audio"
            ? "audio"
            : "video",
      );
      media.src = previewURL(item);
      if (item.preview.type !== "image") {
        media.controls = true;
        media.preload = "metadata";
      } else media.alt = item.name + " preview";
      media.onerror = () => {
        $("#assets-status").textContent =
          "This preview cannot be played. The asset is still available.";
      };
      d.append(media);
    } else
      d.append(
        el(
          "div",
          item.error
            ? "Invalid preview/config: " + item.error
            : "No preview yet",
        ),
      );
    if (item.instructionError)
      d.append(el("p", "Instructions unavailable: " + item.instructionError));
    if (item.tags?.length) d.append(el("p", item.tags.join(" · ")));
    d.append(el("p", "License: " + (item.license || "Unknown")));
    if (item.source) d.append(el("p", "Source: " + item.source));
    const use = el("button", "Attach to chat");
    use.type = "button";
    use.className = "primary";
    use.onclick = () => attach(item).catch(error);
    d.append(use);
    if (item.bundle && !item.preview) {
      const generate = el("button", "Generate preview");
      generate.type = "button";
      generate.onclick = () => attach(item, true).catch(error);
      d.append(generate);
    }
    const action = el(
      "button",
      item.scope === "project" ? "Save to library" : "Move to trash",
    );
    action.type = "button";
    action.onclick = async () => {
      if (busy) return;
      if (
        item.scope !== "project" &&
        !(await confirmRemoval({ kind: "asset", name: item.name }))
      )
        return;
      if (busy) return;
      busy = true;
      try {
        await call(
          item.scope === "project" ? "assets-promote" : "assets-trash",
          { scope: item.scope, path: item.path },
        );
        d.replaceChildren();
        await refresh();
      } catch (e) {
        error(e);
      } finally {
        busy = false;
      }
    };
    d.append(action);
  }
  function render() {
    const grid = $("#assets-grid");
    grid.replaceChildren();
    const visible = items.filter((i) => !type || i.type === type);
    for (const item of visible) {
      const card = el("button");
      card.type = "button";
      card.className = "asset-card";
      card.dataset.path = item.path;
      card.dataset.key = item.scope + ":" + item.path;
      if (!item.folder)
        card.setAttribute(
          "aria-pressed",
          String(card.dataset.key === selectedAsset),
        );
      card.setAttribute(
        "aria-label",
        (item.folder ? "Open folder " : "Preview asset ") + item.name,
      );
      if (item.preview?.type === "image") {
        const image = el("img");
        image.src = previewURL(item);
        image.alt = "";
        image.loading = "lazy";
        image.onerror = () => {
          const placeholder = el("span", "Preview unavailable");
          placeholder.className = "asset-placeholder asset-unavailable";
          image.replaceWith(placeholder);
        };
        card.append(image);
      } else {
        const icon = el(
          "span",
          item.folder
            ? "↳"
            : item.preview?.type === "video"
              ? "▶"
              : item.preview?.type === "audio"
                ? "♫"
                : item.bundle
                  ? "◇"
                  : "□",
        );
        icon.className = "asset-placeholder";
        card.append(icon);
      }
      card.append(
        el("strong", item.name),
        el(
          "small",
          item.error ? "Needs attention" : item.folder ? "Folder" : item.type,
        ),
      );
      card.onclick = () => {
        if (item.folder) {
          folder = item.path;
          query = "";
          $("#assets-search").value = "";
          $("#asset-detail").replaceChildren();
          refresh().catch(error);
        } else detail(item);
      };
      grid.append(card);
    }
    if (!visible.length) {
      const empty = el("div");
      empty.className = "assets-empty";
      empty.innerHTML =
        '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M4 10h15l5 5h20v21H4Z"/><path d="M4 10V4h15l5 6h20v5"/></svg>';
      empty.append(
        el("p", query || type ? "No matching assets." : "No assets yet."),
      );
      const action = el(
        "button",
        query || type ? "Clear filters" : "Open folder",
      );
      action.type = "button";
      action.onclick = () => {
        if (query || type) {
          query = "";
          type = "";
          $("#assets-search").value = "";
          refresh().catch(error);
        } else call("assets-open", { scope }).catch(error);
      };
      empty.append(action);
      grid.append(empty);
    }
  }

  async function refresh() {
    const seq = ++sequence;
    $("#assets-loading").hidden = false;
    $("#assets-refresh").disabled = true;
    dialog.querySelector(".asset-browser").setAttribute("aria-busy", "true");
    try {
      const result = await call("assets-list", { scope, folder, query });
      if (seq !== sequence) return;
      items = result.items;
      workspaceOwned = !!result.settings.workspaceOwned;
      $("#asset-library-folder").value = result.settings.folder;
      $("#asset-library-choose").hidden = !!result.settings.workspaceOwned;
      $("#assets-library").textContent = result.settings.workspaceOwned
        ? "Workspace"
        : "Library";
      settings.querySelector("h3").textContent = result.settings.workspaceOwned
        ? "Workspace assets"
        : "Asset library";
      $("#asset-library-state").textContent = result.settings.offline
        ? "Library folder is offline. Project copies remain available."
        : "";
      $("#assets-status").textContent = result.offline
        ? "Library folder is offline."
        : result.truncated
          ? "Showing the first matching assets. Narrow your search."
          : "";
      const select = $("#assets-type");
      select.replaceChildren(
        new Option("All types", ""),
        ...Array.from(new Set(items.map((i) => i.type)))
          .sort()
          .map((t) => new Option(t, t)),
      );
      if (Array.from(select.options).some((o) => o.value === type))
        select.value = type;
      else {
        type = "";
        select.value = "";
      }
      $("#assets-library").setAttribute(
        "aria-pressed",
        String(scope === "library"),
      );
      $("#assets-project").setAttribute(
        "aria-pressed",
        String(scope === "project"),
      );
      const crumbs = $("#assets-breadcrumb");
      crumbs.replaceChildren();
      const root = el(
        "button",
        scope === "library"
          ? workspaceOwned
            ? "Workspace assets"
            : "Library"
          : projectName,
      );
      root.type = "button";
      root.title =
        scope === "library"
          ? result.settings.folder
          : result.settings.projectFolder;
      root.onclick = () => {
        folder = "";
        refresh().catch(error);
      };
      crumbs.append(root);
      let current = "";
      for (const part of folder.split("/").filter(Boolean)) {
        current = [current, part].filter(Boolean).join("/");
        const dest = current;
        const b = el("button", part);
        b.type = "button";
        b.onclick = () => {
          folder = dest;
          refresh().catch(error);
        };
        crumbs.append(b);
      }
      render();
    } catch (e) {
      if (seq === sequence) throw e;
    } finally {
      if (seq === sequence) {
        $("#assets-loading").hidden = true;
        $("#assets-refresh").disabled = false;
        dialog
          .querySelector(".asset-browser")
          .setAttribute("aria-busy", "false");
      }
    }
  }

  const openManager = () => {
    $("#settings-dialog").close();
    if (!dialog.open) dialog.showModal();
    refresh().catch(error);
  };
  open.onclick = openManager;
  const settingsOpen = el("button", "Assets");
  settingsOpen.id = "settings-assets-open";
  settingsOpen.type = "button";
  settingsOpen.onclick = openManager;
  $(".settings-tabs").append(settingsOpen);
  $("#assets-close").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    selectedAsset = null;
    $("#asset-detail").replaceChildren();
  });
  for (const loc of ["library", "project"])
    $("#assets-" + loc).onclick = () => {
      scope = loc;
      folder = "";
      type = "";
      $("#asset-detail").replaceChildren();
      refresh().catch(error);
    };
  let timer;
  $("#assets-search").oninput = (e) => {
    clearTimeout(timer);
    query = e.target.value;
    timer = setTimeout(() => refresh().catch(error), 180);
  };
  $("#assets-type").onchange = (e) => {
    type = e.target.value;
    render();
  };
  $("#assets-refresh").onclick = () => refresh().catch(error);
  $("#asset-library-choose").onclick = () =>
    call("assets-folder")
      .then(() => {
        folder = "";
        return refresh();
      })
      .catch((e) => {
        $("#settings-error").textContent = e.message;
      });
  $("#asset-library-open").onclick = () =>
    call("assets-open", { scope: "library" }).catch((e) => {
      $("#settings-error").textContent = e.message;
    });
  $("#settings-dialog").addEventListener("toggle", () => {
    if ($("#settings-dialog").open) refresh().catch(onError);
  });
  return {
    update(s) {
      projectName = s.projectName || s.projectInfo?.name || "No project";
      $("#assets-project").textContent = projectName;
      $("#assets-project").title = projectName;
      $("#assets-project").disabled = s.projectInfo?.selected === false;
      if (s.projectInfo?.selected === false) scope = "library";
    },
    addImported(asset) {
      if (attached.length >= 20)
        throw Error("Attach up to 20 assets per message");
      if (!asset.path?.startsWith("assets/"))
        throw Error("Invalid imported asset path");
      const item = {
        scope: "project",
        path: asset.path.slice("assets/".length),
        name: asset.name,
      };
      if (!attached.some((a) => a.path === item.path)) attached.push(item);
      renderChips();
    },
    attachments: () =>
      attached.map((a) => ({ scope: "project", path: a.path })),
    clear: (sent) => {
      attached = sent
        ? attached.filter((a) => !sent.some((ref) => ref.path === a.path))
        : [];
      renderChips();
    },
  };
}
