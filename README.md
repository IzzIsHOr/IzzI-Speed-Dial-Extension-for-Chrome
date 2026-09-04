# IzzI Speed Dial

A speed-dial new tab page for Chrome, built to replace Infinity New Tab. Same
grid, same folders, same feel — without the affiliate links, without the icon
CDN, and without an account on anybody's server.

Your icons are cropped by you and stored on your machine. The extension ships
with no network permissions at all.

## Install

Grab the zip from [Releases](https://github.com/IzzIsHOr/IzzI-Speed-Dial-Extension-for-Chrome/releases),
unzip it somewhere you will not move, then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick the unzipped folder
4. Open a new tab

Chrome will ask whether to change your new tab page. Accept.

Chrome shows a "Disable developer mode extensions" bubble on startup for
anything installed this way. That is Chrome's warning about unreviewed
extensions in general, not about this one; dismiss it and it stays installed.
The only way to remove that bubble, and to get automatic updates, is the
Chrome Web Store.

> An unpacked extension's ID is derived from its folder path, and all your data
> is keyed to that ID. Once loaded, **do not move or rename the folder** or
> Chrome treats it as a different extension and you start from an empty page.
> Export a `.json` backup first if you need to move it.

## Themes

Settings → **Themes** gives you seven ready-made looks, each a different
arrangement:

| | |
|---|---|
| **Classic** | 6 x 3, the familiar arrangement |
| **Compact** | 8 x 4, more shortcuts on screen |
| **Spotlight** | 4 x 2, large tiles for the few you actually use |
| **Minimal** | 5 x 2 circles, no names, no search bar |
| **Dock** | a single row of 9, like a taskbar |
| **Wall** | 10 x 5, everything at once, names off |
| **Paper** | 6 x 3 on a light background, dark labels |

A theme is only a bundle of slider positions. Pick one, then change anything
you like and it stays changed. Themes never touch a background image you set
yourself; their colour only applies when the background is a plain colour.

## Coming from Infinity New Tab

Settings → **Backup** → **Import from Infinity…**

Export a backup from Infinity first (their settings have the button; the file
ends in `.infinity`), then load it here. What comes across:

| | |
|---|---|
| Shortcuts, folders, pages | yes |
| Layout: rows, columns, spacing, icon size, fonts | yes |
| Wallpaper | yes — it is embedded in their file as a data URL |
| Search engine, if we have it | yes |
| Icons | only if you say so, see below |
| Notes, to-dos, weather | no, this extension has none of those |

**About the icons.** Infinity does not put the artwork in the backup file. It
only stores links to their own CDN (`infinitypro-img.infinitynewtab.com`). So
recovering your icons means downloading them from there, once. The import
dialog asks first, and Chrome then asks you to allow that host.

This is the only time this extension ever contacts Infinity, it is a plain GET
of your own images, and nothing is sent to them. Decline it and every shortcut
still imports, falling back to the browser's favicon.

> Icons can only be downloaded by the **installed** extension. Run the import
> from a real new tab after loading the folder through `chrome://extensions`.
> Opened as a plain page (`dev-preview.html`, or the dev server) there is no
> host access and the browser blocks the CDN read, so the import dialog says so
> and skips the download.

Their icons are PNGs that are mostly transparent (measured on real ones: 63-84%
fully clear pixels), and that transparency survives the WebP re-encode intact.
Imported icons therefore get **no plate behind them** unless Infinity's own
`bgColor` asks for one. You can change that per icon in the editor: None,
White, Auto (the icon's dominant colour) or any colour you pick.

Tested against a real 11.0.41 export: 18 shortcuts, wallpaper and all settings
came across, 18 icons downloaded and cropped in about a quarter of a second,
and the whole set fit in sync at full quality using 59 KB.

## What it does

- Icon grid with drag & drop, folders and multiple pages
- Icons from: a file on disk, drag & drop, paste (Ctrl+V), the browser's own
  favicon cache, or a letter and a colour
- Square crop with pan and zoom before saving
- Transparency is preserved end to end; the plate behind an icon is yours to
  choose (none by default)
- Search bar, 8 engines, no live suggestions
- Wallpaper: colour or image, with blur and darkening
- Sync through your Google account (`chrome.storage.sync`)
- Full backup and restore as `.json`

Right-click an icon to edit, rename or delete it. Right-click a page dot to
rename or delete the page. Drag one icon onto another and **hold it there for
about 0.7s** to make a folder.

## Sync: what fits and what does not

Chrome caps `chrome.storage.sync` at **100 KB in total, 8 KB per entry, 512
entries**. There is no way around it, so the extension works on two levels:

| | holds | limit |
|---|---|---|
| `storage.local` | everything: 256px icons, wallpaper, settings | unlimited |
| `storage.sync` | layout, settings, icons re-encoded small | 100 KB |

Icons are deduplicated by hash and cut into 7 KB chunks. When they do not fit,
quality drops first and size second, along the rungs in `LADDER` (store.js).

Measured on realistic icons:

| image icons | result |
|---|---|
| up to ~60 | all fit at 96px, quality 85% |
| ~80 | all fit, at 80px / 35% |
| 100+ | ~82 fit, the rest are reported by name |

The reason it stops there: lossy WebP has a floor around 1000 bytes it will not
go below however small the image is. Shrinking from 96px to 48px saves only
about 20%. That is why the ladder walks quality down rather than size.

**Letter-and-colour icons cost about 40 bytes**, favicon ones about 20. Build
your page out of those and the number of shortcuts is effectively unlimited.

The wallpaper stays local — it runs to a few MB and cannot fit in 100 KB. It
does go into the `.json` backup, which has no limit.

### Guard against accidental wipes

If `storage.local` is empty but sync holds shortcuts (extension reinstalled,
fresh profile, a race at startup), the push is **refused**. Sync is only
emptied by the "Clear sync" button.

## What it does not do, unlike Infinity New Tab

Checked against their bundle, version 11.0.41:

- **No affiliate links.** In theirs, the default icons do not go to the site:
  Amazon, Walmart, Microsoft and Samsung route through `sovrn.co`, TripAdvisor
  through `redirect.viglink.com`, the Chinese shops through
  `c.duomai.com/track.php?...&euid=infinity`. Their own HTML says it plainly:
  "As an eBay Partner Network Affiliate, we earn from qualifying purchases."
  Here, links go exactly where they say.
- **No icon CDN.** In theirs every icon is an `<img>` from
  `infinityicon.infinitynewtab.com`, so their server sees your IP and exactly
  which shortcuts you keep, on every new tab. Here icons are stored locally.
- **No account on someone else's server.** In theirs the layout, notes and
  to-dos go to `api.inftab.com/v2` and `infinity-api.infinitynewtab.com`. Here
  sync runs through your own Google account, directly, with no middleman.
- **No uninstall ping** (`uninstall.infinitynewtab.com/?from=`).
- **No icon store.**
- **No network permissions by default.** Theirs: `bookmarks`, `history`,
  `topSites`, `management`, `<all_urls>`. Here: `storage`, `unlimitedStorage`,
  `favicon`, `activeTab`.

The extension can reach the internet in exactly two places, both of which you
trigger by hand: "Grab the icon from the site", and importing icons from an
Infinity backup. Each asks permission for those hosts alone.

## Layout

```
manifest.json
icons/                 the extension's own icons
src/
  lib/
    defaults.js        default settings, search engines, seed
    layout.js          grid geometry, ported 1:1 from Infinity
    store.js           two-level storage, chunking, sync budget
    imgutil.js         crop, resize, re-encode, hash
    icons.js           icon drawing
    backup.js          .json export and import
    import-infinity.js reading an Infinity backup
  newtab/
    index.html  newtab.css  newtab.js
    ui.js              dialogs, toast, context menu
    editor.js          add/edit a shortcut, plus cropping
    settings.js        the settings panel
  popup/               "add the current page"
```

`layout.js` carries their exact formulas (the constants 0.575, 0.1818, 0.0963,
2.451 and so on) so sizes and spacing land identically at any resolution. The
CSS variable names are theirs too: `--icon-col`, `--icon-width`,
`--search-height` and the rest.

## Development

`dev/` and `dev-preview.html` are **not part of the extension**. They are a
harness that fakes the `chrome.*` APIs so the page can be opened in an ordinary
browser. Exclude them if you package this for distribution.

```bash
node dev/server.cjs
```

then `http://localhost:5177`.

Syntax check:

```bash
for f in src/**/*.js; do node --check "$f"; done
```

The icons are generated, not drawn by hand. Edit the constants at the top of
`dev/make-icons.cjs` and run it to rewrite all four sizes:

```bash
node dev/make-icons.cjs
```
