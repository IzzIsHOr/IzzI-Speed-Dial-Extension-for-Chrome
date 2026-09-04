# Privacy policy

**IzzI Speed Dial does not collect, transmit, or sell any personal data.**

There is no server, no account, no analytics, no telemetry, and no install or
uninstall ping.

## What is stored, and where

Everything the extension keeps lives in your own browser:

| What | Where | Leaves your machine? |
|---|---|---|
| Shortcuts, folders, pages | `chrome.storage.local` | No |
| Appearance settings | `chrome.storage.local` | No |
| Icons you upload or crop | `chrome.storage.local` | No |
| Background image | `chrome.storage.local` | No |

If you switch on **Sync**, a compressed copy of your shortcuts, settings and
small icons is written to `chrome.storage.sync`. That is Chrome's own sync,
tied to the Google account you are already signed into. It goes to Google, not
to us, exactly like your bookmarks do. Background images and full-resolution
icons never leave the machine. Sync can be turned off, and the copy deleted, in
Settings.

## Network access

The extension declares **no host permissions by default**. It cannot reach any
website unless you grant access for a specific one, which it asks for at the
moment you use one of these two features:

1. **"Grab the icon from the site"** — downloads the icon from the site whose
   shortcut you are editing. Permission is requested for that one domain.
2. **Importing from an Infinity New Tab backup** — Infinity stores its icon
   artwork on its own CDN rather than in the backup file, so recovering those
   icons means fetching them once. Permission is requested for those hosts
   only. You can decline and everything still imports, using browser favicons.

In both cases the request is a plain download of an image. Nothing is uploaded
and nothing about you is sent.

Favicons are read from Chrome's own local cache through the `favicon`
permission, which involves no network request at all.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Saving your shortcuts and settings |
| `unlimitedStorage` | Icons and a background image exceed the default 5 MB quota |
| `favicon` | Drawing site icons from the browser's local cache |
| `activeTab` | The toolbar button reads the current tab's address and title so it can be added as a shortcut, only when you click that button |

## Third parties

None. No SDKs, no trackers, no ad networks, no affiliate redirects. Links you
save open exactly the address you saved.

## Source

The full source is public and MIT licensed:
https://github.com/IzzIsHOr/IzzI-Speed-Dial-Extension-for-Chrome

## Contact

Open an issue on the repository above.
