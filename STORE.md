# Chrome Web Store submission

Copy-paste material for the developer dashboard at
https://chrome.google.com/webstore/devconsole

Upload the zip from `dist/`, built with `node dev/build.cjs`.
Screenshots come from `dist/shots/`, captured with `node dev/shots.cjs` while
the dev server is running.

---

## Name

```
IzzI Speed Dial
```

## Short description

There is no field for this in the dashboard. The store uses the manifest's
`description`, and Chrome rejects the upload if it runs past **132 characters**.
Currently 121:

```
A speed dial new tab. Your own icons, folders and pages, stored on your machine. No tracking, no CDN, no affiliate links.
```

## Detailed description

```
IzzI Speed Dial replaces the new tab page with a grid of your own shortcuts.

Drag them around, drop one on another to make a folder, spread them over several
pages. Give each one whatever icon you like: a file from your disk, something
dragged in or pasted from the clipboard, the browser's own favicon, or just a
letter on a colour. Images get a square crop with pan and zoom before they are
saved.

SEVEN LAYOUTS

Themes are arrangements, not just colour schemes:

  • Classic     the familiar 6 x 3
  • Compact     8 x 4, more on screen
  • Spotlight   4 x 2, large tiles
  • Minimal     circles, no names, no search bar
  • Dock        a single row of nine
  • Wall        10 x 5, everything at once
  • Paper       light background, dark labels

Pick one and keep tweaking. Every slider stays where you leave it.

YOUR DATA STAYS YOURS

Icons are stored on your machine. There is no icon store and no CDN, so no
server ever learns which shortcuts you keep or watches you open a new tab.

The extension ships with no network permissions at all. Two features can reach
the internet and you start both of them by hand: fetching an icon from a site,
and importing icons from an Infinity New Tab backup. Each asks permission for
those hosts alone.

Links go exactly where they say. Nothing is routed through an affiliate
redirector.

SYNC AND BACKUP

Turn on sync and your layout, settings and icons follow you to your other
computers through the Google account Chrome is already signed into. Chrome
allows 100 KB for this, so icons are compressed to fit and the extension tells
you plainly when something will not.

For everything at full resolution there is a .json backup with no size limit.

COMING FROM INFINITY NEW TAB

Load your .infinity backup and your shortcuts, folders, pages, layout and
wallpaper all come across in one step.

Open source, MIT licensed:
https://github.com/IzzIsHOr/IzzI-Speed-Dial-Extension-for-Chrome
```

## Category

`Workflow & Planning` (Productivity in the older taxonomy).

## Language

English

---

## Permission justifications

The dashboard asks for one per permission. Vague answers get pushed back.

**`storage`**

```
Stores the user's own shortcuts, folders, pages and appearance settings so the
new tab page keeps its contents between sessions. Nothing else is stored.
```

**`unlimitedStorage`**

```
Users add their own icon images and a background image. A handful of cropped
icons plus one background photo exceeds the default 5 MB storage quota, so the
extension would start failing to save the user's own content without it.
```

**`favicon`**

```
Draws a site's icon from the browser's existing favicon cache when the user has
not set a custom icon. This reads Chrome's local cache and makes no network
request.
```

**`activeTab`**

```
The toolbar button offers to add the page you are looking at as a shortcut, so
it reads the current tab's URL and title. This happens only when the user clicks
the extension's button, and no other tab is ever read.
```

**Optional host permissions** (`<all_urls>`, `https://*.infinitynewtab.com/*`,
`https://*.inftab.com/*`)

```
Requested at runtime, never granted by default, and only for a single domain at
a time. Two user-initiated actions need it: "Grab the icon from the site", which
downloads the icon of the site whose shortcut is being edited, and importing an
Infinity New Tab backup, which fetches the user's existing icons from Infinity's
CDN because that backup format stores links rather than the images themselves.
Both are plain image downloads. Nothing is uploaded.
```

**Remote code**

```
No. All code is contained in the package.
```

**Data usage disclosures** — tick nothing. Then confirm all three:

- Not being sold to third parties
- Not being used or transferred for purposes unrelated to the item's single purpose
- Not being used or transferred to determine creditworthiness or for lending purposes

## Single purpose statement

```
Replace the new tab page with a customisable grid of the user's own shortcuts.
```

## Privacy policy URL

```
https://github.com/IzzIsHOr/IzzI-Speed-Dial-Extension-for-Chrome/blob/main/PRIVACY.md
```

---

## Assets

- **Store icon**: `icons/icon128.png`
- **Screenshots** (1280x800): `dist/shots/`
  - `01-grid.png` — the grid in use, with a folder
  - `02-themes.png` — the seven layouts
  - `03-layout.png` — grid controls
  - `04-icons.png` — icon appearance controls
  - `05-menu.png` — right-click menu
- **Small promo tile** (440x280): `dist/promo/small-promo-440x280.png`
- **Marquee promo tile** (1400x560): `dist/promo/marquee-promo-1400x560.png`

  Both are rendered from `dev/promo.html` by `node dev/promo.cjs`. The store
  refuses any image with an alpha channel and headless Chrome writes RGBA, so
  the script decodes each capture and re-encodes it as 24-bit truecolour.

The dashboard accepts up to five screenshots, so all five can go in. Put
`01-grid.png` first; it is the one shown on the listing card.

## Review notes

First submissions usually take a few days. What keeps this one straightforward:
the single purpose is easy to state, no host permissions are requested up front,
and there is no remote code or data collection to explain.
