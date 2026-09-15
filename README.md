# IzzI Speed Dial

A new tab page that shows your own shortcuts as a grid of icons.

Drag them around, drop one on another to make a folder, spread them over
several pages. Give each one whatever icon you like and crop it yourself.

Everything is stored on your machine. No tracking, no icon CDN, no affiliate
links.

<a href="https://buymeacoffee.com/izzishor">☕ Buy me a coffee</a> if it saved
you some clicking.

---

## Install

Grab the zip from [Releases](https://github.com/IzzIsHOr/IzzI-Speed-Dial-Extension-for-Chrome/releases),
unzip it somewhere, then:

1. Open `chrome://extensions`
2. Turn on **Developer mode**, top right
3. **Load unpacked**, and pick the unzipped folder
4. Open a new tab

Chrome shows a "Disable developer mode extensions" bubble on startup for
anything installed this way. Dismiss it; the extension stays.

## Coming from Infinity New Tab

Export a backup from Infinity, then load that `.infinity` file under
**Settings → Sync & backup**. Your shortcuts, folders, pages, layout and
wallpaper all come across in one step.

Infinity keeps its icon artwork on its own CDN rather than in the backup file,
so the icons have to be fetched from there once. The import asks first, and
Chrome asks you to allow that one host. Decline and everything still imports,
using the browser's favicons instead.

## What you get

- Drag & drop, folders, and as many pages as you need
- Icons from a file, a drag, a paste, the browser's favicon, or just a letter
  on a colour — with a square crop before saving
- Seven layouts, from a single dock row to a 10×5 wall
- A search bar with eight engines and no live suggestions
- Sync through your own Google account
- A `.json` backup that holds everything

Right-click an icon to edit it. Right-click a page dot to rename the page.
Drag one icon onto another and hold for about a second to make a folder.

## Sync, and its limits

Chrome allows extensions **100 KB** of sync storage. That is Chrome's rule, not
a choice made here.

Layout, settings and small icons fit. Your background image and the
full-resolution icons stay on this computer. When icons will not fit, they are
compressed to try, and the extension tells you which ones were left out.

Letter-and-colour icons cost about 40 bytes each, so a page built from those
syncs no matter how many you have.

**Sync does not cross browsers.** Chrome syncs through your Google account and
Edge through your Microsoft one, so the same extension on both never sees its
own data. Use the `.json` backup to move between them.

## Export a backup

**Settings → Sync & backup → Export.** It is the only copy that survives an
extension ID change, which happens when you move from a local install to the
store version. Worth doing once, now.

## What it does not do

Infinity New Tab routes its default shortcuts through affiliate redirectors,
loads every icon from its own servers, and keeps your layout on an account you
do not control. This does none of that.

It also ships with **no network permissions**. Two features can reach the
internet and you start both by hand: grabbing an icon from a site, and
importing icons from an Infinity backup. Each asks permission for those hosts
alone.

## Development

`dev/` and `dev-preview.html` are not part of the extension. They fake the
`chrome.*` APIs so the page opens in an ordinary browser.

```bash
node dev/server.cjs     # then http://localhost:5177
node dev/build.cjs      # the zip, into dist/
node dev/make-icons.cjs # the icons
```

## Licence

MIT.
