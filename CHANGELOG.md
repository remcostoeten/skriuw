# Changelog

All notable changes to Skriuw are documented here. This project loosely follows
[Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — 2026-06-29

First unified release across the web app and the desktop app, sharing a single
version number going forward. A large feature set: a full native desktop app,
real-time collaboration, multi-provider AI, a knowledge graph, and a ground-up
rebuild of the editor's formatting toolbar, plus extensive performance and
hardening work accumulated during the preview builds.

### Desktop app (new)
- Native **Tauri 2 desktop build** (`apps/desktop`) running the shared SPA (`packages/web-spa`).
- **Markdown vault** as the live local backend — notes are real `.md` files (hybrid: SQLite is a derived index for search/backlinks).
- **Native full-text search** via SQLite FTS5; backlinks resolved through indexed SQL instead of O(n) scans.
- Native foundation: filesystem, dialogs, window-state, and app menu.
- **Local backup / restore / export** plus vault-directory controls.
- **Cloud → desktop filesystem sync.**
- Linux release pipeline producing `.deb`, `.rpm`, and `.AppImage`.

### Real-time collaboration (new)
- **Yjs-based collaborative editing** wired into the BlockNote editor.
- **Anchored comments** engine.
- Live **presence** in the editor with a fail-closed read-only gate.
- Realtime backend migrated to **Cloudflare** (partyserver / y-partyserver) with HMAC room auth.
- Collaboration invites via the Better Auth **username** plugin.

### AI
- **Multi-provider** support: Groq, Google Gemini, and local **Ollama** (one-click install + model pull).
- Bring-your-own-key with multi-key rate-limit fallback and a connection test.
- Editor AI actions: spell check, continue writing, generate title.

### Editor
- **Rebuilt formatting bubble menu** as a self-contained component with plain controls wired directly to the editor commands, replacing the previous toolbar layer that didn't reliably respond to clicks.
- Block specs, MDX / Raw mode, font and line-height controls, rich-text expansion.
- Note links and tags rendered as inline chips.

### Notes & navigation
- **Knowledge graph / spiderweb** view (demo-viewable for guests; hover highlight + auto-fit).
- Content-aware sidebar search; right sidebar with tags and backlinks.
- Note **version history** and preview flow.
- Tree sort order, sidebar UX, and animated sidebar + metadata aside.
- **Local-first instant navigation** — IndexedDB cache persistence, warmup, prefetch, and off-keystroke serialization.

### Journal
- Journal / calendar layout, recents, preloader, and sync refinements.

### Sharing & import/export
- **Skriuw ZIP import/export** with merge-only restore and integrity checks.
- Importers for **Obsidian, Apple Notes, Bear, and Notion**.
- Note sharing with share links, statistics, and mobile-friendly send.

### Settings, auth & admin
- Full **settings page** (profile, auth preferences, data export).
- Google OAuth, per-request Better Auth base URL, and numerous auth hardening fixes.
- Admin shell and **seed bundle** editor (`/admin/seed`) for starter content.
- **Keyboard shortcut** system with full handler wiring.

### Performance & reliability
- Local-first caching and render-churn reductions for near-instant note open.
- Security/IDOR hardening on upserts and debounced-save race fixes.
- Monorepo restructure (Next.js app moved to `apps/web`, shared `packages/web-spa`).

[0.1.0]: https://github.com/remcostoeten/skriuw/releases/tag/desktop-v0.1.0
