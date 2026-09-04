// Drawing an icon. Three kinds, cheapest first in terms of sync bytes:
//
//   tile     letter + colour            ~40 bytes
//   favicon  from Chrome's own cache    ~20 bytes, no network at all
//   image    bitmap stored locally      1-5 KB
//
// None of them fetches anything from the internet at draw time.

import { getBlob } from "./store.js";
import { initialFor, hostOf } from "./imgutil.js";

/** URL of the favicon in the browser's cache. Local, no network request. */
export function faviconUrl(pageUrl, size = 64) {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", pageUrl);
  u.searchParams.set("size", String(size));
  return u.toString();
}

/**
 * A stable colour derived from a string, so a site always gets the same plate.
 * The fallback tile must never reuse the icon's own `bg`: for a favicon icon
 * that is white, and the letter is white too, which draws nothing at all.
 */
export function colorFor(text) {
  let h = 0;
  const s = String(text) || "?";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 52% 44%)`;
}

function letterTile(el, item, bg) {
  el.style.backgroundColor = bg;
  const span = document.createElement("span");
  span.className = "icon-content-text";
  span.textContent = initialFor(item.name || hostOf(item.url));
  el.appendChild(span);
}

/**
 * Fills an .icon-content element. Sizing comes from CSS (--icon-width);
 * this only paints.
 */
export async function paintIcon(el, item) {
  const icon = item.icon || { kind: "favicon" };
  el.textContent = "";
  el.style.backgroundImage = "";
  el.style.backgroundColor = "";

  if (icon.kind === "tile") {
    letterTile(el, item, icon.bg || colorFor(item.name || item.url));
    return;
  }

  if (icon.kind === "image" && icon.hash) {
    const data = await getBlob(icon.hash);
    if (data) {
      el.style.backgroundColor = icon.bg || "transparent";
      el.style.backgroundImage = `url("${data}")`;
      return;
    }
    // the hash is known but the bitmap has not reached this machine yet
  }

  if (!item.url) {
    letterTile(el, item, colorFor(item.name || "?"));
    return;
  }

  const img = document.createElement("img");
  img.className = "icon-favicon";
  img.alt = "";
  img.draggable = false;
  img.src = faviconUrl(item.url, 64);
  img.onerror = () => {
    img.remove();
    letterTile(el, item, colorFor(hostOf(item.url) || item.name));
  };
  el.style.backgroundColor = icon.bg || "#ffffff";
  el.appendChild(img);
}

/** Folder preview: up to 9 mini icons in a 3x3 grid. */
export async function paintFolder(el, item) {
  el.textContent = "";
  el.classList.add("folder");
  const wrap = document.createElement("div");
  wrap.className = "mini-icon-box-pre";
  for (const kid of (item.children || []).slice(0, 9)) {
    const pad = document.createElement("div");
    pad.className = "mini-icon-padding";
    const mini = document.createElement("div");
    mini.className = "mini-icon";
    pad.appendChild(mini);
    wrap.appendChild(pad);
    paintIcon(mini, kid);
  }
  el.appendChild(wrap);
}
