# Product scope: standalone v1

Last reviewed: 2026-07-22

## Purpose

This document audits every meaningful feature of the original Skriuw repository
(`~/dev/skriuw`) against the standalone rebuild and classifies each one as
**standalone v1**, **post-v1**, or **excluded**. It is the product-scope
companion to `ARCHITECTURE.md`, `docs/roadmap.md`, ADR-0013 (settings and
metadata surface), and ADR-0020 (UI architecture).

Evidence sources:

- Original repository: `apps/web/src/{features,domain,core}`, `apps/{desktop,mobile,extension,documentation}`, `packages/{domain,web-spa}`, README.
- Rebuild: `TODO.md`, `docs/handoff.md`, `ARCHITECTURE.md`, `docs/roadmap.md`, `docs/performance-contract.md`, ADR-0001 through ADR-0020, and `app/src`.

## Scope rules

The intended v1 is: fast local notes and folders, structured Markdown editing,
search, trash, history, command palette, shortcuts, settings, import/export,
backup, and recovery.

Journal, people, tags, AI, sharing, collaboration, authentication, sync, tasks,
activity, tabs, split view, diagrams, mobile, and hosted-cloud features are
excluded unless repository evidence shows one is essential to the core writing
workflow. The audit found no such evidence: the rebuild's completed MVP slices
(`docs/handoff.md`) demonstrate the full create → organize → write → search →
restore workflow with none of the excluded features present, and ADR-0013
already replaced the only structural coupling (tab continuity) with
`rememberLastNote`. No excluded feature is promoted.

Classification criteria per feature: user value, rationale, dependencies,
storage/domain implications, performance risk against
`docs/performance-contract.md`, and measurable acceptance criteria.

---

## Standalone v1

### Notes and folders (create, rename, nest, move, reorder)

- Original: `features/notes`, `domain/notes`, `domain/folders`, sidebar tree with nesting and drag reorder.
- Value: the core object model; everything else hangs off it.
- Rationale: explicitly in the intended v1; backend (`workspace_nodes`, semantic rank placement, ADR-0010) and most of the sidebar UI are already shipped.
- Dependencies: renderer store, backend rank allocation, ADR-0009 trash semantics.
- Storage/domain: `workspace_nodes` + `documents`; no new tables.
- Performance risk: low. Tree virtualization spike holds P95 < 8 ms at 5,000 nodes; extreme-depth indentation still needs a clamp policy.
- Acceptance: create/rename/move/reorder/nest via keyboard and context menu with no IPC before paint; sibling reorder and cross-folder move both work (Alt+Arrow ships today; drag-and-drop and cross-folder move are the open gap in `TODO.md`); 5,000-node workspace stays within the tree budgets; rank acknowledgements reconcile optimistic state without visible reorder flicker.

### Structured Markdown editor with inline rendering

- Original: BlockNote rich-text editor with Markdown shortcuts (`features/editor`).
- Value: the writing surface itself.
- Rationale: intended v1. Rebuild selected direct ProseMirror by measurement (ADR-0020); whole-document path ships first, bounded 192-block window is the validated large-note fallback.
- Dependencies: persistent editor host, canonical ProseMirror JSON in `documents`, undo policy (500 ms grouping, 200-entry cap by ADR-0020 fiat).
- Storage/domain: canonical structured document plus Markdown projection; already implemented.
- Performance risk: medium. Whole-document swap is marginal at 500 blocks; the fallback threshold and its wiring are unresolved (see decisions).
- Acceptance: headings, lists, quotes, code, rules, links, emphasis, inline code render structurally; Markdown input rules work; keystroke-to-paint P95 < 8 ms; zero editor remounts across 100 note switches; undo groups per policy.

### Slash-command menu

- Original: `keyboard-accessible-slash-menu.tsx`.
- Value: fast block insertion without leaving the keyboard.
- Rationale: shipped in the rebuild already; part of structured editing.
- Dependencies: editor plugin state (already in the product schema plugin set).
- Storage/domain: none.
- Performance risk: low.
- Acceptance: `/` opens a keyboard-navigable menu covering every schema block; open/filter stays under the palette budget; Escape restores editor state.

### Find in note (editor search)

- Original: `features/editor/components/search-widget.tsx`.
- Value: locating text inside the open note; baseline editor capability.
- Rationale: ADR-0020 names whole-note find as required product work against the canonical document (bounded rendering makes DOM-only find incorrect).
- Dependencies: canonical document access outside the rendered window.
- Storage/domain: none.
- Performance risk: low for whole-document notes; must search canonical blocks, not the DOM, once the bounded fallback is active.
- Acceptance: find matches across the entire note including off-window blocks; next/previous navigation moves selection and scroll; no Markdown parse during matching.

### Workspace search (full text)

- Original: `domain/notes/search-query.ts`, `search-snippet.ts`, quick switcher.
- Value: retrieval across the workspace.
- Rationale: intended v1; FTS5 projection, deleted-note exclusion, and CLI search already exist; the palette exposes full-text "Content" items.
- Dependencies: FTS projection, command palette host.
- Storage/domain: `documents_fts` (rebuildable); already implemented.
- Performance risk: low-medium. Queries are async by design; typing in the palette must never block the frame, and trashed subtrees must stay excluded.
- Acceptance: title and content search from the palette; inherited-trash exclusion holds; results render snippets; continuous typing during search updates drops zero frames.

### Trash (subtree trash, restore, purge, dedicated view)

- Original: `domain/trash`, trash components.
- Value: safe deletion and recovery.
- Rationale: intended v1; fully shipped (ADR-0009, dedicated `#/trash` route, retention-guarded purge).
- Dependencies: none open.
- Storage/domain: inherited trash markers; purge removes nodes, documents, FTS, history cache, and outbox atomically.
- Performance risk: low; 5,000-item trash mounts ≤ 22 rows.
- Acceptance: already met per `docs/handoff.md` — keep the existing regressions green.

### Version history (view, preview, restore)

- Original: `use-note-versions.ts`, `use-restore-note-version.ts`, `version-preview-container.tsx`.
- Value: recovering earlier content; trust in the tool.
- Rationale: intended v1; Git materializer, history cache, drain thread, read command, preview dialog, and restore-as-save all ship.
- Dependencies: background history drain; history stays off navigation paths (ADR-0005/0006/0018).
- Storage/domain: `history_outbox`, `history_cache`, hidden Git repository.
- Performance risk: low by construction; version Markdown loads only on open.
- Acceptance: version list renders from hydrated headers with zero IPC; opening a version is the only parse/IPC; restore lands as a normal acknowledged save. Known gap: headers refresh only on bootstrap — resolve the freshness decision below.

### Command palette and command registry

- Original: `core/commands` registry + provider.
- Value: keyboard-first discovery and execution of every action.
- Rationale: intended v1; typed registry in `app/src/commands/` is the single source for palette and shortcuts.
- Dependencies: renderer store predicates; parameterized commands (target-node channel) remain open for context-menu parity.
- Storage/domain: none.
- Performance risk: low; palette open P95 < 8 ms; 10,000-entry fixture in the contract.
- Acceptance: every registered action reachable from the palette on every route; open/filter within budget; duplicate ids and shortcut claims fail at registration (already tested).

### Keyboard shortcuts with user rebinding

- Original: `core/shortcuts` (registry, scopes, storage).
- Value: dense keyboard-first navigation, the product's identity.
- Rationale: intended v1; `SHORTCUT_DEFINITIONS`, settings override path, conflict rejection, and suspension inside modals all ship.
- Dependencies: settings document (shortcut overrides ride in it).
- Storage/domain: overrides persist in the version-1 settings document.
- Performance risk: none.
- Acceptance: every binding flows through definitions + override path; rebind/reset with conflict rejection; unknown shortcut extension data survives mutation (already tested).

### User settings

- Original: `features/settings` (large surface, most of it excluded per ADR-0013).
- Value: appearance, editor, continuity, and data control.
- Rationale: intended v1 at the reduced ADR-0013 surface; dialog, persistence, and all renderer consumers ship.
- Dependencies: none open.
- Storage/domain: one versioned settings document with lossless unknown-field extensions.
- Performance risk: none; consumers are renderer-local.
- Acceptance: already met — every offered setting has a consuming surface; unsupported identifiers project to defaults without rewriting stored values.

### Import and export (workspace archive)

- Original: `domain/data-transfer` (export build, parse, merge, integrity, clear).
- Value: data ownership and migration between runtimes.
- Rationale: intended v1; `WorkspaceArchive` with transactional replace import, safety backup, and golden compatibility fixtures ships (ADR-0007/0019). v1 scope is the archive format only; third-party importers are post-v1.
- Dependencies: a desktop UI entry point (the Data settings section exists; verify it exposes export/import, not only CLI).
- Storage/domain: versioned archive; canonical state only; projections rebuilt locally.
- Performance risk: import is a blocking maintenance operation (1.96 s at 5,000 notes) and scales worse than linearly — acceptable off the interaction path, but the UI must present it as an explicit operation, not ambient work.
- Acceptance: export → import round trip preserves nodes, documents, settings, extensions, and inherited trash; import validates fully before mutation; failure leaves the workspace untouched; both flows reachable from the UI, not only the CLI.

### Backup and recovery

- Original: no real equivalent (server database ownership); desktop snapshot adapter existed.
- Value: local-first durability — the standalone app is the database owner, so this is v1-essential even though the original mostly lacked it.
- Rationale: intended v1; verified online backup, scheduled rotation, manifests, restore, and live swap all ship (ADR-0008/0015/0017).
- Dependencies: desktop recovery UI and rollback-retention presentation (open in `docs/roadmap.md`); a timer owner for the six-hour cadence.
- Storage/domain: separate native artifact; never the web interchange format.
- Performance risk: backup runs off interaction paths; live swap requires runtime shutdown and must stay an explicit user operation.
- Acceptance: scheduled rotation fires in the running app at the default cadence; restore-and-swap reachable from the UI with rollback surfaced; failure states presented without path leakage.

### Persistent shell, routes, theming, keyboard-first navigation

- Original: `features/layout`, themes, dense desktop shell.
- Value: the frame everything renders in.
- Rationale: intended v1; shell, icon rail, `#/trash`, focus regions, and theme application ship.
- Dependencies: none open.
- Storage/domain: durable UI state limited to ADR-0013's ownership table (active note; sidebar expansion pending as a native-only operation).
- Performance risk: governed by the hard invariants — no post-startup loading UI, no lazy chunks.
- Acceptance: `docs/performance-contract.md` hard invariants plus the deferred fixed-runner proof: 100 cached note switches, zero dropped frames, on reference hardware.

---

## Post-v1

Ordered here by theme; the priority order is at the end.

### Drag-and-drop tree reorder and cross-folder move

- Original: `note-drag.ts`, sidebar drag targets. Keyboard reorder ships in v1; pointer drag is the post-v1 completion. Value: direct manipulation for mouse users. Dependencies: virtualized tree drop targets. Storage: existing placement operations. Risk: medium (drag over a virtualized tree must not force broad renders). Acceptance: drag between folders and across scroll boundaries with the same acknowledgement reconciliation as keyboard moves.

### Third-party importers (Obsidian, Notion, Bear, Apple Notes, Simplenote, Markdown vault)

- Original: `domain/data-transfer/adapters/*`. Value: migration from other tools; a major adoption lever. Rationale: not needed for the core workflow; each adapter needs its own fixtures and mapping decisions. Dependencies: archive import path (shipped). Storage: none new — adapters emit `WorkspaceArchive`. Risk: low (offline maintenance operation). Acceptance: per-adapter golden fixtures; import preview with counts before mutation; failure before mutation.

### Wiki links, backlinks, unlinked mentions

- Original: `domain/notes/note-links.ts`, `note-link-sync.ts`, `unlinked-mentions-section.tsx`, backlinks hooks. Value: knowledge-base connectivity, a README headline feature. Rationale: valuable but not essential to writing; needs a link-index projection and editor node type, both real scope. Dependencies: editor schema extension, rebuildable link index, rename propagation policy. Storage: new rebuildable projection (like FTS). Risk: medium — link resolution must stay out of keystroke and navigation paths. Acceptance: `[[` completion, backlink panel from the hydrated index, rename updates links transactionally, index rebuildable from canonical documents.

### Quick-access goto sequences

- Original: `core/quick-access` (validated goto registry, key sequences, hint indicator). Value: power-user jump navigation beyond the palette. Rationale: ADR-0013 explicitly deferred it; palette + shortcuts cover v1 navigation. Dependencies: command registry. Storage: none. Risk: low. Acceptance: registry-validated destinations, duplicate-claim failure, works from every route.

### Document outline

- Original: `document-outline.tsx`, `use-document-outline.ts`. Value: navigating long notes. Rationale: notes are expected to stay short (ADR-0020); revisit alongside the bounded-window fallback since both serve long documents. Dependencies: canonical heading projection. Risk: low if derived from canonical blocks, not the DOM. Acceptance: outline reflects canonical headings including off-window ones; click scrolls and focuses without parse work.

### Note icons and covers

- Original: `note-icon-picker.tsx`, `note-cover.tsx`. Value: visual identity per note. Rationale: `showPageIcons` was removed from the rebuild dialog precisely because no surface consumes icons; covers add asset storage questions. Dependencies: icon field exists on nodes; covers need an asset story. Storage: covers would need blob storage — significant. Risk: low (icons) / medium (covers). Acceptance: icon picker persists through the normal operation path; wire-contract field re-exposed in settings.

### Favorites and recents sidebar sections

- Original: `favorites-section.tsx`, `recents-section.tsx`, `domain/recents`. Value: faster return to hot notes. Rationale: additive organization; `rememberLastNote` covers the continuity essential. Dependencies: durable favorite flag (new node field or app_state list); recents derivable from session activity. Storage: favorites need a durable field — small schema addition. Risk: low. Acceptance: sections render from the hydrated store with zero IPC; favorites survive export/import.

### Raw Markdown editing mode

- Original: `editor-mode-toggle-bus.ts`, rich/Markdown mode switch. Value: plain-text editing for Markdown purists. Rationale: ADR-0013 deferred raw/vim modes to editor follow-up; the Markdown projection already exists per document. Dependencies: lossless round trip between canonical JSON and Markdown text. Risk: medium — round-trip fidelity is the hard part. Acceptance: toggle preserves content byte-stably for all schema constructs; mode is renderer state, not a document property.

### Multi-window / detached editor (original desktop had multi-webview scaffolding)

- Value: reference note beside writing surface without tabs/splits. Rationale: cheaper than split view inside one renderer; still real shell scope. Risk: medium (second renderer must hydrate independently). Acceptance: defined when scheduled.

### Web runtime (offline-capable browser adapter)

- Original: the web app was the primary runtime. Rationale: architectural North Star (`ARCHITECTURE.md` future web runtime section) but explicitly after desktop v1; WASM target not even installed. Dependencies: portable crates on `wasm32`, worker-owned SQLite-WASM over OPFS, history materializer selection. Risk: high. Acceptance: shared operation/archive/tree/recovery fixtures pass against both adapters.

---

## Excluded

Per the scope rules; none showed repository evidence of being essential to the
core writing workflow. "Storage" notes what the exclusion keeps out of the
canonical schema — the main long-term benefit.

| Feature | Original evidence | Why excluded | Storage/domain kept out |
| --- | --- | --- | --- |
| Journal (calendar, moods, autosave diary) | `features/journal`, `domain/journal`, sidebar journal section | Separate product surface; ADR-0013 excluded its settings | Mood/diary tables, journal settings |
| People | `features/people`, `domain/people` | Out of MVP per handoff; metadata surface excludes it (ADR-0013) | Person entities, note-person links |
| Tags | `features/tags`, `domain/tags`, tag detection settings | Out of MVP; search covers retrieval | Tag tables, note-tag joins |
| Tasks | `features/tasks`, `domain/tasks`, task views | Planning product, not writing | Task entities and views |
| Activity log / notifications | `features/activity`, `features/notifications` | Derivable projection; ADR-0013 rejected it as a setting | Activity/event tables |
| AI (title gen, spellcheck, continue writing, BYOK keys) | `features/ai`, `domain/ai`, AI writing indicator | Excluded; secrets never enter `app_state` or archives (ADR-0013) | Encrypted key storage, provider config |
| Sharing / send (frozen snapshots, passwords, expiry, share images) | `features/sharing`, `domain/sharing`, note-send menu | Requires a server; standalone has none | Share tokens, snapshot storage |
| Collaboration | `features/collaboration`, `domain/collaboration` | Server + multi-user; out of standalone scope | Presence, CRDT/merge state |
| Authentication / accounts / admin | `features/auth`, `features/admin`, avatar settings | Local-first single-user app; no accounts exist (ADR-0013) | User tables, sessions, roles |
| Sync (server or cross-device) | `domain/sync`, `core/persistence` server cache | Deferred; only via durable outbox if ever (ARCHITECTURE.md), never on navigation paths | Sync outbox, conflict metadata |
| Editor tabs | `editor-tabs/`, `openNotesInTabs`, `rememberLastTab` | Excluded; `rememberLastNote` is the continuity replacement (ADR-0013) | Tab layout state |
| Split view | `split-drop-zone.tsx` | Excluded with tabs; single persistent editor is the measured architecture | Pane layout state |
| Diagrams / annotation overlay / workspace graph | `features/diagram`, `annotation-overlay.tsx`, `workspace-graph.tsx`, note-history-graph | Visualization surfaces beyond writing; graph needs the link index anyway | Scene/annotation documents |
| Mobile app | `apps/mobile` | Desktop-first; web runtime precedes any mobile story | — |
| Browser extension | `apps/extension` | Depends on hosted/web runtime | — |
| Hosted cloud / self-host server (Docker, PostgreSQL, marketing site, demo mode, onboarding, analytics, PWA) | `docker-compose.yml`, `apps/documentation`, `(marketing)`, `features/demo`, `features/onboarding`, analytics settings | The standalone product is local-only; no server, no telemetry (ADR-0014: no diagnostic upload) | Server schema, analytics events |
| Note properties / templates / property layouts | `note-properties/`, property settings | Excluded with tags/people (ADR-0013) | Property schemas per note |

---

## 1. Strict v1 feature checklist

Every box must hold before v1 is declared. Items marked ✅ are complete per
`TODO.md`/`docs/handoff.md` at the audited commit; ☐ items are open.

- ✅ Persistent shell, icon navigation, theming, no post-startup loading UI for cached data
- ✅ Notes/folders: create, rename, nest, trash, restore, context menus, keyboard sibling reorder
- ☐ Cross-folder move and pointer drag-and-drop reorder (or an explicit decision that keyboard-only ships v1)
- ✅ Structured Markdown editor (whole-document ProseMirror, ADR-0020 schema, undo policy)
- ☐ Bounded-window fallback wired behind a chosen block-count threshold, or explicitly deferred with the threshold decision recorded
- ✅ Slash-command menu
- ☐ Find in note against the canonical document
- ☐ Whole-note select-all/copy, IME completion, accessible whole-document traversal (ADR-0020 consequences)
- ✅ Workspace full-text search from the palette with inherited-trash exclusion
- ✅ Dedicated Trash route with restore, purge, empty state, bounded rendering
- ✅ Version history list, preview, restore
- ☐ History-header freshness decision implemented (see unresolved decisions)
- ✅ Command palette + typed registry covering all global actions
- ✅ Shortcuts with rebinding, conflict rejection, settings persistence
- ✅ Settings dialog with every offered setting applied by a renderer consumer
- ☐ Durable sidebar-expansion persistence (native-only `app_state` operation, per ADR-0013)
- ✅ Archive export/import with validation-before-mutation and safety backup (backend + CLI)
- ☐ Export/import and backup/restore reachable from the desktop UI, not only the CLI
- ☐ Scheduled backup rotation actually firing in the running desktop app (timer owner)
- ☐ Desktop recovery UI: restore, live swap, rollback presentation
- ☐ Extreme-depth tree indentation policy implemented
- ☐ Fixed reference hardware selected; performance contract verified on it (100 cached switches, zero dropped frames; all hard invariants)
- ☐ Keyboard-driven end-to-end tests over sidebar, editor, metadata, history, palette, settings (roadmap product gate)

## 2. Post-v1 priority order

1. **Third-party importers** (Obsidian and Markdown vault first) — highest adoption leverage, lowest architectural risk, reuses the shipped archive path.
2. **Drag-and-drop reorder + cross-folder move** — completes the sidebar's expected interaction surface.
3. **Wiki links and backlinks** (with unlinked mentions) — the knowledge-base identity feature; brings the link-index projection that graph views would later need.
4. **Favorites and recents sections** — cheap, high-frequency navigation value.
5. **Document outline** — pairs with the bounded-window fallback for long notes.
6. **Quick-access goto sequences** — power-user depth once the registry is battle-tested.
7. **Note icons** (re-expose `showPageIcons`) — small; covers stay parked behind an asset-storage decision.
8. **Raw Markdown mode** — gated on round-trip fidelity work.
9. **Web runtime** — the large strategic step; sequenced last because everything above must stay portable through it.

## 3. Remove or hide from the rebuild

The rebuild is tight; nothing out-of-scope leaked in. Actions are confirmations,
not deletions of user-visible features:

- Keep `showPageIcons` and `showLineNumbers` hidden from the settings dialog (already done); they remain wire-contract fields only. Do not re-expose `showLineNumbers` — a block editor has no line gutter and no post-v1 entry needs it.
- `spikes/` (ui-architecture, renderer-store, desktop-bridge, tree-virtualization) are disposable measurement harnesses, not product surface. Hide from any packaging/distribution path; delete only after ADR-0020's deferred fixed-runner evidence is captured, since the fixed-runner runs may still reuse their instrumentation.
- The `skriuw-cli` maintenance surface (seed, snapshot, integrity, rebuild) ships for operators/development but must not be presented as the primary user path for backup/restore/import once the desktop UI entries exist.
- No journal, people, tags, tasks, sharing, AI, or sync code exists in the rebuild — keep it that way; the roadmap's product gate ("no journal, people, or tags enter MVP scope without a new decision") stands.

## 4. Unresolved decisions for the product owner

1. **Drag-and-drop in v1 or not.** `TODO.md` lists pointer drag and cross-folder move as remaining. Shipping v1 keyboard-only is defensible for a keyboard-first product but diverges from the original sidebar. Decide: v1 blocker or first post-v1 item.
2. **Bounded-window threshold.** ADR-0020 defers the block-count threshold that switches a document to the 192-block window. Decide the threshold (evidence suggests somewhere between 500 and 2,000 blocks) and whether the fallback must be wired before v1 or documented as a known v1 limit.
3. **History-header freshness.** Versions saved this session don't appear until the next bootstrap. Options: accept and document, refresh headers on history-drain acknowledgement, or a bounded poll. This is user-visible in a headline v1 feature.
4. **Backup cadence ownership.** The rotation capability enforces cadence but owns no timer. Decide where the six-hour timer lives (Tauri background task is the obvious candidate) and whether the user can change cadence in Settings (a new settings field → archive-fixture work per ADR-0013).
5. **Reference hardware.** The performance contract requires fixed reference hardware before v1 verification. Someone must pick and provision it.
6. **Extreme-depth indentation policy.** Depth-33 fixtures push content out of the sidebar pane. Clamp indentation, cap nesting depth at creation, or horizontal-scroll the pane — a product call with a schema implication only if depth is capped.
7. **Markdown-vault export in v1.** The archive is JSON. The original exported Markdown folders (`domain/data-transfer`). Decide whether a plain Markdown-files export (data-ownership optics, Obsidian-compatible) belongs in v1's export surface or arrives with the post-v1 importers.
8. **v1 platform targets.** Bridge and presentation evidence is Linux-only; Windows WebView2 and macOS WKWebView runs remain open. Decide whether v1 releases on all three desktop platforms or Linux-first.
