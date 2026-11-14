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
    b.type = "button";
    b.onclick = () => void Promise.resolve().then(fn).catch(report);
    return b;
  };
  function report(error) {
    if (!dialog?.isConnected) {
      showError(error);
      return;
    }
    let message = dialog.querySelector("[role=alert]");
    if (!message) {
      message = document.createElement("p");
      message.setAttribute("role", "alert");
      dialog.append(message);
    }
    message.textContent = error.message;
  }
  function review(text, label, accept, enabled = true) {
    dialog.querySelector(".checkpoint-review")?.remove();
    const box = document.createElement("section");
    box.className = "checkpoint-review";
    const description = document.createElement("pre");
    description.textContent = text;
    const proceed = button(label, accept);
    proceed.disabled = !enabled;
    box.append(
      description,
      button("Cancel", () => box.remove()),
      proceed,
    );
    dialog.append(box);
    box.scrollIntoView({ block: "nearest" });
  }
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
      button("Save checkpoint", () => {
        if (dialog.querySelector(".checkpoint-name")) {
          dialog.querySelector(".checkpoint-name input").focus();
          return;
        }
        const form = document.createElement("form");
        form.className = "checkpoint-name";
        const label = document.createElement("label");
        label.textContent = "Checkpoint name";
        const input = document.createElement("input");
        input.required = true;
        input.maxLength = 200;
        input.value = "Before next edit";
        label.append(input);
        const save = document.createElement("button");
        save.type = "submit";
        save.textContent = "Save";
        form.append(
          label,
          button("Cancel", () => form.remove()),
          save,
        );
        form.onsubmit = async (e) => {
          e.preventDefault();
          save.disabled = true;
          try {
            await run("checkpoint-create", { revision, label: input.value });
            await open();
          } catch (error) {
            report(error);
            save.disabled = false;
          }
        };
        dialog.append(form);
        input.focus();
        input.select();
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
            review(
              "Replace footage cuts? Graphics and source files stay in the project.",
              "Import timeline",
              async () => {
                await run("interchange-import", { revision, timeline });
                close();
              },
            );
          } catch (e) {
            report(e);
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
          review(
            text + "\n\nCurrent work will be saved first.",
            "Restore checkpoint",
            async () => {
              await run("checkpoint-restore", {
                id: c.id,
                revision: d.baseRevision,
              });
              close();
            },
            d.media.every((m) => m.valid),
          );
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
