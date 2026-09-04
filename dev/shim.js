// A stand-in for the chrome.* APIs, so the page can be opened in an ordinary
// browser. Not part of the extension; the build script leaves it out.

(function () {
  const QUOTA = 102400;

  function area(name) {
    const key = "__shim_" + name;
    const read = () => {
      try {
        return JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        return {};
      }
    };
    const write = (o) => localStorage.setItem(key, JSON.stringify(o));

    return {
      QUOTA_BYTES: QUOTA,
      async get(what) {
        const all = read();
        if (what == null) return { ...all };
        if (typeof what === "string") return what in all ? { [what]: all[what] } : {};
        if (Array.isArray(what)) {
          const out = {};
          for (const k of what) if (k in all) out[k] = all[k];
          return out;
        }
        const out = { ...what };
        for (const k of Object.keys(what)) if (k in all) out[k] = all[k];
        return out;
      },
      async set(obj) {
        const all = read();
        Object.assign(all, obj);
        if (name === "sync") {
          let bytes = 0;
          for (const [k, v] of Object.entries(all)) bytes += k.length + JSON.stringify(v).length;
          if (bytes > QUOTA) throw new Error("QUOTA_BYTES quota exceeded");
        }
        write(all);
        fire(name, obj);
      },
      async remove(keys) {
        const all = read();
        for (const k of [].concat(keys)) delete all[k];
        write(all);
      },
      async clear() {
        write({});
      },
      async getBytesInUse() {
        const all = read();
        let bytes = 0;
        for (const [k, v] of Object.entries(all)) bytes += k.length + JSON.stringify(v).length;
        return bytes;
      }
    };
  }

  const listeners = [];
  function fire(areaName, obj) {
    const changes = {};
    for (const k of Object.keys(obj)) changes[k] = { newValue: obj[k] };
    for (const fn of listeners) fn(changes, areaName);
  }

  const SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
        '<rect width="16" height="16" rx="3" fill="#94a3b8"/>' +
        '<circle cx="8" cy="8" r="3.2" fill="#fff"/></svg>'
    );

  window.chrome = {
    storage: {
      local: area("local"),
      sync: area("sync"),
      onChanged: { addListener: (fn) => listeners.push(fn) }
    },
    runtime: {
      getURL: (p) => (p.startsWith("/_favicon") ? SVG : new URL(p, location.origin).href),
      lastError: null
    },
    // A plain page can neither grant host access nor bypass CORS, so anything
    // that needs it must detect this and say so rather than pretend it worked.
    permissions: {
      request: async () => {
        console.warn("[shim] permissions.request needs the installed extension");
        return false;
      },
      contains: async () => false
    },
    tabs: {
      query: async () => [{ url: location.href, title: document.title }],
      create: ({ url }) => window.open(url, "_blank")
    }
  };

  /* ------------------------------------------------------ screenshot scenes */
  //
  // Store screenshots have to show a page that looks used, not the empty seed.
  // This seeds a demo document and can nudge the UI into a given state, so the
  // captures are of the real interface with nothing faked inside the app. It
  // lives here because the shim never ships.

  const params = new URLSearchParams(location.search);

  if (params.get("seed") === "demo") {
    const tile = (name, url, bg) => ({
      id: "d" + name.replace(/\W/g, ""),
      type: "link",
      name,
      url,
      icon: { kind: "tile", text: name[0].toUpperCase(), bg },
      page: "p1"
    });

    const items = [
      tile("GitHub", "https://github.com", "#24292f"),
      tile("YouTube", "https://youtube.com", "#ff0000"),
      tile("Gmail", "https://mail.google.com", "#ea4335"),
      tile("Figma", "https://figma.com", "#a259ff"),
      tile("Notion", "https://notion.so", "#2f3437"),
      tile("Spotify", "https://spotify.com", "#1db954"),
      tile("Reddit", "https://reddit.com", "#ff4500"),
      tile("Hacker News", "https://news.ycombinator.com", "#ff6600"),
      tile("Wikipedia", "https://wikipedia.org", "#636466"),
      tile("Steam", "https://store.steampowered.com", "#1b2838"),
      tile("Drive", "https://drive.google.com", "#1a73e8"),
      {
        id: "dwork",
        type: "folder",
        name: "Work",
        page: "p1",
        children: [
          tile("Jira", "https://jira.com", "#2563eb"),
          tile("Slack", "https://slack.com", "#611f69"),
          tile("Linear", "https://linear.app", "#5e6ad2")
        ]
      }
    ];
    items.forEach((it, i) => (it.pos = i));

    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 800;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 1280, 800);
    g.addColorStop(0, "#1e3a8a");
    g.addColorStop(0.45, "#5b21b6");
    g.addColorStop(1, "#831843");
    x.fillStyle = g;
    x.fillRect(0, 0, 1280, 800);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = "rgba(255,255,255," + (0.02 + Math.random() * 0.05) + ")";
      x.beginPath();
      x.arc(Math.random() * 1280, Math.random() * 800, 40 + Math.random() * 200, 0, 7);
      x.fill();
    }

    localStorage.setItem(
      "__shim_local",
      JSON.stringify({
        doc: { schema: 1, pages: [{ id: "p1", name: "Home" }], items, updatedAt: Date.now() },
        wallpaperData: c.toDataURL("image/jpeg", 0.9),
        settings: {
          themeId: "classic",
          wallpaper: { kind: "image", color: "#1f2430", gradient: null, blur: 0, mask: 0.3 },
          icon: {
            scale: 0.5,
            radius: 0.25,
            opacity: 1,
            shadow: true,
            hideName: false,
            fontSize: 15,
            fontColor: "#ffffff",
            fontShadow: true,
            startAnimation: false
          },
          sync: { enabled: true, iconSize: 96, lastPush: 0 }
        }
      })
    );
  }

  // Headless capture runs on virtual time, which fast-forwards timers but does
  // not let CSS transitions settle, so a screenshot can catch a tab highlight
  // mid-fade and show the wrong one as active. Freeze all motion for captures.
  if (params.has("nofx")) {
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{transition:none!important;animation:none!important}";
    document.documentElement.appendChild(style);
  }

  const scene = params.get("scene");
  if (scene) {
    const openTab = (name) => {
      const b = [...document.querySelectorAll(".tabs button")].find(
        (n) => n.textContent === name
      );
      if (b) b.click();
    };

    window.addEventListener("load", () => {
      setTimeout(() => {
        if (scene === "menu") {
          const cell = document.querySelector(".items-card > .icon:not(.empty)");
          if (!cell) return;
          const r = cell.getBoundingClientRect();
          cell.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: Math.round(r.left + r.width * 0.55),
              clientY: Math.round(r.top + r.height * 0.62)
            })
          );
          return;
        }
        const tabs = { themes: "Themes", layout: "Layout", icons: "Icons", search: "Search" };
        if (tabs[scene]) {
          const btn = document.getElementById("settingsBtn");
          if (btn) btn.click();
          setTimeout(() => openTab(tabs[scene]), 450);
        }
      }, 600);
    });
  }

  console.warn(
    "[shim] chrome.* is faked. This is a plain page, not the installed extension. " +
      "No host permissions and no CORS bypass, so downloading icons from a remote " +
      "CDN cannot work here. Load the folder via chrome://extensions for that."
  );
})();
