// Secondary project tools: timeline/source checkpoints and honest interchange.
export function setupProjectTools({ call, showError }) {
  let dialog;
  const close = () => {
    dialog?.remove();
    dialog = null;
  };
  const button = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => void Promise.resolve().then(fn).catch(showError);
    return b;
  };
  const run = async (action, args = {}) =>
    call("project-action", { action, ...args });
  async function open() {
    close();
    dialog = document.createElement("dialog");
    dialog.className = "project-tools-dialog";
    const heading = document.createElement("h2");
    heading.textContent = "Project history";
    dialog.append(heading, button("Close", close));
    const context = await fetch("/api/context", {
      headers: {
        Authorization:
          "Bearer " +
          JSON.parse(sessionStorage.getItem("connection")).editorToken,
      },
    }).then((r) => r.json());
    const revision = context.project.revision;
    dialog.append(
      button("Save checkpoint", async () => {
        const label = prompt("Checkpoint name", "Before next edit");
        if (label === null) return;
        await run("checkpoint-create", { revision, label });
        await open();
      }),
    );
    dialog.append(
      button("Export editing timeline…", async () => {
        const result = await run("interchange-export", { revision });
        const p = document.createElement("p");
        p.textContent = result.path;
        dialog.append(p);
        for (const warning of result.warnings) {
          const t = document.createElement("small");
          t.textContent = warning;
          dialog.append(t);
        }
      }),
    );
    dialog.append(
      button("Import editing timeline…", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".otio,.json";
        input.onchange = async () => {
          try {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 ** 2)
              throw Error("Timeline file must be smaller than 2 MB");
            const timeline = JSON.parse(await file.text());
            if (
              !confirm(
                "Replace footage cuts with this timeline? Current graphics and source files stay in the project.",
              )
            )
              return;
            await run("interchange-import", { revision, timeline });
            close();
          } catch (e) {
            showError(e);
          }
        };
        input.click();
      }),
    );
    if (context.project.previewMode === "rendered")
      dialog.append(
        button("Return to interactive timeline", async () => {
          await run("output-interactive", { revision });
          close();
        }),
      );
    const list = await run("checkpoint-list");
    for (const c of list.checkpoints) {
      const row = document.createElement("section"),
        title = document.createElement("p");
      title.textContent =
        c.label + " · " + new Date(c.createdAt).toLocaleString();
      row.append(
        title,
        button("Review restore…", async () => {
          const d = await run("checkpoint-diff", { id: c.id });
          const text =
            [
              ...d.changed.map((p) => "Restore " + p),
              ...d.removed.map((p) => "Remove " + p),
              ...(d.documentChanged ? ["Restore timeline"] : []),
              ...d.media
                .filter((m) => !m.valid)
                .map((m) => "Missing/changed media: " + m.path),
            ].join("\n") || "No changes";
          if (!confirm(text + "\n\nRestore? Current work will be saved first."))
            return;
          await run("checkpoint-restore", {
            id: c.id,
            revision: d.baseRevision,
          });
          close();
        }),
      );
      dialog.append(row);
    }
    document.body.append(dialog);
    dialog.addEventListener("cancel", close, { once: true });
    dialog.showModal();
  }
  window.addEventListener("message", (e) => {
    if (
      e.origin === location.origin &&
      e.source === document.querySelector("#editor")?.contentWindow &&
      e.data?.type === "cmrx:project-tools"
    )
      void open().catch(showError);
  });
}
