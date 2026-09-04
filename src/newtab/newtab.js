// The start page: grid, folders, pages, drag & drop, search.

import { applyLayout } from "../lib/layout.js";
import { SEARCH_ENGINES, seedDoc } from "../lib/defaults.js";
import {
  loadDoc,
  hasStoredDoc,
  saveDoc,
  loadSettings,
  saveSettings,
  getWallpaper,
  newId,
  gcBlobs,
  pullSync,
  onRemoteChange
} from "../lib/store.js";
import { paintIcon, paintFolder } from "../lib/icons.js";
import { normalizeUrl } from "../lib/imgutil.js";
import { el, toast, contextMenu, confirmDialog } from "./ui.js";
import { itemDialog, renameDialog } from "./editor.js";
import { settingsDialog } from "./settings.js";

const $ = (sel) => document.querySelector(sel);

const MAX_PAGES = 12;

let settings = null;
let doc = null;
let pageIndex = 0;
let firstPaint = true;

/* ------------------------------------------------------------- the document */

const capacity = () => settings.layout.row * settings.layout.col;

function itemsOfPage(pageId) {
  return doc.items.filter((i) => i.page === pageId).sort((a, b) => a.pos - b.pos);
}

/** Pushes only the overflow to the next page. Pages that fit are left alone. */
function normalize() {
  const cap = capacity();
  for (let p = 0; p < doc.pages.length; p++) {
    const list = itemsOfPage(doc.pages[p].id);
    list.forEach((it, i) => (it.pos = i));
    if (list.length <= cap) continue;

    const overflow = list.slice(cap);
    if (p === doc.pages.length - 1) {
      doc.pages.push({ id: "p" + newId(), name: "Page " + (doc.pages.length + 1) });
    }
    const nextId = doc.pages[p + 1].id;
    itemsOfPage(nextId).forEach((it) => (it.pos += overflow.length));
    overflow.forEach((it, i) => {
      it.page = nextId;
      it.pos = i;
    });
  }

  // drop trailing empty pages, but never the last one and never the one on screen
  while (
    doc.pages.length > 1 &&
    pageIndex < doc.pages.length - 1 &&
    itemsOfPage(doc.pages[doc.pages.length - 1].id).length === 0
  ) {
    doc.pages.pop();
  }
  if (pageIndex >= doc.pages.length) pageIndex = doc.pages.length - 1;
}

async function commit() {
  normalize();
  await saveDoc(doc);
  render();
}

function findItem(id) {
  let found = null;
  const walk = (list, parent) => {
    for (const it of list) {
      if (it.id === id) found = { item: it, list, parent };
      else if (it.type === "folder") walk(it.children || [], it);
    }
  };
  walk(doc.items, null);
  return found;
}

/* ----------------------------------------------------------------- drawing */

function render() {
  applyLayout(settings, window);
  renderWallpaperColor();
  renderSearch();
  renderGrid();
  renderPagination();
}

// Cached here because render() runs on every drag, page switch and settings
// tweak, and each of those has to repaint the wallpaper without re-reading
// several megabytes out of storage.
//   undefined = not read yet, null = nothing stored, string = the data URL
let wallpaperData;

async function loadWallpaperImage() {
  wallpaperData = (await getWallpaper()) || null;
  renderWallpaperColor();
}

function renderWallpaperColor() {
  const wp = $("#wallpaper");

  if (settings.wallpaper.kind === "color") {
    // the gradient, when a theme set one, rides on top of the flat colour
    wp.style.backgroundImage = settings.wallpaper.gradient || "";
    wp.style.backgroundColor = settings.wallpaper.color;
    return;
  }

  wp.style.backgroundColor = "#111";
  if (wallpaperData === undefined) {
    loadWallpaperImage(); // repaints itself once the read comes back
    return;
  }
  wp.style.backgroundImage = wallpaperData ? `url("${wallpaperData}")` : "";
}

function renderSearch() {
  $("#searchWrap").classList.toggle("hide", !settings.search.show);
  const engine = SEARCH_ENGINES[settings.search.engine] || SEARCH_ENGINES.google;
  const badge = $("#engineBadge");
  badge.textContent = engine.letter;
  badge.style.background = engine.color;
  $("#searchInput").placeholder = "Search " + engine.name + ", or type a URL";
  $("#searchForm").classList.toggle("shadow", settings.search.shadow);
}

function renderGrid() {
  const host = $("#siteItems");
  host.textContent = "";

  const card = el("div", { class: "items-card" });
  const list = itemsOfPage(doc.pages[pageIndex].id);
  const cap = capacity();

  for (let i = 0; i < cap; i++) {
    card.appendChild(list[i] ? iconNode(list[i], i) : emptyNode(i));
  }
  host.appendChild(card);
}

function emptyNode(index) {
  const cell = el("div", { class: "icon empty" });
  cell.appendChild(el("div", { class: "icon-content" }));
  cell.appendChild(el("div", { class: "icon-name" }));
  cell.addEventListener("click", () => addItem(index));
  wireDropTarget(cell, null, index);
  return cell;
}

function iconNode(item, index) {
  const cell = el("a", {
    class: "icon" + (settings.icon.shadow ? " icon-shadow" : ""),
    href: item.type === "link" ? item.url : "#",
    draggable: "true",
    title: item.type === "link" ? item.url : item.name
  });

  if (firstPaint && settings.icon.startAnimation) {
    cell.classList.add("start-animate");
    cell.style.animationDelay = index * 18 + "ms";
  }

  const content = el("div", { class: "icon-content" });
  const name = el("div", {
    class: "icon-name" + (settings.icon.fontShadow ? " shadow" : ""),
    text: item.name
  });
  cell.append(content, name);

  if (item.type === "folder") paintFolder(content, item);
  else paintIcon(content, item);

  cell.addEventListener("click", (e) => {
    e.preventDefault();
    if (item.type === "folder") openFolder(item.id);
    else openLink(item.url, e);
  });

  cell.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    itemMenu(e, item);
  });

  wireDragSource(cell, item);
  wireDropTarget(cell, item, index);
  return cell;
}

function openLink(url, e) {
  const newTab = settings.behavior.openInNewTab || e.ctrlKey || e.metaKey || e.button === 1;
  if (newTab) window.open(url, "_blank", "noopener");
  else window.location.href = url;
}

/* ------------------------------------------------------------ drag & drop */

let dragId = null;
let dwellTimer = null;
let mergeTarget = null;

function wireDragSource(node, item) {
  node.addEventListener("dragstart", (e) => {
    dragId = item.id;
    node.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
  });
  node.addEventListener("dragend", () => {
    node.classList.remove("dragging");
    dragId = null;
    clearDwell();
  });
}

function clearDwell() {
  clearTimeout(dwellTimer);
  dwellTimer = null;
  document.querySelectorAll(".drop-target").forEach((n) => n.classList.remove("drop-target"));
  mergeTarget = null;
}

function wireDropTarget(node, item, index) {
  node.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // hovering over another icon long enough turns the pair into a folder
    const mergeable = item && item.id !== dragId;
    if (mergeable && mergeTarget !== item.id && !dwellTimer) {
      dwellTimer = setTimeout(() => {
        mergeTarget = item.id;
        node.classList.add("drop-target");
      }, 650);
    }
  });

  node.addEventListener("dragleave", () => {
    if (mergeTarget !== (item && item.id)) clearDwell();
  });

  node.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = dragId || e.dataTransfer.getData("text/plain");
    const merge = mergeTarget;
    clearDwell();
    if (!id) return;

    if (merge && merge !== id) await mergeIntoFolder(id, merge);
    else await moveTo(id, index);
  });
}

async function moveTo(id, index) {
  const found = findItem(id);
  if (!found) return;
  const { item, parent } = found;
  const pageId = doc.pages[pageIndex].id;

  // lift it out of whatever folder it was in
  if (parent) {
    parent.children = parent.children.filter((c) => c.id !== id);
    doc.items.push(item);
    if (parent.children.length === 0) {
      doc.items = doc.items.filter((i) => i.id !== parent.id);
    } else if (parent.children.length === 1) {
      const last = parent.children[0];
      last.page = parent.page;
      last.pos = parent.pos;
      doc.items = doc.items.filter((i) => i.id !== parent.id);
      doc.items.push(last);
    }
    document.querySelector(".folder-overlay")?.remove();
  }

  const list = itemsOfPage(pageId).filter((i) => i.id !== id);
  list.splice(Math.min(index, list.length), 0, item);
  item.page = pageId;
  list.forEach((it, i) => (it.pos = i));

  await commit();
}

async function mergeIntoFolder(sourceId, targetId) {
  const a = findItem(sourceId);
  const b = findItem(targetId);
  if (!a || !b) return;

  if (a.parent) a.parent.children = a.parent.children.filter((c) => c.id !== sourceId);
  else doc.items = doc.items.filter((i) => i.id !== sourceId);

  if (b.item.type === "folder") {
    b.item.children.push(a.item);
  } else {
    const folder = {
      id: newId(),
      type: "folder",
      name: "Folder",
      children: [b.item, a.item],
      page: b.item.page,
      pos: b.item.pos
    };
    doc.items = doc.items.filter((i) => i.id !== b.item.id);
    doc.items.push(folder);
  }

  delete a.item.page;
  delete a.item.pos;
  await commit();
  toast("Folder created. Right-click it to rename.");
}

/* ------------------------------------------------------------------ pages */

function renderPagination() {
  const nav = $("#pagination");
  nav.textContent = "";
  nav.classList.toggle("hide", !settings.behavior.showPageDots);

  doc.pages.forEach((p, i) => {
    const dot = el("button", {
      class: "dot" + (i === pageIndex ? " active" : ""),
      title: p.name,
      onclick: () => {
        pageIndex = i;
        render();
      },
      oncontextmenu: (e) => {
        e.preventDefault();
        pageMenu(e, i);
      }
    });
    // an icon can be dropped straight onto a page dot to move it there
    dot.addEventListener("dragover", (e) => {
      if (dragId) e.preventDefault();
    });
    dot.addEventListener("drop", async (e) => {
      e.preventDefault();
      const id = dragId || e.dataTransfer.getData("text/plain");
      clearDwell();
      if (!id) return;
      const found = findItem(id);
      if (!found) return;
      found.item.page = p.id;
      found.item.pos = itemsOfPage(p.id).length;
      await commit();
    });
    nav.appendChild(dot);
  });

  // The "+" dot stays one page ahead at most. Without this guard it made a new
  // empty page on every single click, forever.
  const lastEmpty = itemsOfPage(doc.pages[doc.pages.length - 1].id).length === 0;
  if (doc.pages.length < MAX_PAGES) {
    nav.appendChild(
      el("button", {
        class: "dot add",
        title: lastEmpty ? "Go to the empty page" : "Add a page",
        onclick: async () => {
          if (lastEmpty) {
            pageIndex = doc.pages.length - 1;
            render();
            return;
          }
          doc.pages.push({ id: "p" + newId(), name: "Page " + (doc.pages.length + 1) });
          pageIndex = doc.pages.length - 1;
          await saveDoc(doc);
          render();
        }
      })
    );
  }

  $("#pagePrev").classList.toggle("hide", pageIndex === 0);
  $("#pageNext").classList.toggle("hide", pageIndex >= doc.pages.length - 1);
}

function pageMenu(e, i) {
  contextMenu(e.clientX, e.clientY, [
    {
      label: "Rename page",
      run: async () => {
        const name = await renameDialog("Rename page", doc.pages[i].name);
        if (name) {
          doc.pages[i].name = name;
          await saveDoc(doc);
          render();
        }
      }
    },
    "-",
    {
      label: "Delete page",
      danger: true,
      run: async () => {
        if (doc.pages.length === 1) return toast("This is the only page.");
        const list = itemsOfPage(doc.pages[i].id);
        if (
          list.length &&
          !(await confirmDialog(
            "Delete page",
            `This page holds ${list.length} shortcuts. They will be deleted too.`,
            { danger: true }
          ))
        ) {
          return;
        }
        const id = doc.pages[i].id;
        doc.items = doc.items.filter((it) => it.page !== id);
        doc.pages.splice(i, 1);
        if (pageIndex >= doc.pages.length) pageIndex = doc.pages.length - 1;
        await commit();
        await gcBlobs(doc);
      }
    }
  ]);
}

/* ---------------------------------------------------------------- folders */

function openFolder(id) {
  const found = findItem(id);
  if (!found) return;

  const grid = el("div", { class: "items-card", style: "grid-template-rows:repeat(3,1fr)" });
  const panel = el(
    "div",
    {
      class: "dialog wide",
      style: "padding:22px;gap:12px",
      onmousedown: (e) => e.stopPropagation()
    },
    el(
      "header",
      { style: "padding:0 0 10px" },
      el("span", { text: found.item.name }),
      el("button", { class: "close", onclick: () => overlay.remove() }, "×")
    ),
    grid
  );

  const overlay = el(
    "div",
    {
      class: "backdrop folder-overlay",
      onmousedown: (e) => {
        if (e.target === overlay) overlay.remove();
      }
    },
    panel
  );

  const kids = found.item.children || [];
  for (let i = 0; i < Math.max(kids.length + 1, 12); i++) {
    const kid = kids[i];
    if (!kid) {
      grid.appendChild(el("div", { class: "icon empty" }, el("div", { class: "icon-content" })));
      continue;
    }
    const cell = el("a", { class: "icon", href: kid.url, draggable: "true", title: kid.url });
    const content = el("div", { class: "icon-content" });
    cell.append(content, el("div", { class: "icon-name", text: kid.name }));
    paintIcon(content, kid);
    cell.addEventListener("click", (ev) => {
      ev.preventDefault();
      openLink(kid.url, ev);
    });
    cell.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      itemMenu(ev, kid, { inFolder: found.item });
    });
    wireDragSource(cell, kid);
    grid.appendChild(cell);
  }

  document.body.appendChild(overlay);
}

/* -------------------------------------------------------------- item menu */

function itemMenu(e, item, { inFolder } = {}) {
  const entries = [];

  if (item.type === "link") {
    entries.push(
      { label: "Open in new tab", run: () => window.open(item.url, "_blank", "noopener") },
      {
        label: "Edit",
        run: async () => {
          const updated = await itemDialog(item);
          if (!updated) return;
          Object.assign(item, updated);
          document.querySelector(".folder-overlay")?.remove();
          await commit();
          await gcBlobs(doc);
          if (inFolder) openFolder(inFolder.id);
        }
      },
      {
        label: "Copy address",
        run: () => {
          navigator.clipboard.writeText(item.url);
          toast("Address copied.");
        }
      }
    );
  } else {
    entries.push({ label: "Open folder", run: () => openFolder(item.id) });
  }

  entries.push({
    label: "Rename",
    run: async () => {
      const name = await renameDialog("Rename", item.name);
      if (name) {
        item.name = name;
        await commit();
        if (inFolder) {
          document.querySelector(".folder-overlay")?.remove();
          openFolder(inFolder.id);
        }
      }
    }
  });

  if (inFolder) {
    entries.push({
      label: "Move out of folder",
      run: async () => {
        document.querySelector(".folder-overlay")?.remove();
        await moveTo(item.id, itemsOfPage(doc.pages[pageIndex].id).length);
      }
    });
  }

  entries.push("-", {
    label: "Delete",
    danger: true,
    run: async () => {
      if (
        settings.behavior.confirmDelete &&
        !(await confirmDialog("Delete", `Delete "${item.name}"?`, { danger: true }))
      ) {
        return;
      }
      const found = findItem(item.id);
      if (!found) return;
      if (found.parent) {
        found.parent.children = found.parent.children.filter((c) => c.id !== item.id);
        if (found.parent.children.length === 0) {
          doc.items = doc.items.filter((i) => i.id !== found.parent.id);
        }
        document.querySelector(".folder-overlay")?.remove();
      } else {
        doc.items = doc.items.filter((i) => i.id !== item.id);
      }
      await commit();
      await gcBlobs(doc);
    }
  });

  contextMenu(e.clientX, e.clientY, entries);
}

/* ---------------------------------------------------------------- actions */

async function addItem(index) {
  const created = await itemDialog(null);
  if (!created) return;
  const pageId = doc.pages[pageIndex].id;
  const list = itemsOfPage(pageId);
  const item = { ...created, id: newId(), page: pageId, pos: Math.min(index, list.length) };
  list.splice(item.pos, 0, item);
  list.forEach((it, i) => (it.pos = i));
  doc.items.push(item);
  await commit();
}

function submitSearch(e) {
  e.preventDefault();
  const q = $("#searchInput").value.trim();
  if (!q) return;

  // looks like an address? go straight there
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(q);
  const engine = SEARCH_ENGINES[settings.search.engine] || SEARCH_ENGINES.google;
  const dest = looksLikeUrl ? normalizeUrl(q) : engine.url.replace("%s", encodeURIComponent(q));

  if (settings.search.openInNewTab) window.open(dest, "_blank", "noopener");
  else window.location.href = dest;
}

function engineMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  contextMenu(
    r.left,
    r.bottom + 6,
    Object.entries(SEARCH_ENGINES).map(([key, v]) => ({
      label: v.name,
      run: async () => {
        settings.search.engine = key;
        await saveSettings(settings);
        renderSearch();
      }
    }))
  );
}

/* ---------------------------------------------------------------- startup */

async function reload() {
  settings = await loadSettings();
  doc = await loadDoc();
  normalize();
  render();
  await loadWallpaperImage();
  firstPaint = false;
}

async function boot() {
  settings = await loadSettings();

  if (await hasStoredDoc()) {
    doc = await loadDoc();
  } else {
    // new machine: see whether sync has anything before starting fresh
    const pulled = await pullSync({ force: true });
    doc = pulled.ok ? pulled.doc : seedDoc();
    await saveDoc(doc);
    settings = await loadSettings();
  }

  normalize();
  render();
  await loadWallpaperImage();
  firstPaint = false;

  $("#searchForm").addEventListener("submit", submitSearch);
  $("#engineBtn").addEventListener("click", engineMenu);
  $("#addBtn").addEventListener("click", () => addItem(itemsOfPage(doc.pages[pageIndex].id).length));
  $("#settingsBtn").addEventListener("click", () =>
    settingsDialog(settings, { onChange: () => render(), onReload: reload })
  );

  $("#pagePrev").addEventListener("click", () => {
    pageIndex = Math.max(0, pageIndex - 1);
    render();
  });
  $("#pageNext").addEventListener("click", () => {
    pageIndex = Math.min(doc.pages.length - 1, pageIndex + 1);
    render();
  });

  window.addEventListener("resize", () => applyLayout(settings, window));

  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".icon") || e.target.closest(".dot") || e.target.closest(".dialog")) return;
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, [
      { label: "Add a shortcut", run: () => addItem(itemsOfPage(doc.pages[pageIndex].id).length) },
      "-",
      {
        label: "Settings",
        run: () => settingsDialog(settings, { onChange: () => render(), onReload: reload })
      }
    ]);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowLeft" && pageIndex > 0) {
      pageIndex--;
      render();
    } else if (e.key === "ArrowRight" && pageIndex < doc.pages.length - 1) {
      pageIndex++;
      render();
    } else if (e.key === "/" || (e.key === "f" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      $("#searchInput").focus();
    }
  });

  onRemoteChange(async () => {
    const r = await pullSync();
    if (r.ok) {
      await reload();
      toast("Updated from another device.");
    }
  });

  $("#searchInput").focus();
}

boot().catch((e) => {
  console.error("[IzzI]", e);
  toast("Something went wrong on startup: " + e.message);
});
