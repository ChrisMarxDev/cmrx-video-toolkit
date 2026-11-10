import { setBrandedText } from "/brand-ui.mjs";
// One shared, accessible confirmation for shared assets and configuration.
let active = false;
export function confirmRemoval({ kind, name }) {
  if (active) return Promise.resolve(false);
  active = true;
  const origin = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";
  dialog.setAttribute("aria-labelledby", "removal-title");
  dialog.setAttribute("aria-describedby", "removal-description");
  const title = document.createElement("h2");
  title.id = "removal-title";
  const trash = kind === "asset";
  title.textContent = trash ? "Move asset to trash?" : `Remove ${kind}?`;
  const description = document.createElement("p");
  description.id = "removal-description";
  description.textContent = trash
    ? `“${name}” will move to trash. Project copies stay available.`
    : kind === "key"
      ? `“${name}” will be removed. Connections using it may need a replacement.`
      : `“${name}” will be removed from your saved connections.`;
  setBrandedText(description, description.textContent);
  const actions = document.createElement("div");
  actions.className = "confirm-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.autofocus = true;
  cancel.onclick = () => dialog.close("cancel");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger-button";
  remove.textContent = trash ? "Move to trash" : `Remove ${kind}`;
  remove.onclick = () => dialog.close("remove");
  actions.append(cancel, remove);
  dialog.append(title, description, actions);
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        const confirmed = dialog.returnValue === "remove";
        active = false;
        dialog.remove();
        if (origin?.isConnected && !origin.disabled) origin.focus();
        resolve(confirmed);
      },
      { once: true },
    );
    dialog.showModal();
    cancel.focus();
  });
}
