// Image work: crop, resize, re-encode, hash.
// All of it happens on a canvas in the page. No image leaves the machine.

export const FULL_SIZE = 256; // what we keep locally, so big screens stay sharp

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the image"));
    img.src = src;
  });
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Could not read the file"));
    fr.readAsDataURL(file);
  });
}

/**
 * Cuts a rectangle out of the image and writes it square, `size` px a side.
 * crop = {sx, sy, sw, sh} in source pixels. Leave it out for the largest
 * centred square.
 */
export function cropToDataURL(img, size, crop, mime = "image/webp", quality = 0.9) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let { sx, sy, sw, sh } = crop || {};
  if (sw == null || sh == null) {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    sx = (img.naturalWidth - side) / 2;
    sy = (img.naturalHeight - side) / 2;
    sw = sh = side;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return c.toDataURL(mime, quality);
}

/** Re-encodes an existing dataURL at another size. Used by sync. */
export async function encodeAt(dataURL, size, quality = 0.85) {
  const img = await loadImage(dataURL);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, size, size);
  return c.toDataURL("image/webp", quality);
}

/** How many bytes the string costs in sync (JSON.stringify wraps it in quotes). */
export function utf8Bytes(str) {
  return new TextEncoder().encode(str).length;
}

export async function sha256hex(str, len = 16) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, len);
}

/** Dominant colour of an image, used as the plate behind the icon. */
export async function dominantColor(dataURL) {
  const img = await loadImage(dataURL);
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 16, 16);
  const { data } = ctx.getImageData(0, 0, 16, 16);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent pixels
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (!n) return "#ffffff";
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** First meaningful letter of a name or hostname. */
export function initialFor(text) {
  const m = String(text || "").trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : "?";
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Turns what someone typed into an address worth saving, or "" if it is not.
 *
 * Only http and https get through. Any scheme was accepted before, which meant
 * a `javascript:` address could be saved by hand or arrive inside an imported
 * backup and then be navigated to from a page that holds chrome.* access. The
 * page CSP refuses to run it, but a link that exists only to be blocked has no
 * business being stored in the first place.
 */
export function normalizeUrl(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    return /^https?:\/\//i.test(s) ? s : "";
  }
  return "https://" + s;
}

/** True for the data: URLs an icon or a wallpaper is allowed to be. */
export function isImageDataUrl(v) {
  return typeof v === "string" && /^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(v);
}
