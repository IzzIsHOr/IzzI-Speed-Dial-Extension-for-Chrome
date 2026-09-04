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

const MENU_ICONS = {
  open: "M14 3h7v7M21 3l-9 9M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  copy: "M10 8h9v12h-9zM5 16V4h9",
  rename: "M4 20h16M7 15l9-9 3 3-9 9H7z",
  folder: "M3 7h6l2 2h10v10H3z",
  out: "M10 12h11M17 8l4 4-4 4M14 4H5v16h9",
  trash: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13",
  plus: "M12 5v14M5 12h14",
  gear: "M4 7h16M4 12h16M4 17h16",
  tick: "M4 12.5l5 5L20 7"
};

function menuIcon(name, cls = "ico") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", cls);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", MENU_ICONS[name] || MENU_ICONS.open);
  svg.appendChild(path);
  return svg;
}

export function contextMenu(x, y, entries) {
  document.querySelector(".ctx-menu")?.remove();
  const menu = el("div", { class: "ctx-menu" });

  for (const entry of entries) {
    if (entry === "-") {
      menu.appendChild(el("hr"));
      continue;
    }
    const item = el("button", {
      class: (entry.danger ? "danger" : "") + (entry.checked ? " checked" : ""),
      onclick: () => {
        menu.remove();
        entry.run();
      }
    });
    if (entry.icon) item.appendChild(menuIcon(entry.icon));
    item.appendChild(el("span", { text: entry.label }));
    if (entry.checked) item.appendChild(menuIcon("tick", "tick"));
    menu.appendChild(item);
  }

  menu.style.visibility = "hidden";
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - r.width - 8);
  const top = Math.min(y, window.innerHeight - r.height - 8);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  // grow from whichever corner is nearest the click
  menu.style.transformOrigin = `${x - left}px ${y - top}px`;
  menu.style.visibility = "visible";
  menu.classList.add("in");

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
  // the track is a gradient, so --fill has to follow the value for the
  // filled part to end where the thumb is
  const fill = (v) => ((v - min) / (max - min)) * 100 + "%";
  const input = el("input", {
    type: "range",
    min,
    max,
    step,
    value,
    style: "--fill:" + fill(value),
    oninput: (e) => {
      const v = Number(e.target.value);
      e.target.style.setProperty("--fill", fill(v));
      val.textContent = format(v);
      onInput(v);
    }
  });
  return el("div", { class: "slider-wrap" }, input, val);
}

/**
 * A dropdown that belongs to the extension rather than the operating system.
 * A native <select> cannot have its popup styled at all, so this draws its own.
 */
export function dropdown(value, options, onChange) {
  const current = () => options.find((o) => o.value === value) || options[0];
  const label = el("span", { text: current().label });
  const button = el(
    "button",
    { class: "dropdown", type: "button" },
    label,
    el("i", { class: "caret" })
  );

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = button.getBoundingClientRect();
    const menu = contextMenu(
      r.left,
      r.bottom + 6,
      options.map((o) => ({
        label: o.label,
        checked: o.value === value,
        run: () => {
          value = o.value;
          label.textContent = o.label;
          onChange(o.value);
        }
      }))
    );
    menu.style.minWidth = r.width + "px";
  });

  return button;
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
