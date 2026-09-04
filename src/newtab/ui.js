// Small UI helpers: dialogs, toast, context menu.

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

let toastTimer = null;
export function toast(message, ms = 3200) {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const t = el("div", { class: "toast", text: message });
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), ms);
}

/**
 * Opens a modal dialog. `build(api)` receives {close, footer, body}.
 * Resolves with whatever is passed to close().
 */
export function openDialog({ title, wide = false, build, onClose }) {
  return new Promise((resolve) => {
    const body = el("div", { class: "body" });
    const footer = el("footer");

    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      backdrop.remove();
      document.removeEventListener("keydown", onKey, true);
      onClose?.(value);
      resolve(value);
    };

    const dialog = el(
      "div",
      { class: "dialog" + (wide ? " wide" : "") },
      el(
        "header",
        {},
        el("span", { text: title }),
        el("button", { class: "close", title: "Close", onclick: () => close(null) }, "×")
      ),
      body,
      footer
    );

    const backdrop = el("div", {
      class: "backdrop",
      onmousedown: (e) => {
        if (e.target === backdrop) close(null);
      }
    });
    backdrop.appendChild(dialog);

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(backdrop);
    build({ close, body, footer, dialog });
    body.querySelector("input, select, button")?.focus();
  });
}

export function confirmDialog(title, message, { danger = false, okLabel = "Delete" } = {}) {
  return openDialog({
    title,
    build: ({ close, body, footer }) => {
      body.appendChild(el("p", { class: "note", text: message }));
      footer.append(
        el("button", { class: "btn", onclick: () => close(false) }, "Cancel"),
        el(
          "button",
          { class: "btn " + (danger ? "danger" : "primary"), onclick: () => close(true) },
          okLabel
        )
      );
    }
  });
}

export function contextMenu(x, y, entries) {
  document.querySelector(".ctx-menu")?.remove();
  const menu = el("div", { class: "ctx-menu" });

  for (const entry of entries) {
    if (entry === "-") {
      menu.appendChild(el("hr"));
      continue;
    }
    menu.appendChild(
      el("button", {
        class: entry.danger ? "danger" : "",
        text: entry.label,
        onclick: () => {
          menu.remove();
          entry.run();
        }
      })
    );
  }

  menu.style.visibility = "hidden";
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + "px";
  menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + "px";
  menu.style.visibility = "visible";

  const dismiss = (e) => {
    if (menu.contains(e.target)) return;
    menu.remove();
    document.removeEventListener("mousedown", dismiss, true);
    document.removeEventListener("scroll", dismiss, true);
  };
  setTimeout(() => {
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("scroll", dismiss, true);
  });
  return menu;
}

export function field(label, input) {
  return el("div", { class: "field" }, el("label", { text: label }), input);
}

export function row(label, hint, control) {
  return el(
    "div",
    { class: "row" },
    el("div", { class: "label" }, label, hint ? el("small", { text: hint }) : null),
    control
  );
}

export function slider(value, min, max, step, format, onInput) {
  const val = el("span", { class: "val", text: format(value) });
  const input = el("input", {
    type: "range",
    min,
    max,
    step,
    value,
    oninput: (e) => {
      const v = Number(e.target.value);
      val.textContent = format(v);
      onInput(v);
    }
  });
  return el("div", { style: "display:flex;align-items:center;gap:10px" }, input, val);
}

export function toggle(checked, onChange) {
  const input = el("input", {
    type: "checkbox",
    checked: checked ? "checked" : false,
    onchange: (e) => onChange(e.target.checked)
  });
  return el(
    "label",
    { class: "switch" },
    input,
    el("span", { class: "track" }, el("span", { class: "knob" }))
  );
}

/** A titled group of rows, so a tab reads as sections rather than one long list. */
export function section(title, hint, ...rows) {
  return el(
    "div",
    { class: "section" },
    el("h3", { class: "sub", text: title }),
    hint ? el("p", { class: "note section-hint", text: hint }) : null,
    ...rows
  );
}
