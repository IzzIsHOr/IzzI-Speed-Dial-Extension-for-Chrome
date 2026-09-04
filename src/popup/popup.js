// Adds the current page as a shortcut without opening a new tab.
// The tab's address is read through activeTab, so only at the moment you press
// the extension button.

import { el, field, toast } from "../newtab/ui.js";
import { loadDoc, saveDoc, newId } from "../lib/store.js";
import { faviconUrl } from "../lib/icons.js";
import { initialFor, hostOf, normalizeUrl } from "../lib/imgutil.js";
import { TILE_COLORS } from "../lib/defaults.js";

const host = document.getElementById("form");

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const doc = await loadDoc();

  const url = tab && tab.url && /^https?:/i.test(tab.url) ? tab.url : "";
  if (!url) {
    host.appendChild(
      el("p", { class: "note", text: "This page cannot be added; it is not an http address." })
    );
    return;
  }

  const draft = {
    type: "link",
    name: (tab.title || hostOf(url)).slice(0, 60),
    url,
    icon: { kind: "favicon", bg: "#ffffff" },
    page: doc.pages[0].id
  };

  const preview = el("div", { class: "icon-preview" });

  const nameInput = el("input", {
    type: "text",
    value: draft.name,
    oninput: (e) => {
      draft.name = e.target.value;
      paint();
    }
  });

  const pageSel = el(
    "select",
    { onchange: (e) => (draft.page = e.target.value) },
    ...doc.pages.map((p) => el("option", { value: p.id }, p.name))
  );

  const swatches = el(
    "div",
    { class: "swatches" },
    el("button", {
      class: "swatch",
      style: "background:#fff;border:1px solid #ccc",
      title: "favicon",
      onclick: () => {
        draft.icon = { kind: "favicon", bg: "#ffffff" };
        paint();
      }
    }),
    ...TILE_COLORS.map((c) =>
      el("button", {
        class: "swatch",
        style: "background:" + c,
        title: c,
        onclick: () => {
          draft.icon = { kind: "tile", bg: c, text: initialFor(draft.name || hostOf(url)) };
          paint();
        }
      })
    )
  );

  host.append(
    el(
      "div",
      { class: "icon-editor" },
      preview,
      el(
        "div",
        { class: "icon-sources" },
        el("div", { class: "note", text: hostOf(url) }),
        el("div", {
          class: "note",
          style: "word-break:break-all;opacity:.75",
          text: url.slice(0, 120)
        })
      )
    ),
    field("Name", nameInput),
    field("Page", pageSel),
    el("div", { class: "field" }, el("label", { text: "Icon" }), swatches),
    el(
      "div",
      { class: "actions" },
      el(
        "button",
        {
          class: "btn",
          onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL("src/newtab/index.html") })
        },
        "Open the page"
      ),
      el("button", { class: "btn primary", onclick: add }, "Add")
    ),
    el("p", {
      class: "note",
      style: "margin-top:10px",
      text: "To crop an icon out of an image, edit the shortcut from the start page."
    })
  );

  function paint() {
    preview.textContent = "";
    preview.style.backgroundColor = "";
    if (draft.icon.kind === "tile") {
      preview.style.backgroundColor = draft.icon.bg;
      preview.appendChild(el("span", { text: draft.icon.text || initialFor(draft.name) }));
    } else {
      preview.style.backgroundColor = "#fff";
      preview.appendChild(el("img", { src: faviconUrl(url, 128), alt: "" }));
    }
  }
  paint();

  async function add() {
    // reload rather than reuse: the start page may have changed while this was open
    const fresh = await loadDoc();
    const onPage = fresh.items.filter((i) => i.page === draft.page);
    fresh.items.push({
      ...draft,
      name: draft.name.trim() || hostOf(url),
      url: normalizeUrl(draft.url),
      id: newId(),
      pos: onPage.length
    });
    await saveDoc(fresh);
    toast("Added.");
    setTimeout(() => window.close(), 550);
  }
}

main().catch((e) => {
  host.appendChild(el("p", { class: "note", text: "Error: " + e.message }));
});
