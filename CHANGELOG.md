# Changelog

All notable changes to Skriuw are documented here. This project loosely follows
[Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/).

From 0.26.0 onward, releases come from the v2 desktop application (the
repository root, tagged `v2-v*`), which continues the version line the v1 desktop ended at
0.25.0. Entries up to 0.25.0 cover the v1 products.

## [Unreleased]

### Added

- **Starter database:** a fresh signed-out workspace includes a `Books` folder
  whose notes carry status, author, genre, and rating properties and open as a
  board grouped by status, so new visitors can try database views at once.

### Changed

- **Database views:** a property edit now updates the rows, filter, sort and
  board groups of the affected notes only, cutting the work after a cell edit
  in a 5,000-note view from about 4 ms to 0.5 ms.

## [0.52.0] — 2026-10-19

### Added

- **Database views:** open a folder, or every note, as a table or board over
  note properties, with in-place editing, filters, sorts, column visibility,
  and board grouping by a select or checkbox property
  ([ADR-0057](docs/adr/0057-database-views.md)). Layouts are stored per folder
  in a device-local settings extension (#545).
- **Mobile:** reference and trash screens replace the people, tags and trash
  placeholders, and trashed notes can be restored from the trash screen (#547).

### Changed

- **Interaction performance:** the shell, sidebar, metadata panel, journal
  sidebar and editor panes no longer re-render on a note switch or title edit.
  Code highlighting, annotation anchors and find-in-note rescan only the
  touched ranges, floating editor menus read from their own store, the outline
  skips edits outside headings, and the command palette caps each group at 50
  rows. A note switch settles in one React commit without forcing layout twice
  (#544).
- Desktop image, keyring and sign-out commands run off the main thread, and
  quitting waits at most two seconds for sync to stop. Unsent tail saves for
  the same note coalesce in the outbox (migration 0029, #544).
- The performance harness fails on any missed budget and counts dropped frames
  at 60 and 120 Hz. A release baseline lives in `docs/benchmarks` (#544).
- The AI menu overlaps a tall range when neither side has room, instead of
  shrinking to a scrolling sliver, and editor paragraphs lose their vertical
  margin (#547).

### Fixed

- **Phone and tablet web app:** the compact shell's tab bar and toolbar are back
  in place, the home indicator inset is no longer applied twice, hover-only
  controls (section collapse, tag and trash row actions, cover controls) show
  on touch, small icon buttons meet 44px touch targets, and settings rows wrap
  on narrow screens. The installed app precaches every build chunk, so screens
  never opened online still open offline (#546).
- The browser app moves from the Vercel deployment alias to skriuw.com (#547).
- Unsent sealed saves count as pending local document writes, so a locked
  note's edits are not mistaken for synced.
- Desktop sync connects are serialized, stale claims are released on start,
  and sync workspace access and AI history are gated while a backup restores.
- A rejection refresh keeps newer optimistic commits instead of reverting them.
- The outline rebinds when a note swaps between raw and rich mode, and AI
  output that lands outside the bounded editor window is revealed.
- Whole-note AI actions in large notes read and replace the full document, and
  a rejected commit reconciles under the commit gate (#544).

## [0.51.0] — 2026-10-12

### Added

- Images are published with shared notes, and shared notes and docs get heading
  anchors and a table of contents (#537, #536).
- The editor links bare domains with a known top-level domain (#538).
- **Math paste and macros:** pasting plain text turns `\(...\)`, `\[...\]`,
  `$...$` and `$$...$$` into math while leaving code literal. Workspace math
  macros live in settings and replicate through a `set_math_macros` operation.
  KaTeX loads mhchem for chemistry (#533).
- **Math and Tasks starter guides** show KaTeX and due dates to new users, and
  Welcome links to them (#533).

### Changed

- Settings copy lives in one module, so search still finds moved strings.
  Settings and the media preview draw a focus outline in forced-colors mode
  (#533).
- Sync Worker deploys apply D1 migrations, and the native gate runs on every
  pull request (#531, #532).

### Fixed

- Notes moved to the trash are no longer shared (#535).
- Links in shared notes and docs are visibly links (#534).
- The toast stack anchors to the visual viewport (#539).

## [0.50.0] — 2026-10-08

### Added

- **Opened files stay in sync:** opening a Markdown, MDX or text file again
  updates its note. A changed file updates an untouched note, a changed note
  is kept, and when both changed a dialog offers keep note, use file, or keep
  both. Moved files are recognised by their contents. `.txt` opens too, titles
  come from frontmatter, a leading heading or the file name, and MDX imports
  without loss (#524).
- **Account deletion** under Settings, Account & sync removes the cloud
  account, its synced workspace, shared notes and every local workspace on the
  device ([ADR-0056](docs/adr/0056-account-deletion.md), #525).
- **Clean up empty notes** moves every note with no body to the trash with one
  undo. Pinned, locked, journal, commented and parent notes are never touched
  (#525).
- A single theme picker in the palette (Space on a "Theme:" row) and a
  Command palette size setting: Default, Roomy or Large (#525).
- **Mobile:** sign in from the account sheet and sync through the native core,
  with the credential in the platform keystore (#527). Lock settings open from
  the account sheet, and tree rows gain Lock/Unlock (#526).

### Changed

- Settings search matches every row's text and shows the matching row.
  Keyboard focus is a soft fill instead of an outline, and the switch has a
  filled track (#523).
- Desktop: the splash is part of the main window, and a file opened from the
  file manager is the active note on the first frame (#525).
- The site code is reorganised into flat modules, and changelog release notes
  render with `marked` (#519, #521).

### Fixed

- Linux: the main window shows on launch, where WebKitGTK reported it visible
  while hidden (#530).

## [0.49.0] — 2026-10-03

### Added

- **Due dates and recurring tasks:** `due:` and `every:` on a checklist line
  set a date or a repeat rule, shown as chips. Checking off a repeating item
  adds the next one below it. The Tasks view groups by Overdue, Today,
  Upcoming, No date and Completed earlier. Markdown uses the Obsidian Tasks
  signifiers ([ADR-0054](docs/adr/0054-recurring-tasks-repeat-in-the-document.md),
  #499, #507).
- **Math** rendered with KaTeX, inline and as blocks, via `/math`, shortcuts or
  `$$` fences. KaTeX loads only when a note has math, and formulas are
  searchable (#503).
- **Focus mode** (`mod+shift+f`) and **typewriter scrolling**
  (`mod+shift+y`) in both editors (#504).
- **Unlinked mentions** in the Relationship Explorer, with `L` to link one or
  Link all (#500).
- **Daily journal word goal** with header progress, calendar marks and goal
  stats (#501).
- **Facehash avatars** for signed-in accounts (#505).

### Changed

- Signing in keeps you on the current page, and signing out leaves the
  account's workspace in the browser and on desktop (#478, #480).
- The workspace app is split into layered modules with enforced public APIs
  ([ADR-0055](docs/adr/0055-workspace-module-boundaries.md), #510).
- Site: the header shows the user menu and floats on scroll, the download
  button picks the visitor's OS, and the hero and changelog contrast are new
  (#477, #479, #481, #482, #483).

### Fixed

- Locking a note or folder closes it immediately (#508).
- Desktop: a saved window larger than the screen is fitted to the monitor, and
  the sync push thread no longer panics on a missing rustls CryptoProvider
  (#511).
- A task's checkbox and text stay on one line (#494), and a task ending in
  formatted text keeps its link after reopening (#499).

## [0.48.0] — 2026-09-30

### Added

- **Open Markdown files from the file manager:** Skriuw registers for `.md`,
  `.markdown` and `.mdx`. Opening a file imports it as a root note, and
  opening it again goes to that note (#502).
- **Whole-note AI edits** via "Custom instruction on note", reviewed as a line
  diff. The AI run card stays pinned while scrolling (#502).
- **Remote images on import** with an ask, download or block setting
  ([ADR-0051](docs/adr/0051-remote-images-at-import.md), #502).
- Quit can be switched off or rebound, the palette has a row density setting,
  and list arrow keys wrap (#502).
- Right-click the journal calendar for day, today, month and collapse actions
  (#502).
- Safe SVG files import as images (#502).

### Changed

- Signed-out browser visitors see a dismissible "Saved in this browser only"
  strip instead of the storage warning toast, and the sign-in reminder waits
  for a pause in typing (#502).
- Every page on skriuw.com uses the framed homepage design (#490).

### Removed

- The first-run onboarding screen. New workspaces open straight into the
  editor (#502).

### Fixed

- Image-only paragraphs, such as README badge rows, stay on one row.
- Sign-in no longer reloads the app before sync connects.

## [0.47.0] — 2026-09-27

### Added

- **Public note links:** share a note as a read-only page at
  `skriuw.com/s/<id>/`, as a frozen snapshot or following your edits. Sharing
  needs an account but not sync, and shared text is not end-to-end encrypted
  ([ADR-0052](docs/adr/0052-public-note-links.md), #496).

### Changed

- Scoop, apt and dnf channels moved to the `skriuw` GitHub organization. apt
  and dnf users switch to `https://skriuw.github.io/packages/` (#489).
- skriuw.com is a Next.js site with a changelog page, a nested feature outline
  and condensed AI docs (#475, #476, #488).

### Removed

- The reduce-motion setting, which no longer had any effect (#492).

## [0.46.1] — 2026-09-25

### Added

- **Shared Fluent icon system** with the approved animations (#438).
- Vim cursor style, blink and action feedback (#430).
- One theme registry shared across desktop, web and mobile (#429).
- The Expo mobile app: native shell, editor host, tasks, search, journal,
  locked notes with biometric unlock, sync, and the UniFFI bridge to the Rust
  core (#399 to #437).

### Changed

- The repository is reorganized into apps, packages and services, TypeScript
  is gated by Oxlint and oxfmt, and Vitest runs from one root `__tests__`
  mirror (#439, #440, #470).
- Releases are cut by a workflow with generated notes and a native boot gate
  (#465, #466).

### Fixed

- Sync stays on while signed in (#474), accepts current archive versions in
  cloud checkpoints (#469), and reports the service's rejection code (#467).
- Locked notes relock when the tab is hidden and after a frozen idle timer
  (#471, #464).
- PWA media works on iPhone, including older iOS Safari (#468, #473).
- Sidebar focus, palette position and two-line toasts (#431), and React is
  pinned into one vendor chunk (#427).

## [0.46.0] — 2026-09-19

### Added

- **One local workspace per cloud account:** a second account on the same
  install opens its own workspace, and switching back is lossless
  ([ADR-0046](docs/adr/0046-per-account-local-workspaces.md), #378).
- **Phone shell behaves like an app:** the back gesture closes the top sheet
  or dialog, dialogs stay above the keyboard and pull down to close, toasts
  swipe away, and an install strip sits above the tab bar
  ([ADR-0047](docs/adr/0047-compact-shell-owns-back-and-install.md), #380, #381).
- **Journal quick capture:** home-screen shortcuts and a share target in the
  installed browser build, plus a 30-day mood trend strip (#379).

### Changed

- The settings sidebar is grouped into sections (#377).
- Touch targets grow to 44px across the toolbar, search, toasts and dialogs
  (#379).

## [0.45.0] — 2026-09-18

### Added

- **End-to-end encrypted sync:** titles, bodies, tags, properties, tasks,
  media and operation types are sealed on the device. Keys derive from a
  recovery code shown once
  ([ADR-0043](docs/adr/0043-end-to-end-encrypted-sync.md), #363).
- **Locked notes** behind a workspace PIN or passphrase with a one-time
  recovery code, encrypted at rest and kept out of search, tasks, references,
  history and archives. Migration 0027
  ([ADR-0044](docs/adr/0044-locked-notes.md), #373).
- **Modal Vim editing** in the rendered and raw Markdown editors, with
  jump-to-line counting wrapped rows
  ([ADR-0042](docs/adr/0042-modal-vim-editing.md), #367, #372).
- **Rendered Mermaid fences** for sequence, state, class and ER diagrams
  ([ADR-0045](docs/adr/0045-rendered-mermaid-fences.md), #374), and an **AI
  Diagram** action (#375).
- **Full-text content search** over prose with SQLite FTS5, ranked and
  highlighted ([ADR-0041](docs/adr/0041-full-text-search-index.md), #362).
- **Installable browser build** with a compact touch shell, edge drawers and
  tab overflow ([ADR-0040](docs/adr/0040-installable-browser-shell.md), #366,
  #368).
- **Journal:** daily templates, On this day, a phone day view, week, month and
  year steps, and a Go to date dialog (#370, #376).
- **History:** side-by-side diff (#371) and a revision scrubber (#368).
- Cover gradients and per-asset reveal in the media library (#361).
- A splash until first paint and single-instance launch (#368).

### Fixed

- The shortcut recorder commits new bindings (#371).
- Brand icon resolution, a roomier command palette and an inline empty-trash
  confirmation (#360).

## [0.44.0] — 2026-09-09

### Added

- **AI runs as visible work:** an anchored, non-modal AI menu steered from the
  note, with staged run progress in a single card (#358).
- **Voice dictation** behind a provider-agnostic transcription seam (#339).
- **Personal note templates and saved searches**, plus hermetic browser test
  harnesses (#353).
- **Named media with bulk delete** and a block gutter setting (#356).
- **Shared Checkbox and Radio controls**; double-clicking the title bar
  maximizes the window.
- **Focused marketing routes** on the web site (#338).

### Changed

- The bubble menu's exclusive choices are grouped behind three triggers,
  cutting 21 toolbar controls to 10 (#359).
- Transcription and completion now come from the extracted AI SDK (#357).
- Version history pairs edited lines by similarity and can expand hidden
  context (#351).

### Fixed

- The browser runtime offers a workspace reset when the database cannot open
  (#355).

## [0.43.0] — 2026-09-05

### Added

- **Automatic sync convergence:** sessions reconcile without manual
  intervention, with explicit session lifecycle and bounded cloud writes.

## [0.42.0] — 2026-08-31

### Added

- **Whole-note ink annotation layer:** pen, highlighter, line, rectangle,
  ellipse, eraser, and select/move tools over the note surface, versioned on
  the document root (#336).
- **Sidebar pinned chips**, save-failure recovery, and a sync epoch purge
  (#352).
- **Conflict review UI** on top of base-proof sync reconciliation, fetched AI
  model catalogues, and revision stats (#340).
- **Canonical Skriuw landing page** with social preview metadata (#337).
- Annotation threads gained hover previews, Tab-to-reply, and a
  keyboard-operable popover.
- The browser runtime allows multiple tabs, and the store reopens the last
  note across a reload.

### Changed

- Version history pairs edited lines by similarity and expands hidden context
  (#350).
- Animated icons resolve through one keyed module.

### Fixed

- Checklist tasks promote in the same transaction as their save.
- Stacked code blocks get a real gap.

## [0.41.0] — 2026-08-23

### Added

- **Syntax highlighting in raw Markdown mode.**
- README demo GIF, architecture sketch, and measured performance numbers.

### Fixed

- Dialogs focus their first control when they open.

## [0.40.0] — 2026-08-22

### Added

- **Inline comment threads on text selections:** anchored by a document mark,
  painted from a decoration plugin, listed and navigable from the inspector,
  and persisted as a synced entity (#334).
- **In-app link browser:** links open in Skriuw's own browser window (#335).

### Fixed

- Dialogs and shortcut hosts stay outside the inert workspace.
- Production auth and favicon restored on the hosted build.

## [0.39.0] — 2026-08-18

### Added

- **AI editor actions with preview streaming** (#322).
- **Extract-tasks and suggest-tags** built-in prompts (#322).
- **Run history and token usage** recorded at the AI seam (#321).
- **Base prompts library** (#320).

### Fixed

- The email provider no longer leaks account existence (#332).

## [0.38.0] — 2026-08-18

### Added

- **Prompt playground** surface for iterating on prompts (#319, #333).
- **Default model selection and a quick switcher** (#318).

## [0.37.0] — 2026-08-17

### Added

- **Remote provider BYOK** for Gemini and Groq (#317), an **opt-in Ollama
  local runtime** (#316), and the structural **AI opt-in gate** (#329, #331).
- An Ollama stop control and a curated model catalogue; remote completions are
  gated on that catalogue.
- The stored empty-note prompt is searchable from settings.

### Changed

- Toasts moved onto `@remcostoeten/notifier`.

### Fixed

- Caret and focus behaviour on blur and rename.
- Key revocation works without a system keyring.
- The AI surface is hidden in the browser runtime.

## [0.36.0] — 2026-08-17

Superseded by 0.37.0 on the same day; no separate artifacts were published.

## [0.35.0] — 2026-08-16

### Added

- **First-class tasks, a relationship explorer, and a unified editor overlay.**
- A hardened local relationship graph (#311) with honest selectors and empty
  sections hidden entirely.

### Fixed

- A second browser tab reports as already-open instead of as a corrupt
  database (#313).

## [0.34.0] — 2026-08-15

### Added

- **Shell chrome and shortcut polish round.**
- Signing into an empty account adopts the starter preview workspace.

## [0.33.0] — 2026-08-14

### Added

- **Real-time sync wake channel** over hibernatable Durable Object WebSockets.

## [0.32.2] — 2026-08-13

### Fixed

- winget submissions use the MSI, so komac stops aborting on the NSIS WebView2
  branch.

## [0.32.1] — 2026-08-12

### Fixed

- Migration 0013's shipped bytes restored and migration checksums pinned.
- Documentation build survives the root `.vercelignore`, declares its Tailwind
  dependencies, and follows the repo root after the `v1/` move.

## [0.32.0] — 2026-08-12

### Changed

- **v2 is now the repository root** and the frozen v1 product line moved into
  `v1/` (#310). The renderer and `src-tauri` are restructured by feature
  (#308), and the root was tidied after the move (#309).

### Added

- **Version diff view** plus polish across the history and reference surfaces.
- **Animated app icon system** with a toggle setting.
- Remote cover images download through the desktop shell.

## [0.31.0] — 2026-08-10

### Added

- A seeded preview workspace, revealed after first paint.

## [0.30.0] — 2026-08-10

### Added

- **Hosted app, account sync, and stored media.**
- **Local-first onboarding.**

## [0.29.0] — 2026-08-07

### Added

- **Cloud sync:** convergence, content transport, browser runtime, and
  recovery (#306), including the WASM worker boundary and OPFS capability
  probing.
- **Note templates** with a keyboard-first picker (#307).
- **Accessible embedded diagrams** (#301).

### Changed

- Durability, scalability, and portability gates hardened (#300).
- v1 CI, legacy desktop release automation, one-off codemods, and stale docs
  removed; the collaboration worker moved from `party/` to `apps/collab`.

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

- Unified apps/site/cloud release `0.21.0`; mobile app advances to `0.2.0` with
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
