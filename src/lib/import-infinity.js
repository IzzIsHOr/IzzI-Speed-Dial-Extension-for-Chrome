// Import from an Infinity New Tab backup (.infinity file, schema v2 / ext 11.x).
//
// Their format, as found in a real export:
//
//   data.site.sites      array of pages, each an array of items
//   data.setting.setting layout / icon / search / font settings
//   data.wallpaper       {url, opacity, blur, ...}; url is often a data: URL
//   data.searcher        selected search engine
//
// An item looks like:
//   {name, id, uuid, updatetime, target, type:"web", bgType, bgImage, bgText, bgFont, bgColor}
// Folders carry no `type` at all - they are the ones with a `children` array.
//
// The one catch: `bgImage` points at Infinity's CDN
// (infinitypro-img.infinitynewtab.com), so the artwork is not in the file. Icons
// can only be recovered by downloading them once. That is opt-in, asks for
// permission on exactly those hosts, and is the single time this extension ever
// talks to Infinity. Decline it and every shortcut still imports, falling back
// to the browser favicon.

import { SCHEMA_VERSION } from "./defaults.js";
import { putBlob, newId, saveDoc, saveSettings, loadSettings, setWallpaper } from "./store.js";
import { loadImage, cropToDataURL, readFileAsDataURL, FULL_SIZE, hostOf } from "./imgutil.js";

const ENGINE_BY_NAME = {
  google: "google",
  duckduckgo: "duckduckgo",
  bing: "bing",
  brave: "brave",
  startpage: "startpage",
  ecosia: "ecosia",
  youtube: "youtube",
  wikipedia: "wikipedia"
};

export function looksLikeInfinityBackup(data) {
  return Boolean(data && data.data && data.data.site && Array.isArray(data.data.site.sites));
}

/** `rgba(255,255,255,0.8)` or `#fff` -> `#rrggbb`, since <input type=color> needs hex. */
function toHex(color, fallback = "#ffffff") {
  if (!color) return fallback;
  const s = String(color).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return "#" + s.slice(1).split("").map((c) => c + c).join("").toLowerCase();
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return fallback;
  return "#" + m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The plate painted behind an icon image.
 *
 * Infinity's icons are PNGs that are mostly transparent (measured: 63-84% fully
 * clear pixels), so anything opaque here shows up as a solid square around the
 * logo. Default to no plate and only use one when their own `bgColor` asks for
 * it. Never hardcode white.
 */
function plateFor(raw) {
  const c = (raw.bgColor || "").trim();
  if (!c || c === "transparent" || c === "none") return "transparent";
  return toHex(c, "transparent");
}

/**
 * Reads the backup without writing anything. Use it to show the user what is
 * about to happen before they commit.
 */
export function inspectInfinityBackup(data) {
  if (!looksLikeInfinityBackup(data)) {
    throw new Error("This does not look like an Infinity New Tab backup.");
  }

  const pages = data.data.site.sites;
  let links = 0;
  let folders = 0;
  const iconOrigins = new Set();
  let remoteIcons = 0;

  const scan = (list) => {
    for (const raw of list || []) {
      if (Array.isArray(raw.children)) {
        folders++;
        scan(raw.children);
        continue;
      }
      links++;
      if (raw.bgType === "image" && /^https?:/i.test(raw.bgImage || "")) {
        remoteIcons++;
        try {
          iconOrigins.add(new URL(raw.bgImage).origin);
        } catch {
          /* malformed URL, it just will not be downloaded */
        }
      }
    }
  };
  pages.forEach(scan);

  const wp = data.data.wallpaper || {};
  return {
    version: data.extVersion || data.version || "unknown",
    exportedAt: data.time ? new Date(data.time) : null,
    pages: pages.length,
    links,
    folders,
    remoteIcons,
    iconOrigins: [...iconOrigins],
    hasWallpaper: typeof wp.url === "string" && wp.url.startsWith("data:"),
    wallpaperBytes: typeof wp.url === "string" ? wp.url.length : 0,
    notes: (data.data.note && data.data.note.list && data.data.note.list.length) || 0,
    todos: (data.data.todo && data.data.todo.todoList && data.data.todo.todoList.length) || 0
  };
}

/**
 * True only when this really is the installed extension.
 *
 * Opened as a plain page (the dev harness, or dev-preview.html), there is no
 * chrome.permissions to ask with and no host permissions to lift CORS, so an
 * icon download can never succeed. Worth saying out loud rather than failing
 * quietly and looking like a bug in the import.
 */
export function isExtensionContext() {
  return (
    location.protocol === "chrome-extension:" &&
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime && chrome.runtime.id) &&
    Boolean(chrome.permissions && chrome.permissions.request)
  );
}

/**
 * Asks for permission on exactly the CDN hosts this backup references.
 *
 * Chrome only allows permissions.request() while a user gesture is live, and a
 * gesture does not survive an await on a dialog. Call this from inside the
 * click handler itself, before anything else in it.
 */
export async function requestIconPermission(origins) {
  if (!origins.length) return { granted: true };
  if (!isExtensionContext()) {
    return {
      granted: false,
      error:
        "this page is not running as the installed extension, so it cannot ask for host access"
    };
  }
  try {
    const granted = await chrome.permissions.request({
      origins: origins.map((o) => o + "/*")
    });
    return { granted };
  } catch (e) {
    return { granted: false, error: (e && e.message) || String(e) };
  }
}

/** Whether those hosts are already allowed, so we can skip asking again. */
export async function hasIconPermission(origins) {
  if (!origins.length) return true;
  if (!isExtensionContext()) return false;
  try {
    return await chrome.permissions.contains({ origins: origins.map((o) => o + "/*") });
  } catch {
    return false;
  }
}

async function downloadIcon(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const blob = await res.blob();
  if (!/^image\//.test(blob.type)) throw new Error("not an image");
  const img = await loadImage(await readFileAsDataURL(blob));
  return cropToDataURL(img, FULL_SIZE, null, "image/webp", 0.92);
}

function mapSettings(current, raw) {
  const s = JSON.parse(JSON.stringify(current));
  const set = (raw && raw.setting && raw.setting.setting) || {};

  if (set.layout) {
    s.layout.row = clamp(set.layout.row || s.layout.row, 1, 8);
    s.layout.col = clamp(set.layout.col || s.layout.col, 3, 12);
    if (typeof set.layout.rowGap === "number") s.layout.rowGap = clamp(set.layout.rowGap, 0, 1);
    if (typeof set.layout.colGap === "number") s.layout.colGap = clamp(set.layout.colGap, 0, 1);
  }
  if (set.icon) {
    if (typeof set.icon.scale === "number") s.icon.scale = clamp(set.icon.scale, 0.2, 1);
    if (typeof set.icon.radius === "number") s.icon.radius = clamp(set.icon.radius, 0, 0.5);
    if (typeof set.icon.opacity === "number") s.icon.opacity = clamp(set.icon.opacity, 0.2, 1);
    s.icon.shadow = Boolean(set.icon.shadow);
    s.icon.startAnimation = Boolean(set.icon.startAnimation);
    s.icon.hideName = Boolean(set.icon.isHideIconName);
  }
  if (set.font) {
    if (typeof set.font.size === "number") s.icon.fontSize = clamp(set.font.size, 9, 24);
    s.icon.fontColor = toHex(set.font.color, s.icon.fontColor);
    s.icon.fontShadow = Boolean(set.font.shadow);
  }
  if (set.search) {
    s.search.show = !set.search.hide;
    if (typeof set.search.scale === "number") s.search.scale = clamp(set.search.scale, 0.4, 1.2);
    if (typeof set.search.radius === "number") s.search.radius = clamp(set.search.radius, 0, 0.5);
    if (typeof set.search.opacity === "number") s.search.opacity = clamp(set.search.opacity, 0.3, 1);
    s.search.shadow = Boolean(set.search.shadow);
  }
  if (set.view && typeof set.view.scaleMain === "number") {
    s.behavior.mainRatio = clamp(set.view.scaleMain, 0.6, 1.6);
  }

  // wallpaper: they store --wallpaper-alpha as opacity/100 and blur as blur/5 px
  const wp = (raw && raw.wallpaper) || {};
  if (typeof wp.opacity === "number") s.wallpaper.mask = clamp(wp.opacity / 100, 0, 0.8);
  if (typeof wp.blur === "number") s.wallpaper.blur = clamp(Math.round(wp.blur / 5), 0, 40);
  if (typeof wp.url === "string" && wp.url.startsWith("data:")) s.wallpaper.kind = "image";

  const engine =
    raw && raw.searcher && raw.searcher.searchEngine && raw.searcher.searchEngine.current;
  if (engine && engine.name) {
    const key = ENGINE_BY_NAME[String(engine.name).toLowerCase().replace(/\s+/g, "")];
    if (key) s.search.engine = key;
  }

  return s;
}

/**
 * @param {object}   data          parsed .infinity file
 * @param {object}   opts
 * @param {boolean}  opts.downloadIcons  fetch artwork from Infinity's CDN
 * @param {boolean}  opts.importSettings apply their layout and appearance
 * @param {boolean}  opts.importWallpaper
 * @param {function} opts.onProgress     (done, total, label)
 */
export async function importInfinity(data, opts = {}) {
  const {
    downloadIcons = false,
    importSettings = true,
    importWallpaper = true,
    onProgress = () => {}
  } = opts;

  if (!looksLikeInfinityBackup(data)) {
    throw new Error("This does not look like an Infinity New Tab backup.");
  }

  const rawPages = data.data.site.sites;
  const pages = [];
  const items = [];
  const stats = { links: 0, folders: 0, iconsDownloaded: 0, iconsFailed: 0, skipped: 0, errors: [] };

  // one pass to count downloads, so progress means something
  let toDownload = 0;
  if (downloadIcons) {
    const count = (list) => {
      for (const raw of list || []) {
        if (Array.isArray(raw.children)) count(raw.children);
        else if (raw.bgType === "image" && /^https?:/i.test(raw.bgImage || "")) toDownload++;
      }
    };
    rawPages.forEach(count);
  }
  let done = 0;

  async function convert(raw) {
    if (Array.isArray(raw.children)) {
      const kids = [];
      for (const kid of raw.children) {
        const c = await convert(kid);
        if (c) kids.push(c);
      }
      stats.folders++;
      return {
        id: newId(),
        type: "folder",
        name: raw.name || "Folder",
        children: kids
      };
    }

    const url = raw.target || raw.url || "";
    // infinity://notes and friends are their own internal pages; nothing to point at
    if (!/^https?:/i.test(url)) {
      stats.skipped++;
      return null;
    }

    let icon = { kind: "favicon", bg: "#ffffff" };

    if (raw.bgType === "text" || (!raw.bgImage && raw.bgColor)) {
      icon = {
        kind: "tile",
        text: (raw.bgText || raw.name || hostOf(url) || "?").trim().slice(0, 2).toUpperCase(),
        bg: toHex(raw.bgColor, "#3b82f6")
      };
    } else if (downloadIcons && raw.bgType === "image" && /^https?:/i.test(raw.bgImage || "")) {
      onProgress(done, toDownload, raw.name || hostOf(url));
      try {
        const hash = await putBlob(await downloadIcon(raw.bgImage));
        icon = { kind: "image", hash, bg: plateFor(raw) };
        stats.iconsDownloaded++;
      } catch (e) {
        // the favicon fallback covers the icon, but say why it happened
        stats.iconsFailed++;
        if (stats.errors.length < 4) {
          stats.errors.push((raw.name || hostOf(url)) + ": " + ((e && e.message) || e));
        }
      }
      done++;
    } else if (raw.bgType === "image" && (raw.bgImage || "").startsWith("data:")) {
      // some older exports embed the artwork; take it, no network needed
      try {
        const img = await loadImage(raw.bgImage);
        const hash = await putBlob(cropToDataURL(img, FULL_SIZE, null, "image/webp", 0.92));
        icon = { kind: "image", hash, bg: plateFor(raw) };
        stats.iconsDownloaded++;
      } catch (e) {
        stats.iconsFailed++;
        if (stats.errors.length < 4) {
          stats.errors.push((raw.name || hostOf(url)) + ": " + ((e && e.message) || e));
        }
      }
    }

    stats.links++;
    return {
      id: newId(),
      type: "link",
      name: (raw.name || "").trim() || hostOf(url),
      url,
      icon
    };
  }

  for (let p = 0; p < rawPages.length; p++) {
    const pageId = "p" + newId();
    pages.push({ id: pageId, name: p === 0 ? "Home" : "Page " + (p + 1) });
    let pos = 0;
    for (const raw of rawPages[p]) {
      const item = await convert(raw);
      if (!item) continue;
      item.page = pageId;
      item.pos = pos++;
      items.push(item);
    }
  }

  if (!pages.length) pages.push({ id: "p" + newId(), name: "Home" });

  const doc = { schema: SCHEMA_VERSION, pages, items, updatedAt: Date.now() };

  if (importSettings) {
    await saveSettings(mapSettings(await loadSettings(), data.data));
  }
  const wpUrl = data.data.wallpaper && data.data.wallpaper.url;
  if (importWallpaper && typeof wpUrl === "string" && wpUrl.startsWith("data:")) {
    await setWallpaper(wpUrl);
  }
  await saveDoc(doc);

  return stats;
}
