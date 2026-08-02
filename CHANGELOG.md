# Changelog

All notable changes to Skriuw are documented here. This project loosely follows
[Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/).

From 0.26.0 onward, releases come from the v2 desktop application (`v2/`,
tagged `v2-v*`), which continues the version line the v1 desktop ended at
0.25.0. Entries up to 0.25.0 cover the v1 products.

## [0.28.0] — 2026-08-02

### Added

- **Undo for deletes:** deleting a note or folder from the sidebar shows an
  undo toast; press mod+Z or click Undo to restore it immediately. A new
  "Show toasts" setting controls confirmation toasts.

### Changed

- **Shortcut registry:** editor-bound shortcuts moved to a single registry
  with explicit route scopes, so custom bindings apply consistently in both
  rich and raw markdown modes and never fire on the wrong screen. Editor
  search shortcuts and focus handling improved; the cheat sheet reflects the
  new scopes.

## [0.27.1] — 2026-07-30

### Fixed

- **Shortcut key matching:** physical-key matching for navigation shortcuts
  now works across shifted punctuation and non-US number-row layouts.
- **Tabs:** mod+W closes an existing split before closing the active tab.

## [0.27.0] — 2026-07-29

### Added

- **Note cover images:** upload or reuse workspace media, drag to position,
  zoom, keyboard controls, nine focal presets, and full-width layout.
- **Workspace media gallery:** inline, cover, and journal references with
  metadata, filters, cleanup, and full-screen preview.
- **Cover media picker:** searchable and sortable, with current, used, and
  reused indicators.

### Changed

- Cover state persists through SQLite, archives, recovery backups, and
  content-addressed media storage.

## [0.26.0] — 2026-07-28

First release on the continued version line; identical in content to v2's
0.5.0. The renumbering keeps version-comparing package managers (apt, dnf,
winget) from resolving the legacy 0.25.0 build as newest. From this release
on, apt, dnf, AUR, Homebrew, Scoop, and winget all track v2.

### Added (since the last v1 desktop release)

- **Daily journal:** date-keyed entries, mood selector, sidebar month
  calendars, keyboard-first navigation.
- **Editor:** full formatting suite, headings 1–6, toggle headings, emoji
  picker (`:`), media embeds, drag handles, note outline.
- **Import:** Notion, Obsidian, Evernote (.enex), Joplin, Google Keep,
  Standard Notes, and more — 11 sources total.
- **Keyboard shortcuts** throughout, with a cheat sheet on mod+/.

## [0.25.0] — 2026-07-20

### Changed

- **Analytics SDK 1.7:** upgraded `@remcostoeten/analytics` from 1.5 to 1.7,
  picking up the new ingestion pipeline — offline event queue with batch
  flushing, client-side event timestamps (accurate timing for queued events),
  and browser timezone enrichment used for country-level geo fallback.

### Fixed

- **CI typecheck:** `createMarkId` in the shared domain package accessed
  `globalThis.crypto` in a way the root TypeScript config (no DOM lib) rejects;
  the global is now typed structurally so web, desktop, and mobile keep sharing
  the module unchanged.

## [0.24.0] — 2026-07-20

### Added

- **Desktop snapshot import on web:** upload a desktop snapshot ZIP under
  Settings → Data & sync → Import backup to move a local desktop workspace
  into a cloud account. Imports notes with their folder tree, journal entries
  (mood and tags included), and journal tag colors from the snapshot's vault;
  auto-detected alongside the other import formats, with the usual preview
  before anything is written. Desktop-only state (app settings, AI keys,
  search index, version history) is intentionally left out.

- **Calendar settings section:** a new "Calendar" tab in settings lists every
  journal calendar connection in one place — incoming ICS auto-import
  subscriptions (with status, last sync, pause/resume, sync now, delete, and
  new inline editing of label and import mode) and outgoing live-feed links
  (last refresh, rotate, revoke). The journal sidebar dialogs remain and now
  share the same components.

- **Living Information:** turn selected text into a typed Mark, optionally group
  it into a Thread, and see source-linked Readings with live amount, count, and
  state summaries in the note inspector. Marks are editable, removable back to
  text, use six colors, and round-trip through Skriuw Markdown metadata.
- **Tasks from prose:** selected text can now create a workspace task directly
  from editor toolbar. Task keeps source note and block IDs for traceability.
- **Complete Tasks workspace:** explicit loading/error/unsupported/empty states,
  calendar filtering, future scheduling, tags, assignees, source navigation,
  safe inline editing, and confirmed deletion.
- **Desktop vault trust:** live external-file watching, visible vault lifecycle
  status, revision-safe conflict resolution with preserved conflict copies, and
  rich-content sidecars that retain block-only structure across restarts.
- **Desktop privacy and updates:** sync credentials now live in the OS keychain,
  cloud AI requires explicit consent, missing Ollama is surfaced without a
  cloud fallback, and signed updater checks/install controls are available when
  a release endpoint and public key are configured.

### Changed

- New notes start as a quiet title and blank page, the product tour is shorter,
  and primary navigation focuses on Notes, Journal, and Tasks with secondary
  workspace views grouped under Explore.
- Automatic Mark detection is opt-in by default so ordinary prose is never
  converted into atomic semantic nodes unexpectedly.

### Release

- Unified release `0.24.0` across web, desktop, Tauri, and Cargo packages.

## [0.23.0] — 2026-07-12

### Added

- **Passkeys:** passwordless sign-in and passkey management for web and native
  mobile clients, backed by a new `passkey` database table.
- **Mobile auth refresh:** shared form primitives, clearer validation, and a
  browser-friendly Expo web entrypoint for local development.

### Release

- Unified release `0.23.0` across web, desktop, Tauri, and Cargo packages.

## [0.22.1] — 2026-07-12

### Added

- **DevTUI:** a terminal dashboard for the repo (`scripts/devtui`, Go + Bubble
  Tea) covering dev servers, build artifacts, and release inspection. Prebuilt
  `skriuw-dev` binaries for Linux and macOS (amd64 + arm64) are attached to the
  desktop release. Unix-only: it drives child processes with `setsid` and shells
  out to `bash`, so there is no Windows build.

### Fixed

- **Desktop (Linux): black window on NVIDIA.** WebKit's dmabuf renderer cannot
  allocate GBM buffers on the NVIDIA driver under X11/XWayland (`Failed to
create GBM buffer: Invalid argument`), so the window never received a valid
  frame and painted black. `0.22.0` removed the blanket
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` guard — correctly, since it had forced CPU
  compositing and capped the editor near 10fps — but verified only the Wayland
  backend. That left every X11 session broken, and every AppImage regardless of
  session: linuxdeploy's GTK hook hard-codes `GDK_BACKEND=x11` into the AppImage
  launcher, so it always runs through XWayland.

                            `main.rs` now picks per backend rather than globally. On NVIDIA it overrides
                            the AppImage's forced X11 back to Wayland, and disables the dmabuf renderer
                            only when genuinely landing on X11 — the sole path that renders there. GPU
                            compositing is kept everywhere it works, so the 0.22.0 typing-performance win
                            is retained. `SKRIUW_GDK_BACKEND` forces a specific backend.

### Release

- Unified release `0.22.1` across the web, desktop, Tauri, and Cargo packages.
  Supersedes `desktop-v0.22.0`, which was cut from an unmerged branch.

## [0.22.0] — 2026-07-12

Consolidates the `0.19.0` and `0.20.0` tags, which shipped without changelog
entries of their own. Released from a branch that never landed on `daddy`; the
work is folded into the mainline as of `0.22.1`.

### Added

- **Tasks:** a workspace task list at `/app/tasks`, backed by a new `tasks`
  table. Checklist items in a note can be promoted to a task from the block
  itself and stay linked to their source block, so a task knows the note and
  block it came from. Tasks carry status, priority, due date, tags, assignees,
  and a description. Available on desktop too — the Rust backend indexes tasks
  in local SQLite so the list works without a signed-in account.
- **Note annotation overlay:** free-hand Excalidraw drawing across a whole
  note, on a viewport canvas slaved to scroll position.
- **Drawing block:** an Excalidraw block for the editor, round-tripping through
  an `excalidraw` fence.
- **Onboarding:** a guided product tour replacing the welcome walkthrough.
- **Documentation site:** a Fumadocs site as `apps/documentation`.
- **Analytics:** PostHog integration.

### Changed

- Auth is seeded from the server (`initialAuthUser`), removing the multi-second
  session skeleton gate on first paint.
- Next.js 16.3 canary with the React Compiler, `cacheComponents`, a cookie-only
  middleware auth gate, and partial prefetching.
- The notification bell moved into the user menu popover.

### Fixed

- **Desktop (Linux):** the editor ran at roughly 10fps while typing. `main.rs`
  unconditionally set `WEBKIT_DISABLE_DMABUF_RENDERER=1` — a stale workaround
  for an NVIDIA GBM allocation failure — which dropped WebKitGTK onto the
  shared-memory compositing path, so every frame was rendered and blitted on
  the CPU and the GPU went unused entirely. The guard is removed and the dmabuf
  renderer now runs by default. `__NV_DISABLE_EXPLICIT_SYNC` is kept; it
  prevents a GTK crash on Wayland rather than a slowdown.
- Unknown and drawing blocks no longer trip the unsupported-block guard and
  crash the editor.
- A newly created note takes focus.
- Note selection is deferred past the mobile sidebar's exit animation.

### Release

- Align the unified web, desktop, Tauri, and Cargo package versions on `0.22.0`.

## [0.21.0] — 2026-07-12

### Added

- **Native mobile app:** cloud-authenticated Expo client with notes, folders,
  search, settings, theme preferences, bottom navigation, and polished sign-in.
- **Mobile journal:** daily editor, moods, tags, calendar, searchable archive,
  autosave, deletion, offline read cache, and shared cloud persistence with web.
- **Shared journal domain:** cross-platform journal contracts, mood/date helpers,
  validation, merge rules, and focused tests in `@skriuw/domain`.
- **Mobile CI:** dedicated Expo TypeScript and lint job on every push and pull
  request.

### Changed

- **Cloud synchronization:** web and mobile journals refresh every 30 seconds;
  mobile also refreshes after returning to foreground or reconnecting.
- **Desktop storage:** SQLite reads use a three-connection read-only pool while
  writes remain serialized, reducing contention for graph, tags, backlinks,
  notes, folders, journal, people, and history queries.
- **Web mobile navigation:** reworked responsive navigation and editor cursor
  state handling for more predictable touch layouts and editor focus.

### Fixed

- **Journal saves:** concurrent first saves for one date now converge on the
  active daily entry instead of failing the partial unique constraint.
- **Desktop Linux:** align GTK program name with the installed desktop entry so
  Wayland compositors display the correct taskbar icon.
- **Collaboration/editor:** improve room cleanup, cursor state propagation, and
  editor lifecycle handling.

### Release

- Unified web/cloud release `0.21.0`; mobile app advances to `0.2.0` with
  Android version code `2`.

## [0.18.1] — 2026-07-09

### Fixed

- **Docs:** the Docker self-host `curl` commands in the README pointed at a
  `master` branch that doesn't exist (default branch is `daddy`), 404ing for
  every self-host user copying the quickstart.

### Release

- Verified the Docker image builds clean (`docker build .`) and the
  entrypoint's secret validation and `prisma migrate deploy` fail-fast paths
  behave as designed. Align the unified web, desktop, Tauri, and Cargo
  package versions on `0.18.1`.

## [0.18.0] — 2026-07-09

### Added

- **Self-hosting (Docker):** the web app can now be self-hosted with a single
  `docker compose up`. Ships a `Dockerfile`, `docker-compose.yml` (bundled
  Postgres 17 with a healthcheck), a `docker-entrypoint.sh` that runs
  `prisma migrate deploy` before boot, and a `.dockerignore`.
- **Mobile UX (web):** touch-gesture suite for the notes workspace — a
  reusable `use-swipe` hook driving edge-open and navigation swipes,
  swipe-to-delete file rows, and touch drag-and-drop for tab reordering,
  plus sidebar recents and tree skeletons for a smoother perceived load on
  small screens.
- **Storage config:** new `user_storage_configs` table (Prisma migration) for
  per-user storage settings.

### Changed

- **Performance (React):** a multi-batch `react-doctor` sweep across the web
  app — memoization, render-phase state derivation, and effect-dependency
  cleanups to cut re-renders and hold 60fps while editing. Adds a
  `scripts/react-doctor-report.ts` reporter and `doctor.config.json`.

### Fixed

- **Build (Vercel):** eliminated the intermittent duplicate-copy type error by
  deduping/pinning `prosemirror-view` to a single version and forcing a clean,
  frozen-lockfile install on Vercel so the dedupe holds across builds.

### Release

- Align the unified web, desktop, Tauri, and Cargo package versions on
  `0.18.0`.

## [0.17.0] — 2026-07-06

### Changed

- **Release:** prepare the next minor release and align the unified web,
  desktop, Tauri, Cargo, and Linux packaging versions on `0.17.0`.

### Fixed

- **Tests:** update the rich-document clone error-injection coverage for the
  current `structuredClone`-first implementation so the release build pipeline
  passes cleanly.

## [0.16.1] — 2026-07-06

### Fixed

- **Desktop styling (regression):** the packaged app shipped without
  `dangerousDisableAssetCspModification`, so Tauri's build-time CSP hash
  injection voided `'unsafe-inline'` and silently blocked every
  runtime-injected `<style>` tag and inline `style=` attribute — leaving the
  formatting bubble menu unstyled, the editor with the wrong background, and
  shiki syntax highlighting dead. The fix (previously applied but never
  committed) is now in `tauri.conf.json`, and CI fails the release if it is
  ever removed.
- **Editor:** pressing Enter inside a code block now inserts a newline
  instead of splitting out of the block into a new paragraph.

## [0.16.0] — 2026-07-06

### Added

- **Import/export (desktop):** native Rust import/export pipeline — ZIP
  archive extraction and validation, batch imports with conflict resolution,
  and the export builder wired into the desktop UI.
- **Distribution:** the release pipeline now builds macOS (universal `.dmg`)
  and Windows (NSIS installer) alongside Linux, and publishes to eight
  channels: apt, dnf, AUR, Homebrew (tap-by-URL from this repo), Scoop,
  winget, Snap, and AppImage. Release notes are generated automatically by
  diffing against the previous desktop tag and grouping commits by type.

## [0.15.2] — 2026-07-03

### Fixed

- **Web editor:** stop typed text from being reverted and the cursor from
  jumping while writing. `rich_content` is a Postgres JSONB column, which
  rewrites object key order, so the note echoed back by every autosave (and
  window-focus refetch) never `JSON.stringify`-matched the editor's in-memory
  snapshot. The editor treated its own save as an external change and ran a
  full `replaceBlocks` over the live document — resetting the cursor, wiping
  keystrokes still inside the commit debounce, and re-committing in a
  perpetual save/replace loop. Snapshots are now compared with a
  key-order-insensitive stable stringify.

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
  BlockNote 0.46 runs on TipTap 3, whose `editor.view` returns a _truthy_ proxy
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

[0.21.0]: https://github.com/remcostoeten/skriuw/releases/tag/v0.21.0
[0.1.0]: https://github.com/remcostoeten/skriuw/releases/tag/desktop-v0.1.0
