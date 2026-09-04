// The settings panel. Every change applies immediately and is saved.

import {
  el,
  openDialog,
  row,
  section,
  slider,
  toggle,
  dropdown,
  toast,
  confirmDialog
} from "./ui.js";
import {
  saveSettings,
  syncStatus,
  pushSync,
  pullSync,
  clearSync,
  setWallpaper,
  loadDoc,
  gcBlobs
} from "../lib/store.js";
import { downloadBackup, pickBackupFile, restoreBackup } from "../lib/backup.js";
import {
  inspectInfinityBackup,
  importInfinity,
  requestIconPermission,
  hasIconPermission,
  isExtensionContext
} from "../lib/import-infinity.js";
import { readFileAsDataURL } from "../lib/imgutil.js";
import { SEARCH_ENGINES, DEFAULT_SETTINGS } from "../lib/defaults.js";
import { THEMES, applyTheme, matchTheme } from "../lib/themes.js";

const KB = (n) => (n / 1024).toFixed(1) + " KB";
const pct = (v) => Math.round(v * 100) + "%";

export function settingsDialog(settings, { onChange, onReload }) {
  const apply = () => {
    onChange(settings);
    saveSettings(settings);
  };

  // moving a slider by hand means the look is no longer a stock theme
  const applyManual = () => {
    settings.themeId = null;
    apply();
  };

  return openDialog({
    title: "Settings",
    wide: true,
    build: ({ body, footer, dialog }) => {
      dialog.classList.add("wider");

      const tabs = el("div", { class: "tabs" });
      const panel = el("div");
      dialog.insertBefore(tabs, body);
      body.appendChild(panel);

      const pages = {
        Themes: themesTab,
        Layout: layoutTab,
        Icons: iconTab,
        Search: searchTab,
        "Sync & backup": dataTab,
        About: aboutTab
      };

      let active = "Themes";
      for (const name of Object.keys(pages)) {
        tabs.appendChild(
          el("button", {
            text: name,
            class: name === active ? "active" : "",
            onclick: () => {
              active = name;
              for (const b of tabs.children) b.classList.toggle("active", b.textContent === name);
              render();
            }
          })
        );
      }

      function render() {
        panel.textContent = "";
        pages[active](panel);
        panel.scrollTop = 0;
      }
      render();

      footer.append(
        el(
          "button",
          {
            class: "btn danger",
            onclick: async () => {
              if (
                await confirmDialog(
                  "Back to the original settings",
                  "Shortcuts and icons stay. Only the appearance is reset.",
                  { okLabel: "Reset" }
                )
              ) {
                Object.assign(settings, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
                apply();
                render();
                toast("Appearance reset.");
              }
            }
          },
          "Reset appearance"
        ),
        el("div", { style: "flex:1" }),
        el(
          "button",
          { class: "btn primary", onclick: () => dialog.querySelector(".close").click() },
          "Done"
        )
      );

      /* ------------------------------------------------------------ themes */

      function themePreview(theme) {
        const { row: r, col: c } = theme.patch.layout;
        const light = theme.id === "paper";
        const box = el("div", {
          class: "theme-preview" + (light ? " light" : ""),
          style: `background:${theme.background.color};background-image:${theme.background.gradient || "none"}`
        });

        // dot size follows the real grid so the card actually shows the arrangement
        const size = Math.max(3, Math.min(11, Math.round(96 / c)));
        const mini = el("div", {
          class: "mini",
          style: `grid-template-columns:repeat(${c},${size}px)`
        });
        for (let i = 0; i < r * c; i++) {
          mini.appendChild(
            el("i", {
              style: `width:${size}px;height:${size}px;border-radius:${(size * theme.patch.icon.radius).toFixed(1)}px;opacity:${theme.patch.icon.opacity}`
            })
          );
        }
        box.appendChild(mini);
        return box;
      }

      function themesTab(p) {
        const current = matchTheme(settings);
        const grid = el("div", { class: "theme-grid" });

        for (const theme of THEMES) {
          grid.appendChild(
            el(
              "button",
              {
                class: "theme-card" + (current && current.id === theme.id ? " sel" : ""),
                onclick: () => {
                  applyTheme(settings, theme);
                  apply();
                  render();
                  toast(theme.name + " applied.");
                }
              },
              themePreview(theme),
              el(
                "div",
                { class: "theme-meta" },
                el("b", { text: theme.name }),
                el("small", { text: theme.hint })
              )
            )
          );
        }

        p.append(
          section(
            "Pick a look",
            "Presets for the layout. Change anything afterwards and it sticks.",
            grid
          )
        );

        /* ---- background lives here too, it is part of the look ---- */

        const kindSel = dropdown(
          settings.wallpaper.kind,
          [
            { value: "color", label: "Colour" },
            { value: "image", label: "Your own image" }
          ],
          (v) => {
            settings.wallpaper.kind = v;
            apply();
            render();
          }
        );

        const bgRows = [row("Type", null, kindSel)];

        if (settings.wallpaper.kind === "color") {
          bgRows.push(
            row(
              "Colour",
              settings.wallpaper.gradient ? "The theme adds a gradient on top" : null,
              el(
                "div",
                { style: "display:flex;gap:8px;align-items:center" },
                el("input", {
                  type: "color",
                  value: settings.wallpaper.color,
                  oninput: (e) => {
                    settings.wallpaper.color = e.target.value;
                    apply();
                  }
                }),
                settings.wallpaper.gradient
                  ? el(
                      "button",
                      {
                        class: "btn",
                        onclick: () => {
                          settings.wallpaper.gradient = null;
                          apply();
                          render();
                        }
                      },
                      "Flat colour"
                    )
                  : null
              )
            )
          );
        } else {
          bgRows.push(
            row(
              "Image",
              "Stays on this computer",
              el(
                "div",
                { style: "display:flex;gap:8px" },
                el(
                  "button",
                  {
                    class: "btn",
                    onclick: () => {
                      const input = el("input", { type: "file", accept: "image/*" });
                      input.onchange = async () => {
                        const f = input.files && input.files[0];
                        if (!f) return;
                        await setWallpaper(await readFileAsDataURL(f));
                        onReload();
                        toast("Background changed.");
                      };
                      input.click();
                    }
                  },
                  "Choose…"
                ),
                el(
                  "button",
                  {
                    class: "btn",
                    onclick: async () => {
                      await setWallpaper(null);
                      onReload();
                      toast("Image removed.");
                    }
                  },
                  "Remove"
                )
              )
            ),
            row(
              "Blur",
              null,
              slider(settings.wallpaper.blur, 0, 40, 1, (v) => v + "px", (v) => {
                settings.wallpaper.blur = v;
                apply();
              })
            ),
            row(
              "Darken",
              "Keeps labels readable on light photos",
              slider(settings.wallpaper.mask, 0, 0.8, 0.02, pct, (v) => {
                settings.wallpaper.mask = v;
                apply();
              })
            )
          );
        }

        p.append(section("Background", null, ...bgRows));
      }

      /* ------------------------------------------------------------ layout */

      function layoutTab(p) {
        p.append(
          section(
            "The grid",
            `${settings.layout.col} across, ${settings.layout.row} down. ` +
              `${settings.layout.col * settings.layout.row} shortcuts per page.`,
            row(
              "Columns",
              "Icons across",
              slider(settings.layout.col, 3, 12, 1, (v) => v, (v) => {
                settings.layout.col = v;
                applyManual();
              })
            ),
            row(
              "Rows",
              "Icons down",
              slider(settings.layout.row, 1, 8, 1, (v) => v, (v) => {
                settings.layout.row = v;
                applyManual();
              })
            ),
            row(
              "Row spacing",
              null,
              slider(settings.layout.rowGap, 0, 1, 0.05, (v) => v.toFixed(2), (v) => {
                settings.layout.rowGap = v;
                applyManual();
              })
            ),
            row(
              "Column spacing",
              null,
              slider(settings.layout.colGap, 0, 1, 0.05, (v) => v.toFixed(2), (v) => {
                settings.layout.colGap = v;
                applyManual();
              })
            ),
            row(
              "Overall scale",
              "Scales everything at once",
              slider(settings.behavior.mainRatio, 0.6, 1.6, 0.05, (v) => v.toFixed(2), (v) => {
                settings.behavior.mainRatio = v;
                applyManual();
              })
            )
          ),
          section(
            "Behaviour",
            null,
            row(
              "Open shortcuts in a new tab",
              "Ctrl-click always does",
              toggle(settings.behavior.openInNewTab, (v) => {
                settings.behavior.openInNewTab = v;
                apply();
              })
            ),
            row(
              "Ask before deleting",
              null,
              toggle(settings.behavior.confirmDelete, (v) => {
                settings.behavior.confirmDelete = v;
                apply();
              })
            ),
            row(
              "Show page dots",
              "The row under the grid",
              toggle(settings.behavior.showPageDots, (v) => {
                settings.behavior.showPageDots = v;
                apply();
              })
            )
          )
        );
      }

      /* ------------------------------------------------------------- icons */

      function iconTab(p) {
        p.append(
          section(
            "Shape",
            null,
            row(
              "Size",
              "How much of its cell it fills",
              slider(settings.icon.scale, 0.2, 1, 0.02, pct, (v) => {
                settings.icon.scale = v;
                applyManual();
              })
            ),
            row(
              "Corner rounding",
              "All the way up makes circles",
              slider(settings.icon.radius, 0, 0.5, 0.01, (v) => Math.round(v * 200) + "%", (v) => {
                settings.icon.radius = v;
                applyManual();
              })
            ),
            row(
              "Opacity",
              null,
              slider(settings.icon.opacity, 0.2, 1, 0.02, pct, (v) => {
                settings.icon.opacity = v;
                applyManual();
              })
            ),
            row(
              "Drop shadow",
              "Helps on busy backgrounds",
              toggle(settings.icon.shadow, (v) => {
                settings.icon.shadow = v;
                applyManual();
              })
            )
          ),
          section(
            "Labels",
            null,
            row(
              "Show names",
              null,
              toggle(!settings.icon.hideName, (v) => {
                settings.icon.hideName = !v;
                applyManual();
              })
            ),
            row(
              "Text size",
              null,
              slider(settings.icon.fontSize, 9, 24, 1, (v) => v + "px", (v) => {
                settings.icon.fontSize = v;
                applyManual();
              })
            ),
            row(
              "Text colour",
              null,
              el("input", {
                type: "color",
                value: settings.icon.fontColor,
                onchange: (e) => {
                  settings.icon.fontColor = e.target.value;
                  applyManual();
                }
              })
            ),
            row(
              "Text shadow",
              null,
              toggle(settings.icon.fontShadow, (v) => {
                settings.icon.fontShadow = v;
                applyManual();
              })
            )
          ),
          section(
            "Motion",
            null,
            row(
              "Animate icons on open",
              null,
              toggle(settings.icon.startAnimation, (v) => {
                settings.icon.startAnimation = v;
                apply();
              })
            )
          )
        );
      }

      /* ------------------------------------------------------------ search */

      function searchTab(p) {
        const engineSel = dropdown(
          settings.search.engine,
          Object.entries(SEARCH_ENGINES).map(([k, v]) => ({ value: k, label: v.name })),
          (v) => {
            settings.search.engine = v;
            apply();
          }
        );

        p.append(
          section(
            "Search bar",
            "No live suggestions. Nothing is sent anywhere while you type.",
            row(
              "Show it",
              null,
              toggle(settings.search.show, (v) => {
                settings.search.show = v;
                applyManual();
              })
            ),
            row("Engine", "Also on the badge in the bar", engineSel),
            row(
              "Open results in a new tab",
              null,
              toggle(settings.search.openInNewTab, (v) => {
                settings.search.openInNewTab = v;
                apply();
              })
            )
          ),
          section(
            "Appearance",
            null,
            row(
              "Width",
              null,
              slider(settings.search.scale, 0.4, 1.2, 0.02, (v) => v.toFixed(2), (v) => {
                settings.search.scale = v;
                applyManual();
              })
            ),
            row(
              "Rounding",
              null,
              slider(settings.search.radius, 0, 0.5, 0.01, (v) => Math.round(v * 200) + "%", (v) => {
                settings.search.radius = v;
                applyManual();
              })
            ),
            row(
              "Opacity",
              null,
              slider(settings.search.opacity, 0.3, 1, 0.02, pct, (v) => {
                settings.search.opacity = v;
                applyManual();
              })
            ),
            row(
              "Button colour",
              null,
              el("input", {
                type: "color",
                value: settings.search.btnColor,
                onchange: (e) => {
                  settings.search.btnColor = e.target.value;
                  applyManual();
                }
              })
            )
          )
        );
      }

      /* --------------------------------------------------- sync and backup */

      function dataTab(p) {
        const status = el("div", { class: "note", text: "Reading…" });
        const meter = el("div", { class: "meter" }, el("i", { style: "width:0%" }));

        p.append(
          section(
            "Coming from Infinity New Tab",
            "Export a backup from Infinity, then load the .infinity file here. Shortcuts, " +
              "folders, pages, layout and wallpaper all come across.",
            el(
              "div",
              { style: "margin:4px 0 2px" },
              el(
                "button",
                { class: "btn primary", onclick: importFromInfinity },
                "Import from Infinity…"
              )
            )
          ),

          section(
            "Sync through your Google account",
            "Chrome allows 100 KB. Layout, settings and small icons fit. " +
              "Background images and full-size originals stay on this computer.",
            row(
              "Keep devices in sync",
              "The account Chrome is signed into",
              toggle(settings.sync.enabled, (v) => {
                settings.sync.enabled = v;
                apply();
                render();
              })
            ),
            row(
              "Largest icon size to send",
              "Quality drops first if space runs out",
              slider(settings.sync.iconSize, 48, 96, 16, (v) => v + "px", (v) => {
                settings.sync.iconSize = v;
                apply();
              })
            ),
            meter,
            status,
            el(
              "div",
              { style: "display:flex;gap:8px;margin:12px 0 0" },
              el(
                "button",
                {
                  class: "btn",
                  onclick: async () => {
                    toast("Sending…");
                    const r = await pushSync();
                    if (r.error) toast("That did not work: " + r.error);
                    else if (r.skipped) toast(r.reason || "Sync is off.");
                    else {
                      const s = r.report;
                      toast(
                        `Sent. ${s.included.length} icons at ${s.iconSize}px, ` +
                          `quality ${Math.round(s.iconQuality * 100)}%` +
                          (s.skipped.length ? `, ${s.skipped.length} did not fit.` : ".")
                      );
                    }
                    refreshStatus();
                  }
                },
                "Send now"
              ),
              el(
                "button",
                {
                  class: "btn",
                  onclick: async () => {
                    const r = await pullSync({ force: true });
                    if (r.error) return toast("That did not work: " + r.error);
                    if (r.nothing) return toast("There is nothing in sync.");
                    onReload();
                    toast("Pulled from sync.");
                  }
                },
                "Pull now"
              ),
              el(
                "button",
                {
                  class: "btn danger",
                  onclick: async () => {
                    if (
                      await confirmDialog(
                        "Clear sync",
                        "Removes the copy held in your Google account. What is on this computer is untouched.",
                        { danger: true, okLabel: "Clear" }
                      )
                    ) {
                      await clearSync();
                      toast("Sync cleared.");
                      refreshStatus();
                    }
                  }
                },
                "Clear sync"
              )
            )
          ),

          section(
            "Backup file",
            "Holds everything at full resolution, with no size limit. Keep one somewhere safe.",
            el(
              "div",
              { style: "display:flex;gap:8px;flex-wrap:wrap" },
              el(
                "button",
                {
                  class: "btn",
                  onclick: async () => {
                    const r = await downloadBackup();
                    toast(`Saved: ${KB(r.bytes)}, ${r.icons} icons.`);
                  }
                },
                "Export"
              ),
              el("button", { class: "btn", onclick: () => doRestore("replace") }, "Import (replace)"),
              el("button", { class: "btn", onclick: () => doRestore("merge") }, "Import (add)"),
              el(
                "button",
                {
                  class: "btn",
                  onclick: async () => {
                    const n = await gcBlobs(await loadDoc());
                    toast(n ? `${n} unused icons removed.` : "Nothing to clean up.");
                  }
                },
                "Clean up unused icons"
              )
            )
          )
        );

        async function refreshStatus() {
          const s = await syncStatus();
          meter.firstChild.style.width = Math.min(100, s.percent) + "%";
          meter.className = "meter" + (s.percent > 90 ? " full" : s.percent > 70 ? " warn" : "");
          status.textContent = s.enabled
            ? `${KB(s.bytesUsed)} of ${KB(s.quota)} used (${s.percent}%) · ` +
              `${s.iconCount} icons` +
              (s.iconSize ? ` at ${s.iconSize}px` : "") +
              (s.lastPush ? ` · last write ${new Date(s.lastPush).toLocaleString()}` : "")
            : "Sync is switched off.";
        }
        refreshStatus();

        async function doRestore(mode) {
          try {
            const data = await pickBackupFile();
            if (
              mode === "replace" &&
              !(await confirmDialog(
                "Replace everything",
                "Your current shortcuts will be replaced by the ones in the file.",
                { danger: true, okLabel: "Replace" }
              ))
            ) {
              return;
            }
            const r = await restoreBackup(data, mode);
            onReload();
            toast(`Restored: ${r.items} items, ${r.icons} icons.`);
          } catch (e) {
            toast(e.message);
          }
        }
      }

      /* --------------------------------------------------- infinity import */

      function pickInfinityFile() {
        return new Promise((resolve, reject) => {
          const input = el("input", { type: "file", accept: ".infinity,application/json,.json" });
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

      async function importFromInfinity() {
        let data;
        let info;
        try {
          data = await pickInfinityFile();
          info = inspectInfinityBackup(data);
        } catch (e) {
          return toast(e.message);
        }

        // Opened as a plain page there is no chrome.permissions to ask with and
        // no host permissions to lift CORS, so icons can never download. Say so
        // up front instead of letting the import look broken.
        const asExtension = isExtensionContext();
        const alreadyAllowed = await hasIconPermission(info.iconOrigins);

        const choices = {
          downloadIcons: info.remoteIcons > 0 && asExtension,
          importSettings: true,
          importWallpaper: info.hasWallpaper
        };
        let permissionNote = null;

        const go = await openDialog({
          title: "Import from Infinity New Tab",
          build: ({ close, body, footer }) => {
            body.append(
              el("p", {
                class: "note",
                text:
                  `Infinity ${info.version}` +
                  (info.exportedAt ? `, exported ${info.exportedAt.toLocaleDateString()}` : "") +
                  ` · ${info.links} shortcuts` +
                  (info.folders ? `, ${info.folders} folders` : "") +
                  ` across ${info.pages} page${info.pages === 1 ? "" : "s"}.`
              })
            );

            if (info.remoteIcons && !asExtension) {
              body.append(
                el("p", {
                  class: "note warn",
                  text:
                    `This page is not the installed extension, so the ${info.remoteIcons} icons ` +
                    "cannot be fetched here. A plain web page has no host access."
                }),
                el("p", {
                  class: "note",
                  text:
                    "Load it through chrome://extensions, open a new tab, and import from there."
                })
              );
            } else if (info.remoteIcons) {
              body.append(
                row(
                  `Download ${info.remoteIcons} icons`,
                  alreadyAllowed
                    ? "Access already granted"
                    : info.iconOrigins.map((o) => o.replace(/^https?:\/\//, "")).join(", "),
                  toggle(choices.downloadIcons, (v) => (choices.downloadIcons = v))
                ),
                el("p", {
                  class: "note warn",
                  text:
                    "Infinity keeps the artwork on its own CDN, not in the backup file, so the " +
                    "icons have to be fetched from there once. " +
                    (alreadyAllowed
                      ? "You have already allowed that host."
                      : "Chrome will ask you to allow it.") +
                    " Nothing is sent to them. Decline and the shortcuts still import, using " +
                    "browser favicons."
                })
              );
            }

            body.append(
              row(
                "Bring the layout across",
                "Rows, columns, spacing, icon size, fonts",
                toggle(choices.importSettings, (v) => (choices.importSettings = v))
              )
            );

            if (info.hasWallpaper) {
              body.append(
                row(
                  "Bring the wallpaper across",
                  KB(info.wallpaperBytes) + ", already in the file",
                  toggle(choices.importWallpaper, (v) => (choices.importWallpaper = v))
                )
              );
            }

            if (info.notes || info.todos) {
              body.append(
                el("p", {
                  class: "note",
                  text:
                    `The file also holds ${info.notes} notes and ${info.todos} to-dos. ` +
                    "This extension has no notes or to-dos, so those are left behind."
                })
              );
            }

            body.append(
              el("p", {
                class: "note warn",
                text: "Your current shortcuts will be replaced by the ones from Infinity."
              })
            );

            footer.append(
              el("button", { class: "btn", onclick: () => close(false) }, "Cancel"),
              el("button", {
                class: "btn primary",
                text: "Import",
                // The permission has to be asked for here, first thing inside the
                // click handler. Chrome only allows permissions.request() while a
                // user gesture is live, and the gesture does not survive awaiting
                // the dialog, so asking after this closes silently fails and the
                // icons quietly never download.
                onclick: async (e) => {
                  const btn = e.currentTarget;
                  if (choices.downloadIcons && info.iconOrigins.length) {
                    btn.disabled = true;
                    const r = await requestIconPermission(info.iconOrigins);
                    btn.disabled = false;
                    if (!r.granted) {
                      choices.downloadIcons = false;
                      permissionNote = r.error
                        ? "Could not ask for permission: " + r.error
                        : "Permission declined.";
                    }
                  }
                  close(true);
                }
              })
            );
          }
        });

        if (!go) return;
        if (permissionNote) toast(permissionNote + " Importing with browser favicons instead.", 6000);

        const label = el("p", { class: "note", text: "Working…" });
        const bar = el("div", { class: "meter" }, el("i", { style: "width:0%" }));
        let closeProgress = () => {};
        openDialog({
          title: "Importing",
          build: ({ close, body }) => {
            closeProgress = close;
            body.append(bar, label);
          }
        });

        try {
          const stats = await importInfinity(data, {
            ...choices,
            onProgress: (done, total, name) => {
              label.textContent = total ? `Icon ${done + 1} of ${total} · ${name}` : "Working…";
              if (total) bar.firstChild.style.width = Math.round((done / total) * 100) + "%";
            }
          });
          closeProgress();
          onReload();

          const summary =
            `Imported ${stats.links} shortcuts` +
            (stats.folders ? `, ${stats.folders} folders` : "") +
            (stats.iconsDownloaded ? `, ${stats.iconsDownloaded} icons` : "") +
            (stats.skipped ? `, ${stats.skipped} skipped` : "") +
            ".";

          if (stats.iconsFailed) {
            // do not bury this in a toast: the user asked for icons and did not get them
            openDialog({
              title: "Imported, but some icons did not arrive",
              build: ({ close, body, footer }) => {
                body.append(
                  el("p", { class: "note", text: summary }),
                  el("p", {
                    class: "note warn",
                    text: `${stats.iconsFailed} of them could not be downloaded. Those shortcuts fall back to the browser favicon.`
                  })
                );
                if (stats.errors.length) {
                  body.append(
                    el("p", { class: "note", text: "What went wrong:" }),
                    el("ul", { class: "note", style: "margin:0;padding-left:18px" },
                      ...stats.errors.map((m) => el("li", { text: m })))
                  );
                }
                body.append(
                  el("p", {
                    class: "note",
                    text:
                      "If it mentions permission, run the import again and allow access when " +
                      "Chrome asks. You can also set any icon by hand from its right-click menu."
                  })
                );
                footer.append(el("button", { class: "btn primary", onclick: () => close(true) }, "OK"));
              }
            });
          } else {
            toast(summary);
          }
        } catch (e) {
          closeProgress();
          toast("Import failed: " + e.message);
        }
      }

      /* ------------------------------------------------------------- about */

      function aboutTab(p) {
        p.append(
          section(
            "IzzI Speed Dial",
            null,
            el("p", {
              class: "note",
              text:
                "Your icons are stored on this computer. There is no icon store and no CDN, so " +
                "nothing loads from anybody's server."
            }),
            el("p", {
              class: "note",
              text:
                "No network permissions by default. Two things can reach the internet, and you " +
                "start both: grabbing an icon from a site, and importing icons from Infinity. " +
                "Each asks for those hosts alone."
            }),
            el("p", {
              class: "note",
              text:
                "Links go where they say. No affiliate redirects, no analytics, no account " +
                "anywhere."
            })
          )
        );
      }
    }
  });
}
