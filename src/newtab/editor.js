// The add/edit dialog for a shortcut, including picking and cropping the icon.
//
// Icon sources, none of which call a server of ours:
//   - a file from disk, dragged in, or pasted from the clipboard
//   - the favicon out of Chrome's cache (no network at all)
//   - a letter and a colour
//   - downloaded straight from the site itself, only on request and only after
//     permission is granted for that one domain
//
// There is no icon store and no CDN.

import { el, openDialog, field, toast } from "./ui.js";
import { putBlob, getBlob } from "../lib/store.js";
import {
  loadImage,
  readFileAsDataURL,
  cropToDataURL,
  dominantColor,
  initialFor,
  hostOf,
  normalizeUrl,
  FULL_SIZE
} from "../lib/imgutil.js";
import { faviconUrl } from "../lib/icons.js";
import { TILE_COLORS } from "../lib/defaults.js";

/* ------------------------------------------------------------------ crop */

/** Square crop with pan and zoom. Resolves with a dataURL, or null. */
export function cropDialog(sourceDataURL) {
  return openDialog({
    title: "Crop the icon",
    wide: true,
    build: async ({ close, body, footer }) => {
      const stage = el("div", { class: "crop-stage" });
      const canvas = el("canvas");
      stage.appendChild(canvas);
      body.append(
        stage,
        el("p", {
          class: "crop-hint",
          text: "Drag to move, scroll to zoom. The bright square is what gets saved."
        })
      );

      const img = await loadImage(sourceDataURL);
      const ctx = canvas.getContext("2d");

      let W = 0, H = 0, cs = 0, cx = 0, cy = 0;
      let scale = 1, ox = 0, oy = 0;
      let minScale = 1;

      function measure(reset) {
        const r = stage.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        W = r.width;
        H = r.height;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        cs = Math.min(W, H) * 0.72;
        cx = (W - cs) / 2;
        cy = (H - cs) / 2;

        minScale = cs / Math.min(img.naturalWidth, img.naturalHeight);
        if (reset) {
          scale = minScale;
          ox = cx + (cs - img.naturalWidth * scale) / 2;
          oy = cy + (cs - img.naturalHeight * scale) / 2;
        }
        clamp();
      }

      // the image must always cover the crop square
      function clamp() {
        if (scale < minScale) scale = minScale;
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ox = Math.min(cx, Math.max(cx + cs - w, ox));
        oy = Math.min(cy, Math.max(cy + cs - h, oy));
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, ox, oy, img.naturalWidth * scale, img.naturalHeight * scale);

        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.rect(cx, cy, cs, cs);
        ctx.fill("evenodd");

        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 0.75, cy + 0.75, cs - 1.5, cs - 1.5);

        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + (cs / 3) * i, cy);
          ctx.lineTo(cx + (cs / 3) * i, cy + cs);
          ctx.moveTo(cx, cy + (cs / 3) * i);
          ctx.lineTo(cx + cs, cy + (cs / 3) * i);
          ctx.stroke();
        }
      }

      let dragging = false;
      let last = null;

      stage.addEventListener("pointerdown", (e) => {
        dragging = true;
        last = { x: e.clientX, y: e.clientY };
        stage.classList.add("grabbing");
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        ox += e.clientX - last.x;
        oy += e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        clamp();
        draw();
      });
      const stop = (e) => {
        dragging = false;
        stage.classList.remove("grabbing");
        try {
          stage.releasePointerCapture(e.pointerId);
        } catch {
          /* the pointer may already have been released */
        }
      };
      stage.addEventListener("pointerup", stop);
      stage.addEventListener("pointercancel", stop);

      stage.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const r = stage.getBoundingClientRect();
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          const factor = Math.exp(-e.deltaY * 0.0015);
          const next = Math.min(Math.max(scale * factor, minScale), minScale * 12);
          // keep the point under the cursor pinned
          ox = px - ((px - ox) * next) / scale;
          oy = py - ((py - oy) * next) / scale;
          scale = next;
          clamp();
          draw();
        },
        { passive: false }
      );

      const onResize = () => {
        measure(false);
        draw();
      };
      window.addEventListener("resize", onResize);

      // the stage only has a size once it is in the document
      requestAnimationFrame(() => {
        measure(true);
        draw();
      });

      footer.append(
        el(
          "button",
          {
            class: "btn",
            onclick: () => {
              measure(true);
              draw();
            }
          },
          "Reset"
        ),
        el("button", { class: "btn", onclick: () => finish(null) }, "Cancel"),
        el("button", { class: "btn primary", onclick: () => finish(cut()) }, "Use this")
      );

      function cut() {
        return cropToDataURL(
          img,
          FULL_SIZE,
          {
            sx: (cx - ox) / scale,
            sy: (cy - oy) / scale,
            sw: cs / scale,
            sh: cs / scale
          },
          "image/webp",
          0.92
        );
      }

      function finish(value) {
        window.removeEventListener("resize", onResize);
        close(value);
      }
    }
  });
}

/* ------------------------------------------------- downloading from a site */

/**
 * Asks for permission on that one domain, then looks for the largest icon the
 * site publishes. Only ever runs when the button is pressed.
 */
async function fetchSiteIcon(url) {
  const origin = new URL(url).origin;
  const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  if (!granted) throw new Error("Permission denied.");

  const candidates = [];
  try {
    const html = await (await fetch(url, { credentials: "omit", redirect: "follow" })).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = [...doc.querySelectorAll('link[rel~="icon" i], link[rel~="apple-touch-icon" i]')];
    links.sort((a, b) => {
      const size = (n) => parseInt((n.getAttribute("sizes") || "0").split("x")[0], 10) || 0;
      const touch = (n) => (/apple-touch/i.test(n.getAttribute("rel") || "") ? 1000 : 0);
      return size(b) + touch(b) - (size(a) + touch(a));
    });
    for (const l of links) candidates.push(new URL(l.getAttribute("href"), url).href);
  } catch {
    /* some sites block reading the page; fall back to the standard paths */
  }

  candidates.push(
    origin + "/apple-touch-icon.png",
    origin + "/apple-touch-icon-precomposed.png",
    origin + "/favicon.ico"
  );

  for (const href of candidates) {
    try {
      const res = await fetch(href, { credentials: "omit" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.size || !/^image\//.test(blob.type)) continue;
      return await readFileAsDataURL(blob);
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error("Found no icon on that site.");
}

/* -------------------------------------------------------- the item editor */

/**
 * @param {object|null} existing  the item to edit, or null for a new one
 * @param {object} opts  {defaultUrl, defaultName}
 * @returns {Promise<object|null>} the saved item
 */
export function itemDialog(existing, opts = {}) {
  const isNew = !existing;
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        type: "link",
        name: opts.defaultName || "",
        url: opts.defaultUrl || "",
        icon: { kind: "favicon", bg: "#ffffff" }
      };

  return openDialog({
    title: isNew ? "New shortcut" : "Edit shortcut",
    build: ({ close, body, footer }) => {
      const nameInput = el("input", {
        type: "text",
        value: draft.name || "",
        placeholder: "Name",
        oninput: (e) => {
          draft.name = e.target.value;
          refresh();
        }
      });

      const urlInput = el("input", {
        type: "text",
        value: draft.url || "",
        placeholder: "https://example.com",
        oninput: (e) => {
          draft.url = e.target.value;
          if (!draft.name.trim()) nameInput.placeholder = hostOf(normalizeUrl(draft.url)) || "Name";
          refresh();
        }
      });

      const preview = el("div", { class: "icon-preview" });

      const swatchWrap = el("div", { class: "swatches" });
      for (const c of TILE_COLORS) {
        swatchWrap.appendChild(
          el("button", {
            class: "swatch",
            style: "background:" + c,
            title: c,
            onclick: () => {
              draft.icon = {
                kind: "tile",
                bg: c,
                text: draft.icon.kind === "tile" ? draft.icon.text : initialFor(draft.name || hostOf(normalizeUrl(draft.url)))
              };
              refresh();
            }
          })
        );
      }

      const dropzone = el("div", {
        class: "dropzone",
        text: "Drop an image here, or paste with Ctrl+V"
      });

      const sources = el(
        "div",
        { class: "icon-sources" },
        el("button", { class: "btn", onclick: pickFile }, "Upload an image…"),
        el("button", { class: "btn", onclick: useFavicon }, "Favicon from the browser"),
        el("button", { class: "btn", onclick: grabFromSite }, "Grab the icon from the site…"),
        dropzone
      );

      const plateField = el("div", { class: "field" });

      body.append(
        field("Name", nameInput),
        field("Address", urlInput),
        el("div", { class: "icon-editor" }, preview, sources),
        plateField,
        el("div", { class: "field" }, el("label", { text: "Or a letter and a colour" }), swatchWrap),
        el("p", {
          class: "note",
          text:
            "A letter and a colour cost about 40 bytes in sync. An image costs 1-5 KB. " +
            "The favicon is free: it comes from Chrome's cache, with no network request."
        })
      );

      footer.append(
        el("button", { class: "btn", onclick: () => close(null) }, "Cancel"),
        el("button", { class: "btn primary", onclick: save }, isNew ? "Add" : "Save")
      );

      /* --- icon sources --- */

      // Keep the plate off by default. Logos are usually mostly transparent, and
      // anything opaque behind them reads as a solid square around the artwork.
      async function useImage(dataURL) {
        const cropped = await cropDialog(dataURL);
        if (!cropped) return;
        const hash = await putBlob(cropped);
        draft.icon = { kind: "image", hash, bg: "transparent" };
        refresh();
      }

      function pickFile() {
        const input = el("input", { type: "file", accept: "image/*" });
        input.onchange = async () => {
          const f = input.files && input.files[0];
          if (f) await useImage(await readFileAsDataURL(f));
        };
        input.click();
      }

      function useFavicon() {
        draft.icon = { kind: "favicon", bg: "#ffffff" };
        refresh();
      }

      async function grabFromSite() {
        const url = normalizeUrl(draft.url);
        if (!url) return toast("Type the address first.");
        toast("Looking for an icon on that site…");
        try {
          await useImage(await fetchSiteIcon(url));
        } catch (e) {
          toast(e.message);
        }
      }

      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("over");
      });
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("over"));
      dropzone.addEventListener("drop", async (e) => {
        e.preventDefault();
        dropzone.classList.remove("over");
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f && /^image\//.test(f.type)) await useImage(await readFileAsDataURL(f));
      });

      const onPaste = async (e) => {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            await useImage(await readFileAsDataURL(item.getAsFile()));
            return;
          }
        }
      };
      document.addEventListener("paste", onPaste);

      /* --- preview --- */

      const isClear = (bg) => !bg || bg === "transparent";

      /** Plate picker, only meaningful for a bitmap icon. */
      function renderPlate() {
        plateField.textContent = "";
        plateField.classList.toggle("hide", draft.icon.kind !== "image");
        if (draft.icon.kind !== "image") return;

        const current = draft.icon.bg || "transparent";
        const set = (v) => {
          draft.icon.bg = v;
          refresh();
        };
        const choice = (label, value) =>
          el(
            "button",
            {
              class: "btn" + (current === value ? " sel" : ""),
              onclick: () => set(value)
            },
            label
          );

        plateField.append(
          el("label", { text: "Plate behind the icon" }),
          el(
            "div",
            { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap" },
            choice("None", "transparent"),
            choice("White", "#ffffff"),
            el(
              "button",
              {
                class: "btn",
                title: "Use the icon's own dominant colour",
                onclick: async () => set(await dominantColor(await getBlob(draft.icon.hash)))
              },
              "Auto"
            ),
            el("input", {
              type: "color",
              title: "Pick a colour",
              value: /^#[0-9a-f]{6}$/i.test(current) ? current : "#ffffff",
              onchange: (e) => set(e.target.value)
            })
          )
        );
      }

      async function refresh() {
        preview.textContent = "";
        preview.style.backgroundImage = "";
        preview.style.backgroundColor = "";
        preview.classList.remove("alpha");

        for (const s of swatchWrap.children) {
          s.classList.toggle("sel", draft.icon.kind === "tile" && s.title === draft.icon.bg);
        }

        if (draft.icon.kind === "tile") {
          preview.style.backgroundColor = draft.icon.bg;
          preview.appendChild(
            el("span", {
              text: draft.icon.text || initialFor(draft.name || hostOf(normalizeUrl(draft.url)))
            })
          );
        } else if (draft.icon.kind === "image") {
          const data = await getBlob(draft.icon.hash);
          // the image goes in as a child so the checkerboard can sit behind it
          const clear = isClear(draft.icon.bg);
          preview.classList.toggle("alpha", clear);
          if (!clear) preview.style.backgroundColor = draft.icon.bg;
          if (data) preview.appendChild(el("img", { src: data, class: "full", alt: "" }));
        } else {
          const url = normalizeUrl(draft.url);
          preview.style.backgroundColor = "#fff";
          if (url) preview.appendChild(el("img", { src: faviconUrl(url, 128), alt: "" }));
        }

        renderPlate();
      }

      refresh();

      function save() {
        const url = normalizeUrl(draft.url);
        if (!url) {
          urlInput.focus();
          return toast("The address is missing.");
        }
        try {
          new URL(url);
        } catch {
          urlInput.focus();
          return toast("That address is not valid.");
        }
        draft.url = url;
        draft.name = draft.name.trim() || hostOf(url);
        if (draft.icon.kind === "tile" && !draft.icon.text) {
          draft.icon.text = initialFor(draft.name);
        }
        document.removeEventListener("paste", onPaste);
        close(draft);
      }
    },
    onClose: () => {}
  });
}

/** Short dialog for renaming a folder or a page. */
export function renameDialog(title, current) {
  return openDialog({
    title,
    build: ({ close, body, footer }) => {
      const input = el("input", {
        type: "text",
        value: current || "",
        onkeydown: (e) => {
          if (e.key === "Enter") close(input.value.trim() || current);
        }
      });
      body.appendChild(field("Name", input));
      footer.append(
        el("button", { class: "btn", onclick: () => close(null) }, "Cancel"),
        el(
          "button",
          { class: "btn primary", onclick: () => close(input.value.trim() || current) },
          "Save"
        )
      );
    }
  });
}
