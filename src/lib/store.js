// Storage on two levels.
//
//   chrome.storage.local  (unlimitedStorage)  = the source of truth
//        doc, settings, blob_<hash> (256px icons), wallpaperData
//
//   chrome.storage.sync   (100 KB TOTAL, 8 KB/item, 512 items)  = the mirror
//        m            meta
//        s            settings
//        d0..dN       the document, cut into pieces
//        b<hash>_0..N icons, re-encoded small and deduplicated by hash
//
// The 100 KB ceiling is Chrome's own and cannot be worked around. When the
// payload does not fit, icons are re-encoded at lower quality (see LADDER);
// whatever is still left over is reported by name.

import { DEFAULT_SETTINGS, SCHEMA_VERSION, emptyDoc } from "./defaults.js";
import { encodeAt, utf8Bytes, sha256hex } from "./imgutil.js";

const QUOTA = 102400; // chrome.storage.sync.QUOTA_BYTES
const SAFETY = 0.95; // leave a little headroom
const CHUNK = 7000; // under QUOTA_BYTES_PER_ITEM (8192), key included

// Compression rungs, best-looking first.
//
// Measured on real icons: lossy WebP has a floor around 1000 bytes it will not
// go below however small the image is. Shrinking barely helps (96px -> 48px
// saves only ~20%); quality does. So hold 96px as long as possible and walk the
// quality down, shrinking only at the very end.
const LADDER = [
  [96, 0.85],
  [96, 0.7],
  [96, 0.55],
  [96, 0.4],
  [80, 0.35],
  [64, 0.3]
];

const L = {
  DOC: "doc",
  SETTINGS: "settings",
  WALLPAPER: "wallpaperData",
  DEVICE: "deviceId",
  APPLIED: "syncAppliedAt",
  blob: (h) => "blob_" + h
};

const S = {
  META: "m",
  SETTINGS: "s",
  doc: (i) => "d" + i,
  blob: (h, i) => "b" + h + "_" + i
};

const local = chrome.storage.local;
const sync = chrome.storage.sync;

const blobCache = new Map();
let deviceId = null;
let pushing = false;

/* ----------------------------------------------------------------- helpers */

function chunk(str) {
  const out = [];
  for (let i = 0; i < str.length; i += CHUNK) out.push(str.slice(i, i + CHUNK));
  return out;
}

function deepMerge(base, patch) {
  if (patch == null || typeof patch !== "object" || Array.isArray(patch)) {
    return patch === undefined ? base : patch;
  }
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch)) {
    out[k] =
      k in out && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])
        ? deepMerge(out[k], patch[k])
        : patch[k];
  }
  return out;
}

export function walkItems(doc, fn) {
  const visit = (list, parent) => {
    for (const it of list) {
      fn(it, parent);
      if (it.type === "folder" && Array.isArray(it.children)) visit(it.children, it);
    }
  };
  visit(doc.items || [], null);
}

function referencedHashes(doc) {
  const seen = [];
  walkItems(doc, (it) => {
    const h = it.icon && it.icon.kind === "image" && it.icon.hash;
    if (h && !seen.includes(h)) seen.push(h);
  });
  return seen;
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

async function getDeviceId() {
  if (deviceId) return deviceId;
  const got = await local.get(L.DEVICE);
  deviceId = got[L.DEVICE];
  if (!deviceId) {
    deviceId = newId() + newId();
    await local.set({ [L.DEVICE]: deviceId });
  }
  return deviceId;
}

/* -------------------------------------------------------------------- local */

export async function loadSettings() {
  const got = await local.get(L.SETTINGS);
  return deepMerge(DEFAULT_SETTINGS, got[L.SETTINGS] || {});
}

export async function saveSettings(settings) {
  await local.set({ [L.SETTINGS]: settings });
  schedulePush();
  return settings;
}

export async function loadDoc() {
  const got = await local.get(L.DOC);
  const doc = got[L.DOC];
  if (!doc || !Array.isArray(doc.items)) return emptyDoc();
  return doc;
}

/** Tells "never saved" apart from "saved, but empty". */
export async function hasStoredDoc() {
  const got = await local.get(L.DOC);
  return Boolean(got[L.DOC]);
}

export async function saveDoc(doc) {
  doc.updatedAt = Date.now();
  doc.schema = SCHEMA_VERSION;
  await local.set({ [L.DOC]: doc });
  schedulePush();
  return doc;
}

export async function getBlob(hash) {
  if (!hash) return null;
  if (blobCache.has(hash)) return blobCache.get(hash);
  const got = await local.get(L.blob(hash));
  const v = got[L.blob(hash)] || null;
  if (v) blobCache.set(hash, v);
  return v;
}

/**
 * Stores a dataURL and returns its hash. Identical bytes, identical hash.
 *
 * The write always happens. blobCache records what has been read this session,
 * not what storage actually holds, and skipping the write when the hash is
 * merely cached loses the blob whenever the two have drifted apart. Writing the
 * same bytes again is idempotent and costs nothing worth saving.
 */
export async function putBlob(dataURL) {
  const hash = await sha256hex(dataURL);
  await local.set({ [L.blob(hash)]: dataURL });
  blobCache.set(hash, dataURL);
  return hash;
}

/** Drops icons no item points at any more. */
export async function gcBlobs(doc) {
  const keep = new Set(referencedHashes(doc));
  const all = await local.get(null);
  const dead = Object.keys(all).filter(
    (k) => k.startsWith("blob_") && !keep.has(k.slice(5))
  );
  if (dead.length) {
    await local.remove(dead);
    for (const k of dead) blobCache.delete(k.slice(5));
  }
  return dead.length;
}

export async function getWallpaper() {
  const got = await local.get(L.WALLPAPER);
  return got[L.WALLPAPER] || null;
}

export async function setWallpaper(dataURL) {
  // the wallpaper stays strictly local: far too big for the 100 KB of sync
  if (dataURL) await local.set({ [L.WALLPAPER]: dataURL });
  else await local.remove(L.WALLPAPER);
}

/* --------------------------------------------------------------------- sync */

/**
 * Builds the sync payload and fits it to the budget.
 * Writes nothing; returns what it would write, plus the report.
 */
export async function buildSyncPayload(doc, settings) {
  const dev = await getDeviceId();
  const payload = {};

  payload[S.SETTINGS] = JSON.stringify(settings);

  const docChunks = chunk(JSON.stringify(doc));
  docChunks.forEach((c, i) => (payload[S.doc(i)] = c));

  let fixed = 0;
  for (const [k, v] of Object.entries(payload)) fixed += utf8Bytes(k) + utf8Bytes(v) + 2;
  fixed += 400; // reserve for meta

  const budget = Math.floor(QUOTA * SAFETY) - fixed;
  const hashes = referencedHashes(doc);

  const maxSize = settings.sync.iconSize || 96;
  const report = {
    iconSize: maxSize,
    iconQuality: LADDER[0][1],
    included: [],
    skipped: [],
    iconBytes: 0,
    fixedBytes: fixed,
    budget
  };

  if (!hashes.length || budget <= 0) {
    return {
      payload,
      meta: metaFor(dev, doc, docChunks.length, {}, maxSize, report.iconQuality),
      report
    };
  }

  // walk down the rungs until every icon fits
  let ladder = LADDER.filter(([s]) => s <= maxSize);
  if (!ladder.length) ladder = [LADDER[LADDER.length - 1]];

  let chosen = null;
  for (const [size, quality] of ladder) {
    const encoded = [];
    let total = 0;
    for (const h of hashes) {
      const full = await getBlob(h);
      if (!full) continue;
      const small = await encodeAt(full, size, quality);
      const parts = Math.ceil(small.length / CHUNK);
      const cost = small.length + parts * (utf8Bytes(S.blob(h, 0)) + 4);
      encoded.push({ hash: h, data: small, cost });
      total += cost;
    }
    chosen = { size, quality, encoded, total };
    if (total <= budget) break;
  }

  // on the last rung some may still not fit: take them in grid order
  const blobsMeta = {};
  let used = 0;
  for (const e of chosen.encoded) {
    if (used + e.cost > budget) {
      report.skipped.push(e.hash);
      continue;
    }
    const parts = chunk(e.data);
    parts.forEach((c, i) => (payload[S.blob(e.hash, i)] = c));
    blobsMeta[e.hash] = parts.length;
    used += e.cost;
    report.included.push(e.hash);
  }

  report.iconSize = chosen.size;
  report.iconQuality = chosen.quality;
  report.iconBytes = used;

  return {
    payload,
    meta: metaFor(dev, doc, docChunks.length, blobsMeta, chosen.size, chosen.quality),
    report
  };
}

function countItems(doc) {
  let n = 0;
  walkItems(doc, () => n++);
  return n;
}

function metaFor(dev, doc, docChunks, blobs, iconSize, iconQuality) {
  return {
    schema: SCHEMA_VERSION,
    updatedAt: doc.updatedAt || Date.now(),
    deviceId: dev,
    docChunks,
    blobs,
    iconSize,
    iconQuality,
    itemCount: countItems(doc)
  };
}

/** Writes only what changed, in a single operation. */
export async function pushSync() {
  const settings = await loadSettings();
  if (!settings.sync.enabled) return { skipped: true, reason: "sync is off" };

  const doc = await loadDoc();
  const { payload, meta, report } = await buildSyncPayload(doc, settings);
  payload[S.META] = meta;

  const current = await sync.get(null);

  // Never wipe sync by accident. If local holds nothing but sync holds
  // shortcuts, this is almost certainly a race (local storage just cleared,
  // extension reinstalled, fresh profile) rather than a deletion anyone asked
  // for. Refuse the write; whoever really means it has the Clear sync button.
  const remote = current[S.META];
  if (meta.itemCount === 0 && remote && remote.itemCount > 0) {
    return {
      skipped: true,
      reason: `local is empty but sync holds ${remote.itemCount} items; refusing to overwrite`,
      report
    };
  }

  const toSet = {};
  for (const [k, v] of Object.entries(payload)) {
    if (JSON.stringify(current[k]) !== JSON.stringify(v)) toSet[k] = v;
  }
  const toRemove = Object.keys(current).filter((k) => !(k in payload));

  pushing = true;
  try {
    if (toRemove.length) await sync.remove(toRemove);
    if (Object.keys(toSet).length) await sync.set(toSet);
    await local.set({ [L.APPLIED]: meta.updatedAt });
  } catch (err) {
    return { error: err && err.message ? err.message : String(err), report };
  } finally {
    setTimeout(() => {
      pushing = false;
    }, 500);
  }

  return { ok: true, report, wrote: Object.keys(toSet).length, removed: toRemove.length };
}

let pushTimer = null;
export function schedulePush(delay = 2500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushSync().catch((e) => console.warn("[IzzI] push esuat:", e));
  }, delay);
}

/**
 * Pulls the document from sync when it is newer than the local one.
 * Icons that arrive never overwrite a full-resolution local copy.
 */
export async function pullSync({ force = false } = {}) {
  const all = await sync.get(null);
  const meta = all[S.META];
  if (!meta || meta.schema !== SCHEMA_VERSION) return { nothing: true };

  const dev = await getDeviceId();
  const localDoc = await loadDoc();
  if (!force) {
    if (meta.deviceId === dev) return { nothing: true, reason: "our own write" };
    if ((meta.updatedAt || 0) <= (localDoc.updatedAt || 0)) {
      return { nothing: true, reason: "local is newer" };
    }
  }

  let docJson = "";
  for (let i = 0; i < meta.docChunks; i++) docJson += all[S.doc(i)] || "";
  let remoteDoc;
  try {
    remoteDoc = JSON.parse(docJson);
  } catch {
    return { error: "the document in sync is incomplete" };
  }

  const writes = {};
  for (const [hash, parts] of Object.entries(meta.blobs || {})) {
    if (await getBlob(hash)) continue; // keep the local original, it is better
    let data = "";
    for (let i = 0; i < parts; i++) data += all[S.blob(hash, i)] || "";
    if (data) {
      writes[L.blob(hash)] = data;
      blobCache.set(hash, data);
    }
  }
  if (all[S.SETTINGS]) {
    try {
      writes[L.SETTINGS] = deepMerge(DEFAULT_SETTINGS, JSON.parse(all[S.SETTINGS]));
    } catch {
      /* corrupt settings: ignore them, the document matters more */
    }
  }
  writes[L.DOC] = remoteDoc;
  writes[L.APPLIED] = meta.updatedAt;

  await local.set(writes);
  return { ok: true, doc: remoteDoc, iconSize: meta.iconSize };
}

export async function syncStatus() {
  const settings = await loadSettings();
  const bytes = await sync.getBytesInUse(null);
  const meta = (await sync.get(S.META))[S.META];
  return {
    enabled: settings.sync.enabled,
    bytesUsed: bytes,
    quota: QUOTA,
    percent: Math.round((bytes / QUOTA) * 100),
    iconSize: meta ? meta.iconSize : null,
    iconCount: meta ? Object.keys(meta.blobs || {}).length : 0,
    lastPush: meta ? meta.updatedAt : 0,
    fromThisDevice: meta ? meta.deviceId === (await getDeviceId()) : false
  };
}

export async function clearSync() {
  pushing = true;
  try {
    await sync.clear();
  } finally {
    setTimeout(() => {
      pushing = false;
    }, 500);
  }
}

/** Tells the page when another device has written to sync. */
export function onRemoteChange(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || pushing) return;
    if (!changes[S.META]) return;
    cb();
  });
}

export const _internals = { QUOTA, CHUNK, LADDER, L, S };
