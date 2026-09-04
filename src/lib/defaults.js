// Defaults. The row/col/rowGap/colGap values and the geometry constants are the
// ones Infinity New Tab ships, so the layout lands identically.

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  themeId: "classic",
  layout: {
    row: 3,
    col: 6,
    rowGap: 0.4,
    colGap: 0.3
  },
  icon: {
    scale: 0.5,        // 0.2 .. 1    how much of its cell the icon fills
    radius: 0.25,      // 0 .. 0.5    fraction of the icon width
    opacity: 1,        // 0 .. 1
    shadow: false,
    hideName: false,
    fontSize: 15,
    fontColor: "#ffffff",
    fontShadow: true,
    startAnimation: true
  },
  search: {
    show: true,
    engine: "google",
    scale: 0.82,       // 0.4 .. 1.2
    radius: 0.5,       // 0 .. 0.5   fraction of the bar height
    opacity: 1,
    shadow: true,
    btnColor: "#3b82f6",
    openInNewTab: false
  },
  wallpaper: {
    kind: "color",     // "color" | "image"
    color: "#1f2430",
    gradient: null,    // optional CSS background-image, used with kind "color"
    blur: 0,           // px
    mask: 0.15         // 0 .. 0.8   how dark the layer over the image is
  },
  behavior: {
    openInNewTab: false,
    mainRatio: 1,      // overall scale of the centre block
    showPageDots: true,
    confirmDelete: true
  },
  sync: {
    enabled: true,
    iconSize: 96,      // px, the cap; quality drops automatically if it will not fit
    lastPush: 0
  }
};

// Search engines. No live suggestions, so nothing is requested from anyone
// while you type. Navigation happens only when you press Enter.
export const SEARCH_ENGINES = {
  google:     { name: "Google",     url: "https://www.google.com/search?q=%s",       color: "#4285f4", letter: "G" },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s",             color: "#de5833", letter: "D" },
  bing:       { name: "Bing",       url: "https://www.bing.com/search?q=%s",         color: "#008373", letter: "B" },
  brave:      { name: "Brave",      url: "https://search.brave.com/search?q=%s",     color: "#fb542b", letter: "B" },
  startpage:  { name: "Startpage",  url: "https://www.startpage.com/sp/search?q=%s", color: "#6577f0", letter: "S" },
  ecosia:     { name: "Ecosia",     url: "https://www.ecosia.org/search?q=%s",       color: "#33a161", letter: "E" },
  youtube:    { name: "YouTube",    url: "https://www.youtube.com/results?search_query=%s", color: "#ff0000", letter: "Y" },
  wikipedia:  { name: "Wikipedia",  url: "https://en.wikipedia.org/w/index.php?search=%s",  color: "#636466", letter: "W" }
};

// Palette for letter tiles. They cost ~40 bytes in sync, against 1-5 KB
// for an image.
export const TILE_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b"
];

export function emptyDoc() {
  return {
    schema: SCHEMA_VERSION,
    pages: [{ id: "p1", name: "Home" }],
    items: [],
    // Zero, not Date.now(): a document that was never saved has no business
    // looking newer than what is in sync, otherwise a fresh machine refuses to
    // pull and sits there empty.
    updatedAt: 0
  };
}

// What ships in the box, so the page is not blank on first open.
// Plain, direct addresses. No redirector, no affiliate link, nobody pays us for
// them. Delete them freely; they are only a starting point.
const SEED = [
  ["Google", "https://www.google.com", "#4285f4"],
  ["YouTube", "https://www.youtube.com", "#ff0000"],
  ["Gmail", "https://mail.google.com", "#ea4335"],
  ["GitHub", "https://github.com", "#24292f"],
  ["Wikipedia", "https://en.wikipedia.org", "#636466"],
  ["Reddit", "https://www.reddit.com", "#ff4500"]
];

export function seedDoc() {
  const doc = emptyDoc();
  doc.items = SEED.map(([name, url, bg], i) => ({
    id: "seed" + i,
    type: "link",
    name,
    url,
    icon: { kind: "tile", text: name[0].toUpperCase(), bg },
    page: "p1",
    pos: i
  }));
  return doc;
}

// Shape of an item:
// {
//   id:      "a1b2c3d4",
//   type:    "link" | "folder",
//   name:    "GitHub",
//   url:     "https://github.com"        (links only)
//   children: [ {..item..}, ... ]        (folders only)
//   page:    "p1",
//   pos:     0,                          index within the page grid
//   icon: {
//     kind: "tile",    text: "G", bg: "#3b82f6"          -> cheap
//     kind: "favicon"                                    -> free, from Chrome's cache
//     kind: "image",   hash: "9f2a1c...", bg: "#ffffff"  -> bitmap, costs bytes
//   }
// }
