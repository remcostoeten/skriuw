# Skriuw Desktop Port — Architecture Audit

> Status: **analysis only, nothing built yet.** This is the "which patterns are
> reusable, which are not" pass requested before starting the desktop build.
>
> Decisions locked going in: ship a **local-first desktop replica** of the cloud
> app using **Tauri 2.0** (Rust backend), **skip auth** (single local profile),
> **store everything on the local filesystem** (SQLite), expose a **local IPC/REST
> surface** that mirrors the existing cloud/DB calls, generate the **TypeScript
> bindings with `tauri-specta`**, and **keep the cloud (web) build fully working**.
> `dora` (`~/dev/dora`) is the reference Tauri/Rust app we crib patterns from.

---

## TL;DR verdict

The port is very feasible, and the codebase already leans the right way — but the
honest reusability number is **two different numbers**:

| Layer | Reusable as-is | Reality |
|---|---|---|
| **UI / components / stores / react-query** | ~75–80% | Pure client React, platform-agnostic. Transfers to a Tauri webview with little change. |
| **Data access (the part that matters)** | ~15% covered today | A `WorkspaceBackend` seam exists but only wraps **6 of ~45 operations**. 25 files call Next.js server actions directly. This is the real work. |

**The whole port hinges on one move: widen the existing `WorkspaceBackend`
interface to cover *every* data operation, route all call-sites through it, then
add a third implementation (`tauriBackend`) that calls Rust via `invoke()`.** Do
that on the *web app first* (non-breaking, cloud keeps working), and the desktop
build collapses to "implement one more backend + the Rust side."

Do **not** try to run Next.js (RSC/server actions/route handlers) inside Tauri.
The desktop frontend must be a static SPA talking only to Rust.

---

## 1. The spine: the `WorkspaceBackend` seam

`src/core/workspace-backend/` already does exactly the thing a desktop port needs
— it abstracts persistence behind an interface and swaps the implementation at
runtime:

- `types.ts` — `WorkspaceBackend` interface (`mode: "server" | "local"`)
- `server-backend.ts` — wraps Prisma server actions (authenticated cloud users)
- `local-backend.ts` + `local-store.ts` — IndexedDB/localStorage (guest mode)
- `context.tsx` — `WorkspaceBackendProvider` picks `serverBackend` vs
  `createLocalBackend()` based on `auth.phase`

This is the proof-of-concept for the entire desktop architecture. **It already
demonstrates a local, no-network, no-auth backend running the same UI.**

### The catch: coverage is ~6 of ~45 operations

The interface today is only:

```
createNote / updateNote / deleteNote
createFolder / updateFolder / deleteFolder
```

Everything else **bypasses the seam** and imports server actions directly. 25
files do this (`grep '@/domain/*/actions'`), including:

- Note **reads**: `use-note`, `use-note-versions`, `use-note-backlinks`,
  `use-restore-note-version`, `use-note-graph`, `note-cache.ts`
- **Journal** (all): `use-journal-entries`, `use-journal-tags`
- **Sharing**: `use-note-sharing`, `shared-notes-overview`
- **Collaboration**: `collab-request-button`, `collaborators-section`, …
- **Notifications**: `use-notifications`
- Plus `workspace-warmup.tsx`, graph page, public share page

Each of these is a direct Next.js server-action call. In a Tauri webview there is
no Node server and no server actions, so **every one of these is a break** until
it goes through the backend interface.

**Highest-leverage prep step (web-only, ships independently, zero risk to cloud):**
widen `WorkspaceBackend` to the full operation set and migrate the 25 bypassing
call-sites onto it. After that, `serverBackend` stays the cloud impl, and the
desktop port is "write `tauriBackend`."

---

## 2. Target architecture (cloud + desktop share one frontend)

```
                ┌─────────────────────────────────────────┐
                │      Shared React UI (features/*, shared/*)│
                │   react-query · zustand · BlockNote/Monaco │
                └───────────────┬─────────────────────────┘
                                │ useWorkspaceBackend()
              ┌─────────────────┼──────────────────────┐
              ▼                 ▼                      ▼
       serverBackend       localBackend          tauriBackend  (NEW)
       (Prisma actions)   (IndexedDB guest)      invoke() → Rust
              │                 │                      │
        Next.js + PG       browser storage     ┌───────▼─────────┐
        (cloud, kept)      (web guest)         │  Rust / src-tauri│
                                               │  SQLite (local FS)│
                                               │  tauri-specta TS  │
                                               └───────────────────┘
```

- **Web build**: unchanged. `serverBackend` (auth) / `localBackend` (guest).
- **Desktop build**: same UI, `tauriBackend` selected when `window.__TAURI__` is
  present, auth stubbed to a single local profile.
- Selection logic lives in one place (`context.tsx`), so the cloud path is never
  touched.

### Why not run Next.js in Tauri

`app/page.tsx` and `app/layout.tsx` prefetch via RSC + `HydrationBoundary` and
call `getServerUser()`; there are route handlers (`app/api/**`), middleware
(`src/proxy.ts`), and `import "server-only"` in `core/db`. None of that exists in
a static webview. Two viable framings:

1. **Static SPA (recommended, dora-style):** strip server-only render paths,
   bundle the client React (Vite, or `next build` with a static entry) and let
   Rust be the only backend. Highest performance, matches dora 1:1.
2. **Keep Next as SPA shell:** more compromise, keeps Next coupling, slower; only
   worth it if de-Next-ifying the render tree proves expensive.

Either way the *data* story is identical (everything through `WorkspaceBackend`);
the difference is only how much of `app/` render code gets reworked.

---

## 3. Reuse / rebuild / cloud-only buckets

### (a) Pure local-able — implement in Rust/SQLite (~35 ops)
Notes (CRUD, versions w/ content-hash dedup + 50-version prune, backlinks, graph),
Folders (tree + cascade soft-delete), Journal (entries + tags, one-per-day),
Settings/editor-prefs, AI **key storage** (encrypt at rest), Import/Export (zip),
Seed bundles, Project-planning (admin — likely drop on desktop).

These are uniformly `WHERE userId = … AND deletedAt IS NULL` CRUD. With a single
local user they map cleanly to SQLite.

### (b) Needs local adaptation
- **AI actions** (title/spellcheck/continue): call the provider **directly from
  Rust** using the user's key (no `/api/ai` proxy). Or local Ollama.
- **Notifications**: no SSE; local/no-op or in-app only.
- **Share "snapshot/revoke/get"**: can keep local snapshots but there's no public
  URL to serve (see below).

### (c) Inherently cloud — hide/stub on desktop
Public share **links** (need an HTTP host + token), **collaboration** (PartyKit +
Yjs + Durable Objects, multi-user identity), **realtime sync**, **SSE
notifications**, **OAuth**. Feature-flag these out of the desktop UI. They depend
on services a single offline binary can't provide.

---

## 4. The Rust backend (mirror the cloud contract)

Source of truth for the schema is `prisma/schema.prisma` (~21 models). Port the
local-relevant subset to SQLite. Reuse dora's machinery almost verbatim:

| Concern | Reuse from dora | dora reference |
|---|---|---|
| SQLite + WAL + FK pragmas, `Mutex<Connection>` | `storage/mod.rs` | `apps/desktop/src-tauri/src/storage/mod.rs` |
| Versioned migrations (`include_str!` + `user_version`) | `storage/migrator.rs` | same |
| Typed IPC errors → `{ kind, detail }` | `error.rs` | `src-tauri/src/error.rs` |
| **tauri-specta binding pipeline** | `bindings.rs` + setup hook | `src-tauri/src/bindings.rs`, `lib.rs` |
| OS keyring + AES-256-GCM fallback (for AI keys) | `security.rs`, `credential_storage.rs` | same |
| App config / data-dir resolution (`dirs`) | `config.rs` | same |
| `AppState` + `DashMap` + async commands | `lib.rs` | same |
| Vite + Tauri dev/build wiring, boot screen | `vite.config.ts`, `tauri.conf.json`, `boot-screen.ts` | `apps/desktop/*` |

Rough size: **~6–8k LOC Rust** (schema/migrations, ~45 query fns, command
handlers, utils for markdown/link-graph/hashing/zip). dora already proves every
one of these subsystems in production.

### Type strategy — DECIDED: no tauri-specta
`tauri-specta` would make **Rust the source of truth** (emitting `bindings.ts`).
But skriuw already has hand-written TS domain types (`NoteFile`, `CreateNoteInput`,
etc.) that the cloud path and the `WorkspaceBackend` interface use — and we've
locked that **the hand-written `WorkspaceBackend` interface is canonical**.
Generating types from Rust would create a competing second source of truth, so:

- **We do NOT use tauri-specta.** `tauriBackend` is hand-written against the
  existing TS interface; the Rust command `serde` structs are shaped to serialize
  to *exactly* the TS shapes (note: JSON-over-IPC sends dates as strings, so the
  desktop read path must revive them the way the guest store already does).
- Drift risk (Rust structs vs TS types) is the tradeoff. If it ever bites, add a
  lightweight Rust→TS shape-check in CI (generate a reference and diff against the
  canonical types) — cheap to bolt on, not needed now.

---

## 5. Skipping auth (single local profile)

Auth is cleanly isolated, so this is small. Every query already scopes by
`userId`, so a hardcoded local user "just works" across ~50 files. Seam points:

- `src/core/db/index.ts` — `getServerUser()` / `getAuthenticatedUser()`
- `src/core/auth/use-auth.ts` — `useAuth()`
- `src/proxy.ts` — middleware redirects

In the desktop build these don't exist server-side anyway; the client just needs
`useAuth()` to resolve to a fixed local profile and `tauriBackend` to pass a
constant local user id to Rust (or omit it entirely — single-tenant DB).
**Do not reuse better-auth on desktop**; there's no one to authenticate.

---

## 6. Recommended sequencing (no Rust until step 2)

**Phase 0 — Web-only prep (de-risks everything, ships to cloud, breaks nothing)**
1. Widen `WorkspaceBackend` to the full read+write op set (notes reads, journal,
   settings, AI keys, import/export). Add `getNote`, `listNotes`, versions,
   backlinks, graph, journal CRUD, etc.
2. Migrate the 25 direct-`@/domain/*/actions` call-sites onto the interface.
3. Move RSC prefetch in `app/page.tsx` / `app/layout.tsx` to a client warmup that
   calls the backend (keeps web working, removes a desktop blocker).
4. Gate cloud-only features (sharing/collab/notifications) behind a capability
   flag the backend advertises (e.g. `backend.capabilities`).

**Phase 1 — Rust foundation**
Scaffold `apps/desktop` from dora's template: storage + migrator + error +
bindings + config + security. Stand up SQLite schema from the Prisma models.

**Phase 2 — Implement the contract**
Rust commands for the ~35 local ops; generate bindings; write `tauriBackend` that
maps the interface onto `commands.*`. Stub auth to local profile.

**Phase 3 — AI + import/export + polish**
Provider calls direct from Rust; zip import/export; boot screen; packaging
(dora's release tooling — AUR/deb/rpm/dmg/nsis — is reusable wholesale).

---

## 7. Risks & open questions

- **Biggest risk = the 25 bypass sites + RSC prefetch**, not the Rust. Phase 0 is
  the real project; do it as normal web work behind the existing seam.
- **Sync is explicitly out of scope** here (local-first, no cloud sync). If
  two-way sync is ever wanted, that's a separate, much larger design (conflict
  resolution / CRDT). Flag it now so we don't accidentally design ourselves into
  a corner.
- **Type source-of-truth** (§4) — pick before writing Rust.
- **BlockNote `richContent`** is JSON in Postgres; ensure identical
  serialization in SQLite (store as TEXT, validate on read).
- **Specta versions are RC and pinned** in dora's `Cargo.toml`; copy the exact
  pins to avoid mid-rc breakage.
- **Wails vs Tauri**: settled on Tauri — correct call here purely because dora
  hands us a complete, proven Rust template (storage, specta, keyring, packaging),
  so the marginal cost of Tauri is near zero and Go/Wails would start from scratch.

---

## Appendix — key files

**skriuw**
- Seam: `src/core/workspace-backend/{types,context,server-backend,local-backend,local-store}.ts`
- Domain ops: `src/domain/{notes,folders,journal,sharing,collaboration,seed}/actions.ts`
- Auth/db: `src/core/{auth,db}/*`, `src/lib/{auth,prisma}.ts`, `src/proxy.ts`
- Schema: `prisma/schema.prisma`
- Cloud-only: `party/notes.ts`, `app/api/collaboration/auth/route.ts`, `app/api/notifications/stream/route.ts`, `app/api/ai/*`

**dora (template)**
- `apps/desktop/src-tauri/src/{lib,bindings,error,security,credential_storage,config}.rs`
- `apps/desktop/src-tauri/src/storage/{mod,migrator}.rs` + `migrations/*.sql`
- `apps/desktop/{vite.config.ts,src/boot-screen.ts}`, `src-tauri/tauri.conf.json`

---

## 8. Phase 0 — file-by-file task breakdown

Decisions applied: canonical contract = the hand-written `WorkspaceBackend` TS
interface (Rust serializes to match; specta bindings adapted onto it). Local-first
only, no sync. Every task below is **web-only, non-breaking, independently
shippable** — none of it touches Rust, and the cloud path keeps working because
`serverBackend` keeps its current behavior. Order matters; later steps depend on
earlier ones.

### 8.1 Widen the interface — `src/core/workspace-backend/types.ts`
Add the full local-able op set to `WorkspaceBackend` and a capability descriptor.
Reuse the existing input/output types from `@/domain/*/actions` so nothing forks.

```
readonly mode: "server" | "local" | "tauri";
readonly capabilities: {
  sharing: boolean;
  collaboration: boolean;
  notifications: boolean;
  ai: boolean;
};

// notes — reads (currently bypass the seam)
listNotes(): Promise<NoteFile[]>;                 // was listNoteMetadata()
getNote(id): Promise<NoteFile | null>;            // folds in guest-seed fallback
getNotes(ids): Promise<NoteFile[]>;
getNoteVersions(id): Promise<NoteVersion[]>;
getNoteBacklinks(id): Promise<ResolvedNoteLink[]>;
getNoteGraph(): Promise<GraphData>;
restoreNoteVersion(versionId): Promise<UpdateNoteResult>;

// journal (confirm read fn locations during this step)
listJournalEntries(): Promise<JournalEntry[]>;
createJournalEntry / updateJournalEntry / deleteJournalEntry
listJournalTags(): Promise<JournalTag[]>;
createJournalTag / deleteJournalTag

// settings + ai-keys + data-transfer
getEditorPreferences() / updateEditorPreferences(patch)
listAiKeys / createAiKey / updateAiKey / deleteAiKey / testAiKey / getAiUsage
exportWorkspace() / previewImport(file) / importWorkspace(file) / clearWorkspace()
```

Cloud-only ops (publish/share, collaboration, notifications, realtime) **stay out
of the interface** — they're handled by capability gating in 8.5, not by a local
implementation.

### 8.2 Fill out `serverBackend` — `src/core/workspace-backend/server-backend.ts`
Implement every new method by delegating to the existing server actions
(`fetchNote`, `fetchNoteVersions`, `restoreNoteVersion`, journal actions, etc.).
Purely mechanical wiring; cloud behavior is identical. Set
`capabilities: { sharing: true, collaboration: true, notifications: true, ai: true }`.

### 8.3 Fill out `localBackend` — `src/core/workspace-backend/local-backend.ts`
Implement the new reads/journal against IndexedDB, folding the **guest-seed
fallback** (currently in `use-note.ts` / `workspace-warmup.tsx` via
`fetchGuestSeedNote(s)`) into `getNote`/`getNotes` so hooks stop branching. Set
`capabilities: { sharing: false, collaboration: false, notifications: false, ai: false }`.
This is also a free upgrade to guest mode and is the literal blueprint for
`tauriBackend` later.

### 8.4 Migrate the 25 bypass call-sites onto `useWorkspaceBackend()`
Replace direct `@/domain/*/actions` imports with backend calls. Group by domain:

| File | Switch to |
|---|---|
| `features/notes/hooks/use-note.ts` | `backend.getNote` (drops manual seed branch) |
| `features/notes/hooks/use-note-versions.ts` | `backend.getNoteVersions` |
| `features/notes/hooks/use-note-backlinks.ts` | `backend.getNoteBacklinks` |
| `features/notes/hooks/use-restore-note-version.ts` | `backend.restoreNoteVersion` |
| `features/notes/hooks/use-note-graph.ts` | `backend.getNoteGraph` |
| `features/notes/hooks/use-notes-layout.ts` | `backend.listNotes` |
| `features/notes/lib/note-cache.ts` | type-only import OK; keep `UpdateNoteInput` type, move calls to backend |
| `features/journal/hooks/use-journal-entries.ts` | `backend.listJournalEntries` + journal mutations |
| `features/journal/hooks/use-journal-tags.ts` | `backend.listJournalTags` + tag mutations |
| `features/notes/hooks/use-create-note.ts` etc. | already on seam — no change beyond signature |

Cloud-only hooks/components (handled in 8.5, not migrated to the interface):
`features/sharing/*`, `features/collaboration/*`, `features/notifications/hooks/use-notifications.ts`.

### 8.5 Capability gating — new `useWorkspaceCapabilities()` + UI guards
Expose `capabilities` from the provider (`context.tsx`). Wrap the entry points for
sharing / collaboration / notifications so they hide or no-op when the capability
is `false`. On web (serverBackend) all true → no visible change. This is the exact
switch the desktop build flips off later.

### 8.6 Move RSC prefetch to a client warmup
`app/app/layout.tsx` (calls `getServerUser()`) and `app/app/page.tsx`
(`prefetchQuery(listNoteMetadata)` + `HydrationBoundary`) are server-render
blockers for a static webview. Refactor the existing
`src/providers/workspace-warmup.tsx` to call `backend.listNotes()` /
`backend.getNotes()` on mount and seed react-query client-side; thin the server
page to a shell. Web still works (it just hydrates on the client); desktop becomes
possible.

### Phase 0 exit criteria
- No feature hook imports from `@/domain/*/actions` except for **types**.
- `WorkspaceBackendProvider` is the only place that selects an implementation.
- Cloud build behaves identically; guest build gains the new reads/journal.
- A `tauriBackend` could be dropped in by implementing one interface — that is
  Phase 1+.

### To confirm while doing 8.1
- Exact location of journal **read** functions (the `use-journal-entries` import is
  multi-line; mutations live in `domain/journal/actions.ts`, reads may be in a
  `queries.ts` or a server-component prefetch).
- Whether `listNoteMetadata` (used in the RSC prefetch) and `fetchNotes` should
  collapse into a single `listNotes` or stay split (metadata vs full).
