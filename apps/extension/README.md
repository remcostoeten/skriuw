# Skriuw Web Clipper

A Manifest V3 Chrome extension that saves web pages, articles, and selections into Skriuw via the writable capture API.

## How it works

```
Popup / context menu / Ctrl+Shift+S
        │  chrome.scripting.executeScript(extractInPage)
        ▼
Extracted { title, url, markdown, tags, byline }
        │  POST /api/sync/capture  (Authorization: Bearer <sync token>)
        ▼
Skriuw  →  createNoteForUser(userId, { name, content, tags, parentId })
```

- **Auth** — a write-scoped Skriuw sync token (`skriuw_sync_…`), pasted into the options page and stored in `chrome.storage.local`. No cookies, so it works cross-origin from `chrome-extension://`.
- **Extraction** runs in the page (never the service worker), serializing headings, paragraphs, lists, blockquotes, code blocks, links, and image URLs into Markdown.
- **Organization** — the popup can save to the workspace root or an existing folder from `GET /api/sync/folders`.
- **Reliability** — the actual `fetch` runs in the background service worker; failed/offline saves go to a `chrome.storage` queue and retry via a `chrome.alarms` tick with exponential backoff and an `Idempotency-Key`.
- **Activity** — successful and failed sync operations are recorded in `sync_events` and shown in the popup's recent sync list.

## Setup

```bash
cd apps/extension
bun install
bun run dev        # loads unpacked with HMR (dist/ in chrome://extensions)
bun run build      # production bundle → dist/
bun run zip        # build + package skriuw-extension-v<version>.zip
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → select `apps/extension/dist`.

In Skriuw: **Settings → Data & sync → Extension & desktop → create a Capture/write key**, copy it, and paste it into the extension's options page (opens on first click, or right-click the toolbar icon → Options).

## Server contract

`POST /api/sync/capture` (`apps/web/src/app/api/sync/capture/route.ts`)

```jsonc
// Authorization: Bearer skriuw_sync_...
{
	"url": "https://example.com/article",
	"title": "The Title", // optional; derived from hostname if absent
	"markdown": "# ...\n\nbody", // required
	"selection": false,
	"tags": ["reading"], // optional
	"parentId": null, // optional folder id
	"source": "chrome-extension",
}
// 201 → { id, name, path }
```

The endpoint authenticates with the `sync:write` scope, derives BlockNote rich content server-side (`markdownToRichDocument`), and creates the note through the shared `createNoteForUser` core — the exact same path the in-app editor uses.

## Release notes

- Version is single-sourced from `apps/extension/package.json` and rendered in the popup/options footer.
- Manifest icons are real Skriuw assets at 16, 48, and 128 px.
- Chrome MV3 is the production target. Firefox/Safari packaging should be done as separate manifests because permissions, background workers, and store requirements diverge.
