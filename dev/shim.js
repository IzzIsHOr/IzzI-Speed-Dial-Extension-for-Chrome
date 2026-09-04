// Shim peste API-urile chrome.*, doar pentru verificare in browser obisnuit.
// Nu face parte din extensie. Se incarca inaintea modulelor.

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
    permissions: {
      request: async () => confirm("[shim] Extensia ar cere permisiune pentru acest domeniu. Accepti?")
    },
    tabs: {
      query: async () => [{ url: location.href, title: document.title }],
      create: ({ url }) => window.open(url, "_blank")
    }
  };

  console.log("[shim] API-urile chrome.* sunt simulate. Nu e extensia reala.");
})();
