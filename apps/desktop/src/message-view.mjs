import { marked } from "./markdown-parser.mjs";

// Parse full Markdown, then build an allowlisted DOM. Never insert model HTML.
export function renderMessage(text, doc = document) {
  const root = doc.createElement("div");
  root.className = "message-body";
  const decoder = doc.createElement("textarea");
  const decode = (value) =>
    String(value || "").replace(
      /&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi,
      (entity) => {
        decoder.innerHTML = entity;
        return decoder.value;
      },
    );
  const element = (tag, parent) => {
    const node = doc.createElement(tag);
    parent.append(node);
    return node;
  };
  function link(parent, href, tokens) {
    // Video review/export belongs to the editor, including in older conversations.
    if (/^artifact:[\w-]{1,100}$/.test(href)) return;
    const a = doc.createElement("a");
    let valid = false;
    if (/^(tool):[\w-]{1,100}$/.test(href)) {
      const [kind, id] = href.split(":");
      a.dataset[kind] = id;
      a.href = "#";
      valid = true;
    } else
      try {
        const url = new URL(href);
        valid =
          !url.username &&
          !url.password &&
          (url.protocol === "https:" ||
            (url.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
        if (valid) {
          a.href = url.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
      } catch {}
    if (valid) {
      parent.append(a);
      inline(a, tokens);
    } else inline(parent, tokens);
  }
  function inline(parent, tokens = []) {
    for (const t of tokens) {
      if (t.type === "link") link(parent, decode(t.href), t.tokens);
      else if (t.type === "image")
        link(parent, decode(t.href), [
          { type: "text", text: t.text || "Image" },
        ]);
      else if (["strong", "em", "del"].includes(t.type))
        inline(element(t.type, parent), t.tokens);
      else if (t.type === "codespan")
        element("code", parent).textContent = t.text;
      else if (t.type === "br") element("br", parent);
      else if (t.type === "checkbox") {
        const box = element("input", parent);
        box.type = "checkbox";
        box.disabled = true;
        box.checked = t.checked;
        box.setAttribute(
          "aria-label",
          t.checked ? "Completed" : "Not completed",
        );
      } else if (t.type === "text" && t.tokens) inline(parent, t.tokens);
      else
        parent.append(
          doc.createTextNode(
            t.type === "html" ? t.text : decode(t.text ?? t.raw ?? ""),
          ),
        );
    }
  }
  function blocks(parent, tokens) {
    for (const t of tokens) {
      switch (t.type) {
        case "space":
          break;
        case "heading":
          inline(
            element("h" + Math.min(6, Math.max(1, t.depth)), parent),
            t.tokens,
          );
          break;
        case "paragraph":
          inline(element("p", parent), t.tokens);
          break;
        case "text":
          inline(parent, t.tokens || [{ type: "text", text: t.text }]);
          break;
        case "checkbox":
          inline(parent, [t]);
          break;
        case "blockquote":
          blocks(element("blockquote", parent), t.tokens);
          break;
        case "list": {
          const list = element(t.ordered ? "ol" : "ul", parent);
          if (t.ordered && t.start !== 1) list.start = t.start;
          for (const item of t.items) blocks(element("li", list), item.tokens);
          break;
        }
        case "code": {
          const pre = element("pre", parent);
          pre.dataset.language = (t.lang || "").split(/\s/)[0].slice(0, 40);
          element("code", pre).textContent = t.text;
          break;
        }
        case "hr":
          element("hr", parent);
          break;
        case "table": {
          const wrapper = element("div", parent);
          wrapper.className = "markdown-table";
          const table = element("table", wrapper);
          const row = (parent, cells, tag) => {
            const tr = element("tr", parent);
            for (const c of cells) {
              const cell = element(tag, tr);
              if (["left", "center", "right"].includes(c.align))
                cell.style.textAlign = c.align;
              inline(cell, c.tokens);
            }
          };
          row(element("thead", table), t.header, "th");
          const body = element("tbody", table);
          for (const cells of t.rows) row(body, cells, "td");
          break;
        }
        default:
          parent.append(doc.createTextNode(t.raw || t.text || ""));
      }
    }
  }
  blocks(root, marked.lexer(String(text || ""), { gfm: true, breaks: false }));
  return root;
}
