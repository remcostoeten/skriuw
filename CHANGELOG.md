# Changelog

All notable changes to Skriuw are documented here. This project loosely follows
[Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/).

## [0.15.1] — 2026-07-03

### Fixed
- **Code block:** stop the editor from spewing repeating `TypeScript (typescript)`
  lines on every save/reload. The `procode` block spec had no `toExternalHTML`,
  so markdown serialization leaked the block's language `<select>` chrome into
  the stored markdown; on reload that text was parsed into real paragraphs which
  persisted and re-leaked, accumulating garbage. The block now serializes to a
  clean fenced `<pre><code class="language-*">` like the other custom blocks.

## [0.13.2] — 2026-06-30

### Fixed
- **Note editor:** stop the TipTap "`Cannot access view['dom']`" error that
  fired when the editor was read before its ProseMirror view had mounted.
  BlockNote 0.46 runs on TipTap 3, whose `editor.view` returns a *truthy* proxy
  until mount, so the existing `?.` / `if (!view)` guards never caught it. The
  editor now reads the real view object (genuinely `null` before mount) and
  tracks the live DOM across mount/unmount — which also repairs link-click,
  title-commit, and selection-reporting listeners that could silently fail to
  attach right after mount.

## [0.13.1] — 2026-06-30

### Fixed
- **Desktop startup:** the Tauri build no longer crashes while creating the
  auth client from the `tauri://localhost` origin, which left the app stuck on
  the splash screen.

## [0.13.0] — 2026-06-29

Editor-heavy release: typed note properties, a redesigned inline tag flow with
@user mentions, an optional Vim mode, a tabbed note workspace, and journal entry
titles — plus the first Linux distribution channels (apt + AUR) so the desktop
app is installable, not just downloadable.

### Added
- **Note properties.** Typed key/value metadata on notes, with editor UI,
  domain model, validation, and a Postgres migration.
- **Inline @user mentions** and a **redesigned inline tag flow** in the
  editor. (#163)
- **Optional Vim mode** for the note editor. (#170)
- **Tabbed note workspace.** Editor tabs with per-pane tab bars. (#151)
- **Journal entry titles**, with a Postgres migration and sidebar updates.
- **Linux install channels.** Self-hosted apt repository (Debian/Ubuntu) on
  GitHub Pages and an AUR `skriuw-bin` package (Arch), both published from a
  desktop release. (#149, #156)

### Fixed
- **Editor context menu** no longer opens and instantly closes on right
  click. (#168)
- **Bubble menu link actions** no longer break internal navigation or external
  URL entry. (#167)
- Reworked overlay motion across shared UI primitives (context menu, dialog,
  dropdown, popover, select, sheet, tooltip).

## [0.11.0] — 2026-06-29

Account-management, search, and command-palette release on top of the unified
`0.1.0` baseline. Adds OAuth account linking and username changes in settings,
a rebuilt command palette, an in-note search widget, deterministic avatars, and
a codebase-wide TypeScript consistency pass — plus desktop and accessibility
fixes.

### Added
- **Rebuilt command palette UI.** (#165)
- **In-note search widget** for finding text within the current note. (#166)
- **OAuth connect / disconnect in Settings → Security.** New connected-accounts
  panel lists GitHub/Google with connection status; connecting links a provider
  via Better Auth `linkSocial`, and disconnecting is guarded so it refuses to
  remove the last remaining login method. (#161, closes #143)
- **Change your username from settings**, with shared inline format validation
  (letters, numbers, underscores, dots; 3–30 chars) before save and a clear
  "already taken" message on uniqueness conflicts. (#160, #142)
- **Deterministic avatar color** assigned at signup and reused on every avatar
  surface, with a stable id-derived fallback for existing rows. (#162)
- **Desktop: zoom option** to scale the app UI.
- Smooth search-toggle transition in the aside top bar. (#157)

### Fixed
- **Block duplicate email registration** when an OAuth-provided email already
  maps to an account. (#161, closes #143)
- **Desktop: gate the note-history sidebar by backend capability** so it only
  shows where versioning is supported. (#159)
- **a11y: keyboard-accessible "manage sections" popup.** (#158, closes #152)
- **Desktop: only disable the DMABUF renderer on Wayland**, restoring hardware
  rendering on X11/NVIDIA.
- **CI: green test suite** and unified package version.

### Internal
- **Codebase-wide TypeScript consistency pass** across `apps/web`: all 36
  `interface` declarations converted to `type` aliases (`extends` → intersection),
  single-type prop files renamed to `Props`, and JSDoc added to the AI-service
  and note domain types. (#169, closes #144)

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
