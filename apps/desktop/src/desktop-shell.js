import { matrixCells } from "./matrix-loader.mjs";
const $ = (s) => document.querySelector(s);
let state = { tabs: [] },
  menuOpen = false,
  renaming = null;
async function command(action, data) {
  try {
    $("#error").hidden = true;
    return await window.projects.command(action, data);
  } catch (e) {
    $("#error").textContent = e.message.replace(
      /^Error invoking remote method.*?Error: /,
      "",
    );
    $("#error").hidden = false;
    throw e;
  }
}
async function menu(open) {
  menuOpen = open;
  $("#menu").hidden = !open;
  $("#add").setAttribute("aria-expanded", String(open));
  await command("menu", { open });
}
function act(action, data) {
  command(action, data).catch(() => {});
}
function update(next) {
  const signature = JSON.stringify(next);
  if (update.signature === signature) return;
  update.signature = signature;
  const focused = document.activeElement?.dataset?.project;
  state = next;
  $("#empty").hidden = !!next.tabs.length;
  $("#tabs").replaceChildren();
  for (const tab of next.tabs) {
    const wrap = document.createElement("div");
    wrap.className = "tab" + (tab.id === next.active ? " active" : "");
    wrap.draggable = true;
    wrap.ondragstart = (e) => e.dataTransfer.setData("text/plain", tab.id);
    wrap.ondragover = (e) => e.preventDefault();
    wrap.ondrop = (e) => {
      e.preventDefault();
      act("move", { id: e.dataTransfer.getData("text/plain"), before: tab.id });
    };
    const b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(tab.id === next.active));
    b.tabIndex = tab.id === next.active ? 0 : -1;
    b.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const index = next.tabs.indexOf(tab);
      const at =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? next.tabs.length - 1
            : (index + (e.key === "ArrowRight" ? 1 : -1) + next.tabs.length) %
              next.tabs.length;
      act("select", { id: next.tabs[at].id });
    };
    b.dataset.project = tab.id;
    b.title = tab.folder + (tab.activity ? " · " + tab.activity : "");
    const dot = document.createElement("span");
    dot.className = "dot " + tab.status;
    if (tab.status === "working") dot.innerHTML = matrixCells;
    dot.setAttribute("aria-hidden", "true");
    b.append(dot, document.createTextNode(tab.name));
    b.onclick = () => act("select", { id: tab.id });
    b.oncontextmenu = (e) => {
      e.preventDefault();
      act("context", { id: tab.id });
    };
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close " + tab.name);
    close.onclick = () => act("close", { id: tab.id });
    wrap.append(b, close);
    $("#tabs").append(wrap);
  }
  if (focused)
    $("#tabs")
      .querySelector(`[data-project="${CSS.escape(focused)}"]`)
      ?.focus();
  $("#workspace-name").textContent =
    next.workspace?.name ||
    "Choose a workspace when you create your first project";
  $("#workspace-show").hidden = !next.workspace;
  $("#workspace-projects").replaceChildren();
  for (const p of next.workspaceProjects || []) {
    if (next.tabs.some((t) => t.folder === p.folder)) continue;
    const b = document.createElement("button");
    b.textContent = p.name;
    b.title = p.folder;
    b.onclick = async () => {
      await menu(false);
      act("open", { folder: p.folder });
    };
    $("#workspace-projects").append(b);
  }
  $("#workspace-recents").replaceChildren();
  for (const w of next.workspaces || []) {
    if (w.folder === next.workspace?.folder) continue;
    const b = document.createElement("button");
    b.textContent = w.name;
    b.title = w.folder;
    b.onclick = () => act("workspace-open", { folder: w.folder });
    $("#workspace-recents").append(b);
  }
  $("#recents").replaceChildren();
  for (const p of next.recents) {
    const b = document.createElement("button");
    b.textContent = p.name;
    b.title = p.folder;
    b.onclick = async () => {
      await menu(false);
      act("open", { recentId: p.id });
    };
    $("#recents").append(b);
  }
}
async function nameDialog(data) {
  renaming = data || null;
  $("#name-form button[type=submit]").textContent = data
    ? "Rename"
    : "Create project";
  $("#name").value = data?.name || "";
  $("#name-error").textContent = "";
  await menu(false);
  await command("overlay", { open: true });
  $("#name-dialog").showModal();
  $("#name").focus();
}
window.projects.onRename(nameDialog);
window.projects.onShortcut((key) => (key === "n" ? nameDialog() : menu(true)));
window.projects.subscribe(update);
act("state");
$("#add").onclick = () => menu(!menuOpen);
$("#empty-add").onclick = () => menu(true);
$("#open").onclick = async () => {
  await menu(false);
  act("open");
};
$("#settings").onclick = () => act("settings");
$("#new").onclick = () => nameDialog();
for (const action of ["workspace-create", "workspace-open", "workspace-show"])
  $("#" + action).onclick = () => act(action);
$("#cancel-name").onclick = () => $("#name-dialog").close();
$("#name-dialog").onclose = () => act("overlay", { open: false });
$("#name-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const result = await command(renaming ? "rename" : "create", {
      name: $("#name").value,
      id: renaming?.id,
    });
    if (result?.canceled) return;
    $("#name-dialog").close();
    $("#name-form").reset();
    $("#name-error").textContent = "";
  } catch (e) {
    $("#name-error").textContent = e.message;
  }
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuOpen) menu(false);
});
document.addEventListener("pointerdown", (e) => {
  if (menuOpen && !e.target.closest("#menu,#add,#empty-add")) menu(false);
});
