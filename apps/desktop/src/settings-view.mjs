import { providerLogo, setBrandedText } from "/brand-ui.mjs";
const $ = (s) => document.querySelector(s);
export function setupProviderUI({ call, onError }) {
  let state,
    signature = "",
    catalogSignature = "",
    pending = false;
  const dialog = $("#settings-dialog"),
    cards = $("#provider-cards"),
    modelSelect = $("#model-select"),
    effortSelect = $("#effort-select");
  const cardNodes = new Map();
  const elem = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    if (text && !["option", "select"].includes(tag)) setBrandedText(e, text);
    return e;
  };
  const report = (e) => {
    $("#settings-error").textContent = e.message;
    onError(e);
  };
  async function action(name, body) {
    pending = true;
    update(state);
    $("#settings-error").textContent = "";
    try {
      return await call(name, body);
    } catch (e) {
      report(e);
      throw e;
    } finally {
      pending = false;
      update(state);
    }
  }
  for (const id of ["chatgpt", "claude"]) {
    const name = id === "chatgpt" ? "ChatGPT" : "Claude",
      card = elem("section", "provider-card");
    card.dataset.provider = id;
    const heading = elem("div", "provider-heading"),
      title = elem("h3", "", name),
      status = elem("span", "provider-state", "Not connected");
    heading.append(title, status);
    const copy = elem(
      "p",
      "provider-copy",
      id === "chatgpt"
        ? "Your subscription, connected here."
        : "Your subscription, connected here.",
    );
    const detail = elem("p", "provider-detail"),
      error = elem("p", "provider-error");
    let method;
    if (id === "claude") {
      const label = elem("label", "signin-method", "Sign-in method");
      method = elem("select");
      method.setAttribute("aria-label", "Claude sign-in method");
      for (const [value, text] of [
        ["subscription", "Subscription"],
        ["console", "Console · API billing"],
      ]) {
        const o = elem("option", "", text);
        o.value = value;
        method.append(o);
      }
      label.append(method);
      card.append(label);
    }
    const actions = elem("div", "provider-actions"),
      login = elem("button", "primary", "Connect " + name),
      refresh = elem("button", "", "Check connection"),
      use = elem("button", "", "Use " + name),
      logout = elem("button", "quiet-button", "Sign out"),
      cancel = elem("button", "quiet-button", "Cancel sign-in");
    for (const button of [login, refresh, use, logout, cancel])
      button.type = "button";
    const link = elem("a", "auth-link", "Continue sign-in in your browser");
    link.target = "_blank";
    link.rel = "noopener";
    link.hidden = true;
    login.onclick = async () => {
      try {
        const result = await action("login", {
          provider: id,
          method: method?.value,
        });
        update({ ...state, ...result });
        if (
          result.url &&
          !state.providers.find((p) => p.id === id)?.connected
        ) {
          link.href = result.url;
          link.hidden = false;
        }
      } catch {}
    };
    refresh.onclick = () =>
      action("refresh-provider", { provider: id }).catch(() => {});
    logout.onclick = () => action("logout", { provider: id }).catch(() => {});
    cancel.onclick = () => call("cancel-login", { provider: id }).catch(report);
    use.onclick = async () => {
      const entry = state.providers.find((p) => p.id === id),
        model =
          entry.models.find((m) => m.id === entry.selectedModel) ||
          entry.models.find((m) => m.isDefault) ||
          entry.models[0];
      try {
        const result = await action("model", { provider: id, model: model.id });
        update({ ...state, ...result });
        dialog.close();
      } catch {}
    };
    actions.append(login, use, refresh, logout, cancel);
    card.prepend(heading, copy, detail, error);
    card.append(actions, link);
    cards.append(card);
    cardNodes.set(id, {
      status,
      detail,
      error,
      login,
      refresh,
      use,
      logout,
      cancel,
      link,
      method,
    });
  }
  async function open(provider) {
    $("#settings-error").textContent = "";
    if (!dialog.open) dialog.showModal();
    if (provider) dialog.dispatchEvent(new Event("cmrx:provider-settings"));
    if (provider)
      cards
        .querySelector(`[data-provider="${provider}"]`)
        ?.scrollIntoView({ block: "nearest" });
    try {
      const result = await call("settings");
      update({ ...state, ...result });
    } catch (e) {
      report(e);
    }
  }
  $("#settings-open").onclick = () => open();
  $("#settings-close").onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  };
  $("#connect-provider").onclick = () => open(state?.provider);
  modelSelect.onchange = async () => {
    const [provider, model] = JSON.parse(modelSelect.value);
    if (!model) {
      open(provider);
      update(state);
      return;
    }
    try {
      const result = await action("model", { provider, model });
      update({ ...state, ...result });
      if (!state.providers.find((p) => p.id === provider)?.connected)
        open(provider);
    } catch {
      update(state);
    }
  };
  effortSelect.onchange = async () => {
    try {
      const result = await action("model", {
        provider: state.provider,
        model: state.model,
        effort: effortSelect.value,
      });
      update({ ...state, ...result });
    } catch {
      update(state);
    }
  };
  function update(next) {
    if (!next?.providers) return;
    state = next;
    const selected = state.providers.find((p) => p.id === state.provider),
      model = selected?.models.find((m) => m.id === state.model);
    const catalog = JSON.stringify(
      state.providers.map((p) => ({
        id: p.id,
        name: p.name,
        models: p.models,
        connected: p.connected,
      })),
    );
    if (catalog !== catalogSignature) {
      catalogSignature = catalog;
      modelSelect.replaceChildren();
      const pickerButton = elem("button");
      pickerButton.type = "button";
      pickerButton.append(elem("selectedcontent"));
      modelSelect.append(pickerButton);
      for (const provider of state.providers) {
        const group = elem("optgroup");
        group.label =
          provider.name +
          (provider.id === "claude" &&
          provider.authMethod?.toLowerCase().includes("api")
            ? " · API billing"
            : "");
        const legend = elem("legend");
        legend.append(
          providerLogo(provider.id),
          document.createTextNode(group.label),
        );
        group.append(legend);
        if (!provider.models.length) {
          const o = elem("option", "", "Set up " + provider.name + "…");
          o.value = JSON.stringify([provider.id, ""]);
          o.prepend(providerLogo(provider.id));
          group.append(o);
        }
        for (const m of provider.models) {
          const o = elem(
            "option",
            "",
            m.name + (provider.connected ? "" : " · connect"),
          );
          o.value = JSON.stringify([provider.id, m.id]);
          o.prepend(providerLogo(provider.id));
          o.title = m.description || "";
          group.append(o);
        }
        modelSelect.append(group);
      }
    }
    modelSelect.value = JSON.stringify([
      state.provider,
      selected?.models.length ? state.model : "",
    ]);
    modelSelect.disabled =
      pending || state.busy || state.switching || !!state.queue?.length;
    $("#model-status").classList.toggle("connected", !!selected?.connected);
    $("#model-status").title = selected?.connected
      ? selected.name + " connected"
      : "Connect " + selected?.name;
    $("#connect-provider").hidden = !!selected?.connected;
    setBrandedText(
      $("#connect-provider"),
      "Connect " + (selected?.name || "provider"),
    );
    const efforts = model?.efforts || [];
    const effortSignature = JSON.stringify([
      state.provider,
      state.model,
      efforts,
    ]);
    if (signature !== effortSignature) {
      signature = effortSignature;
      effortSelect.replaceChildren();
      for (const effort of efforts.length ? efforts : [""]) {
        const o = elem(
          "option",
          "",
          effort
            ? { xhigh: "Extra high", max: "Maximum" }[effort] ||
                effort[0].toUpperCase() + effort.slice(1)
            : "Provider default",
        );
        o.value = effort;
        effortSelect.append(o);
      }
    }
    effortSelect.value = efforts.includes(state.effort) ? state.effort : "";
    effortSelect.disabled =
      pending || state.busy || !!state.queue?.length || efforts.length < 2;
    $("#settings-selected-model").textContent =
      model?.name || "Choose a model in the chat composer.";
    for (const entry of state.providers) {
      const n = cardNodes.get(entry.id),
        busy = pending || state.busy;
      n.status.textContent = entry.preparing
        ? "Preparing…"
        : entry.authenticating
          ? "Finish sign-in in your browser"
          : entry.connected
            ? "Connected"
            : "Not connected";
      n.status.classList.toggle("connected", entry.connected);
      setBrandedText(
        n.detail,
        entry.preparing?.text ||
          (entry.connected
            ? entry.id === "chatgpt"
              ? "ChatGPT subscription"
              : entry.authMethod?.toLowerCase().includes("api")
                ? "Claude Console / API billing"
                : entry.plan
                  ? "Claude " + entry.plan + " plan"
                  : "Claude Code account"
            : entry.authenticating
              ? "A secure sign-in page opens in your browser. Return here when you’re done."
              : "Usage limits follow your plan."),
      );
      setBrandedText(
        n.error,
        entry.error || (entry.connected ? entry.catalogError : "") || "",
      );
      n.login.hidden =
        entry.connected || entry.authenticating || !!entry.preparing;
      n.login.disabled = busy;
      n.use.hidden = !entry.connected || state.provider === entry.id;
      n.use.disabled = busy;
      n.refresh.disabled = busy;
      n.refresh.hidden = !entry.authenticating || !!entry.preparing;
      n.logout.hidden = !entry.connected;
      n.logout.disabled = busy;
      n.cancel.hidden = !entry.authenticating && !entry.preparing;
      n.cancel.textContent = entry.preparing ? "Cancel" : "Cancel sign-in";
      n.cancel.disabled = !!state.busy;
      if (n.method) n.method.disabled = busy || entry.authenticating;
      if (entry.connected || !entry.authenticating) n.link.hidden = true;
    }
  }
  return { update, open };
}
