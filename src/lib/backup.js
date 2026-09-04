// A full backup in a .json file, and restoring from one.
//
// Unlike sync, everything fits here: icons at full resolution and the wallpaper.
// This is the safety net for when the 100 KB of sync are not enough.

import { SCHEMA_VERSION } from "./defaults.js";
import {
  loadDoc,
  loadSettings,
  saveDoc,
  saveSettings,
  getBlob,
  putBlob,
  getWallpaper,
  setWallpaper,
  walkItems,
  gcBlobs,
  pushSync
} from "./store.js";

// The name changed after the first release; old exports still restore.
const MAGIC = "izzi-speed-dial";
const LEGACY_MAGIC = "izzi-start-page";

export async function buildBackup({ includeWallpaper = true } = {}) {
  const doc = await loadDoc();
  const settings = await loadSettings();

  const hashes = new Set();
  walkItems(doc, (it) => {
    if (it.icon && it.icon.kind === "image" && it.icon.hash) hashes.add(it.icon.hash);
  });

  const blobs = {};
  for (const h of hashes) {
    const d = await getBlob(h);
    if (d) blobs[h] = d;
  }

  return {
    app: MAGIC,
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    doc,
    blobs,
    wallpaper: includeWallpaper ? await getWallpaper() : null
  };
}

export async function downloadBackup(opts) {
  const data = await buildBackup(opts);
  const json = JSON.stringify(data, null, 0);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  const a = document.createElement("a");
  a.href = url;
  a.download = `izzi-speed-dial-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  return { bytes: json.length, icons: Object.keys(data.blobs).length };
}

/**
 * @param {object} data       the parsed file contents
 * @param {"replace"|"merge"} mode
 */
export async function restoreBackup(data, mode = "replace") {
  if (!data || (data.app !== MAGIC && data.app !== LEGACY_MAGIC)) {
    throw new Error("This does not look like an IzzI Speed Dial backup.");
  }
  if (!data.doc || !Array.isArray(data.doc.items)) {
    throw new Error("The backup holds no valid document.");
  }

  // icons first, so no item is ever left pointing at a missing hash
  const remap = {};
  for (const [hash, dataURL] of Object.entries(data.blobs || {})) {
    remap[hash] = await putBlob(dataURL);
  }
  const fix = (doc) =>
    walkItems(doc, (it) => {
      if (it.icon && it.icon.kind === "image" && remap[it.icon.hash]) {
        it.icon.hash = remap[it.icon.hash];
      }
    });
  fix(data.doc);

  let doc;
  if (mode === "merge") {
    doc = await loadDoc();
    const known = new Set();
    walkItems(doc, (it) => known.add(it.id));

    const pageIds = new Set(doc.pages.map((p) => p.id));
    for (const p of data.doc.pages || []) {
      if (!pageIds.has(p.id)) doc.pages.push(p);
    }
    let pos = doc.items.length;
    for (const it of data.doc.items) {
      if (known.has(it.id)) continue;
      doc.items.push({ ...it, pos: pos++ });
    }
  } else {
    doc = data.doc;
  }

  if (data.settings) await saveSettings(data.settings);
  if (data.wallpaper) await setWallpaper(data.wallpaper);
  await saveDoc(doc);
  await gcBlobs(doc);
  await pushSync();

  let count = 0;
  walkItems(doc, () => count++);
  return { items: count, icons: Object.keys(remap).length, mode };
}

export function pickBackupFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return reject(new Error("No file chosen."));
      const fr = new FileReader();
      fr.onload = () => {
        try {
          resolve(JSON.parse(fr.result));
        } catch {
          reject(new Error("That file is not valid JSON."));
        }
      };
      fr.onerror = () => reject(new Error("Could not read the file."));
      fr.readAsText(file);
    };
    input.click();
  });
}
