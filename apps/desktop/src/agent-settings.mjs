import { setBrandedText } from "/brand-ui.mjs";
const $ = (s) => document.querySelector(s);
const element = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) setBrandedText(e, text);
  return e;
};
export function setupAgentUI({ call, onError, openTool }) {
  const dialog = $("#settings-dialog"),
    nav = element("nav", null, "settings-tabs"),
    accounts = element("section");
  accounts.dataset.settingsPanel = "accounts";
  for (const node of [
    $("#provider-cards"),
    $(".engine-details"),
    $(".model-preferences"),
  ])
    if (node) accounts.append(node);
  dialog.append(accounts);
  dialog.insertBefore(nav, $("#settings-error"));
  const panels = { accounts };
  let state = {},
    signature = "",
    notesLoaded = false,
    workspaceBaseline = "",
    settingsPending = false;
  const feedback = element("div", null, "settings-feedback");
  feedback.innerHTML =
    '<span class="matrix-loader" aria-hidden="true" hidden></span><span role="status"></span>';
  dialog.append(feedback);
  dialog.addEventListener("close", () => {
    notesLoaded = false;
  });
  for (const [id, title] of [
    ["accounts", "Accounts"],
    ["connections", "Connections"],
    ["skills", "Skills"],
    ["project", "Project"],
  ]) {
    const button = element("button", title);
    button.type = "button";
    button.dataset.tab = id;
    button.onclick = () => {
      if (!settingsPending)
        feedback.querySelector('[role="status"]').textContent = "";
      for (const [key, p] of Object.entries(panels)) p.hidden = key !== id;
      nav
        .querySelectorAll("button")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      load().catch(onError);
    };
    nav.append(button);
    if (id !== "accounts") {
      const section = element("section", null, "agent-settings-panel");
      section.hidden = true;
      section.dataset.settingsPanel = id;
      dialog.append(section);
      panels[id] = section;
    }
  }
  nav.firstChild.setAttribute("aria-pressed", "true");
  dialog.addEventListener("cmrx:provider-settings", () =>
    nav.querySelector('[data-tab="accounts"]').click(),
  );
  panels.connections.innerHTML = `<h3>Secret keys</h3><p class="settings-caption">Name a key, then attach it to a connection. Keys never go into chat.</p><form id="secret-form"><input name="id" type="hidden"><label>Key name<input name="name" required maxlength="100" placeholder="My publishing key"></label><label>Secret key<input name="value" type="password" required autocomplete="new-password" spellcheck="false" placeholder="Paste your key"></label><button type="submit">Save key</button></form><div id="secret-list"></div><h3>Connections</h3><form id="connection-form"><input name="id" type="hidden"><label>Name<input name="name" required maxlength="100" placeholder="Name this tool"></label><label>Type<select name="type"><option value="mcp">MCP server</option><option value="http">HTTP API</option><option value="stdio">Local MCP · advanced</option></select></label><label id="connection-url-label">Address<input name="url" type="url" placeholder="https://example.com/mcp"></label><label>Key<select name="secretId"><option value="">No key needed</option></select></label><details><summary>Advanced</summary><label>Key header<input name="header" value="Authorization"></label><p class="settings-caption">Authorization uses Bearer. Other headers send the key as entered.</p><div id="local-connection-options" hidden><label>Executable<input name="command" placeholder="/absolute/path/to/server"></label><label>Arguments · JSON array<textarea name="args" rows="2">[]</textarea></label><label>Key environment name<input name="envName" value="API_KEY"></label><p class="settings-caption">Local servers run on your device. Choose an executable you trust.</p></div></details><div class="settings-row"><button type="submit">Save connection</button><button type="button" id="connection-reset">Clear</button></div></form><div id="connection-list"></div><p id="key-storage" class="settings-caption"></p>`;
  panels.skills.innerHTML = `<div class="settings-row"><h3>Skills library</h3><button id="skill-install" type="button">Add skill folder</button></div><p class="settings-caption">A folder with SKILL.md, scripts and supporting files.</p><div id="skill-list"></div>`;
  panels.project.innerHTML = `<form id="project-notes-form"><label id="workspace-instructions-label" hidden>Workspace instructions<textarea id="workspace-instructions" rows="4"></textarea></label><label>Project instructions<textarea id="project-instructions" rows="6" placeholder="Audience, style, language, workflow…"></textarea></label><label>Project memory<textarea id="project-memory" rows="6" placeholder="Decisions and preferences to remember…"></textarea></label><button type="submit">Save project notes</button></form>`;
  const keyForm = $("#secret-form"),
    connectionForm = $("#connection-form");
  const run = async (fn) => {
    if (settingsPending) return;
    settingsPending = true;
    const submits = Array.from(
      dialog.querySelectorAll('form button[type="submit"]'),
    ).map((b) => [b, b.disabled]);
    for (const [button] of submits) button.disabled = true;
    feedback.querySelector(".matrix-loader").hidden = false;
    feedback.querySelector('[role="status"]').textContent = "Working…";
    try {
      await fn();
      $("#settings-error").textContent = "";
      await load();
      feedback.querySelector('[role="status"]').textContent = "Done";
    } catch (e) {
      feedback.querySelector('[role="status"]').textContent = "";
      onError(e);
      $("#settings-error").textContent = e.message;
    } finally {
      settingsPending = false;
      feedback.querySelector(".matrix-loader").hidden = true;
      for (const [button, disabled] of submits) button.disabled = disabled;
    }
  };
  keyForm.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(keyForm));
    run(async () => {
      await call("secret-save", data);
      keyForm.reset();
    });
  };
  connectionForm.elements.type.onchange = () => {
    const local = connectionForm.elements.type.value === "stdio";
    $("#connection-url-label").hidden = local;
    $("#local-connection-options").hidden = !local;
    if (local) $("#local-connection-options").parentElement.open = true;
  };
  connectionForm.onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      const data = Object.fromEntries(new FormData(connectionForm));
      data.args = JSON.parse(data.args || "[]");
      await call("connection-save", data);
      connectionForm.reset();
      connectionForm.elements.type.onchange();
    });
  };
  $("#connection-reset").onclick = () => {
    connectionForm.reset();
    connectionForm.elements.type.onchange();
  };
  $("#skill-install").onclick = () => run(() => call("skill-install"));
  $("#project-notes-form").onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      if (
        state.workspaceFolder &&
        $("#workspace-instructions").value !== workspaceBaseline
      ) {
        await call("project-notes", {
          file: "AGENTS.md",
          scope: "workspace",
          expectedText: workspaceBaseline,
          text: $("#workspace-instructions").value,
        });
        workspaceBaseline = $("#workspace-instructions").value;
      }
      await call("project-notes", {
        file: "AGENTS.md",
        text: $("#project-instructions").value,
      });
      await call("project-notes", {
        file: "memory.md",
        text: $("#project-memory").value,
      });
    });
  };
  async function load() {
    const s = await call("agent-settings");
    state = { ...state, ...s };
    if (
      !notesLoaded ||
      $("#workspace-instructions").value === workspaceBaseline
    ) {
      workspaceBaseline = s.workspaceInstructions || "";
      $("#workspace-instructions").value = workspaceBaseline;
    }
    if (!notesLoaded) {
      $("#workspace-instructions-label").hidden = !s.workspaceFolder;
      $("#project-instructions").value = s.instructions;
      $("#project-memory").value = s.memory;
      notesLoaded = true;
    }
    signature = "";
    update(state);
    $("#key-storage").textContent =
      s.keyStorage === "device"
        ? "Keys use this device’s encrypted storage."
        : "Keys are stored in an app-private file on this device.";
  }
  function update(s) {
    state = { ...state, ...s };
    for (const id of ["skills", "project"])
      nav.querySelector(`[data-tab="${id}"]`).hidden =
        state.projectInfo?.selected === false;
    const next = JSON.stringify([
      state.connections,
      state.secrets,
      state.skills,
      state.busy,
    ]);
    if (next !== signature) {
      signature = next;
      const selected = connectionForm.elements.secretId.value;
      connectionForm.elements.secretId.replaceChildren(
        new Option("No key needed", ""),
        ...(state.secrets || []).map((k) => new Option(k.name, k.id)),
      );
      connectionForm.elements.secretId.value = selected;
      $("#secret-list").replaceChildren(
        ...(state.secrets || []).map((k) => {
          const row = element("div", null, "connection-card");
          row.append(element("span", k.name));
          const replace = element("button", "Replace");
          replace.type = "button";
          replace.onclick = () => {
            keyForm.elements.id.value = k.id;
            keyForm.elements.name.value = k.name;
            keyForm.elements.value.value = "";
            keyForm.elements.value.focus();
          };
          const remove = element("button", "Remove");
          remove.type = "button";
          remove.onclick = () => run(() => call("secret-remove", { id: k.id }));
          row.append(replace, remove);
          return row;
        }),
      );
      $("#connection-list").replaceChildren(
        ...(state.connections || []).map((c) => {
          const row = element("section", null, "connection-card");
          const title = element("div");
          title.append(element("strong", c.name), element("small", c.status));
          row.append(title);
          for (const [text, fn] of [
            ["Test", () => run(() => call("connection-test", { id: c.id }))],
            [
              "Edit",
              () => {
                for (const [key, value] of Object.entries(c)) {
                  if (connectionForm.elements[key])
                    connectionForm.elements[key].value = Array.isArray(value)
                      ? JSON.stringify(value)
                      : value;
                }
                connectionForm.elements.type.onchange();
              },
            ],
            [
              "Remove",
              () => run(() => call("connection-remove", { id: c.id })),
            ],
          ]) {
            const b = element("button", text);
            b.type = "button";
            b.onclick = fn;
            row.append(b);
          }
          return row;
        }),
      );
      $("#skill-list").replaceChildren(
        ...(state.skills || []).map((skill) => {
          const row = element("details", null, "skill-card");
          const summary = element("summary", skill.name);
          summary.append(element("small", skill.scope));
          row.append(summary, element("p", skill.description));
          const view = element("button", "Read instructions");
          view.type = "button";
          view.onclick = async () => {
            try {
              const result = await call("agent-skill", { id: skill.id });
              let pre = row.querySelector("pre");
              if (!pre) {
                pre = element("pre");
                row.append(pre);
              }
              pre.textContent = result.text;
            } catch (e) {
              onError(e);
            }
          };
          row.append(view);
          return row;
        }),
      );
    }
    for (const f of [keyForm, connectionForm, $("#project-notes-form")])
      for (const b of f.querySelectorAll("button")) b.disabled = !!state.busy;
    $("#skill-install").disabled = !!state.busy;
    renderActivity(state);
  }
  function renderActivity(s) {
    const root = $("#agent-actions"),
      next = JSON.stringify([s.approvals, s.actions, s.links]);
    if (root.dataset.signature === next) return;
    root.dataset.signature = next;
    root.replaceChildren();
    for (const a of s.approvals || []) {
      const card = element("section", null, "approval-card");
      card.append(element("strong", a.title));
      const details = element("details");
      details.append(element("summary", "Review request"));
      const pre = element("pre");
      pre.textContent = JSON.stringify(a.details, null, 2);
      details.append(pre);
      card.append(details);
      for (const [label, allowed] of [
        ["Run action", true],
        ["Decline", false],
      ]) {
        const button = element("button", label);
        button.type = "button";
        button.onclick = () =>
          call("action-approve", { id: a.id, allowed }).catch(onError);
        card.append(button);
      }
      root.append(card);
    }
    for (const link of s.links || []) {
      const a = element("a", link.title, "tool-link");
      if (link.kind === "external") {
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      } else {
        a.href = "#";
        a.onclick = (e) => {
          e.preventDefault();
          openTool(link);
        };
      }
      root.append(a);
    }
    const latest = s.actions?.at(-1);
    if (latest)
      root.append(
        element("p", `${latest.title} · ${latest.status}`, "settings-caption"),
      );
    root.hidden = !root.childNodes.length;
  }
  $("#settings-open").addEventListener("click", () => load().catch(onError));
  return { update };
}
