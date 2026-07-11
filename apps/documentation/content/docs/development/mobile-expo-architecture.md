---
title: "Skriuw → Expo Mobile Architecture"
description: "Deep architecture reference for building the Skriuw mobile app (iPhone first, Android later) with Expo / React Native. Companion interactive map:"
---

> Deep architecture reference for building the Skriuw mobile app (iPhone first, Android later) with Expo / React Native.
> Companion interactive map: [`mobile-architecture-map.html`](/mobile-architecture-map.html) (open in a browser; pan/zoom, click any domain node).
>
> Written 2026-07-09 against commit `3266dafe` (branch `daddy`). All file paths are real and verified.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [The system as it exists today](#2-the-system-as-it-exists-today)
3. [The seam: `WorkspaceBackend`](#3-the-seam-workspacebackend)
4. [Data & content model](#4-data--content-model)
5. [API surface & the auth problem](#5-api-surface--the-auth-problem)
6. [Where the complexity lies - portability map of every feature](#6-where-the-complexity-lies)
7. [The editor problem (biggest single risk)](#7-the-editor-problem)
8. [Portable domain layer - exact reuse inventory](#8-portable-domain-layer)
9. [Proposed mobile architecture](#9-proposed-mobile-architecture)
10. [MVP scope: notes only](#10-mvp-scope-notes-only)
11. [Post-MVP roadmap](#11-post-mvp-roadmap)
12. [Risks & open decisions](#12-risks--open-decisions)

---

## 1. Executive summary

Skriuw is unusually well positioned for a mobile port because of one architectural decision already made: **all frontend data access goes through a single `WorkspaceBackend` interface** (`apps/web/src/core/workspace-backend/types.ts`) that already has three implementations (cloud/Prisma, guest/IndexedDB, desktop/Tauri-Rust). The mobile app is, structurally, _a fourth implementation of that interface_ plus a new UI.

The three hard problems, in order of difficulty:

| #   | Problem                            | Why it's hard                                                                                                                                               | Recommended answer                                                                                                                                 |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The editor**                     | BlockNote is DOM/ProseMirror-only. The entire `features/editor/` tree (69 files: custom blocks, inline chips, vim, plugins) cannot run in React Native.     | MVP: render-only native view + plain-markdown editing; V2: WebView-hosted BlockNote sharing the exact web schema. See §7.                          |
| 2   | **Auth from a native client**      | Web auth is Better Auth with **cookie sessions**; there is no bearer-token mutation API today. `/api/sync/*` bearer tokens exist but are read+capture-only. | Add `@better-auth/expo` plugin server-side (small change) - official Better Auth support for Expo with SecureStore cookie management. See §5.      |
| 3   | **A mobile-callable mutation API** | Note CRUD on web is Next.js **server actions**, not REST routes. A native app can't call server actions.                                                    | Thin REST layer (`/api/workspace/*`) that wraps the already-extracted `domain/*` core functions (`note-write-core.ts` etc.). ~1–2 weeks. See §5.3. |

Everything else is favorable:

- The **domain logic is already portable pure TS** - markdown↔BlockNote-JSON parser, link/tag/person extraction, search operators, versioning policy, graph builder, chip rewriting - all verified free of DOM/Next imports (§8).
- The **desktop Rust layer needs zero porting** - its two smart pieces (markdown parsing, content analysis) have TS twins that the web already uses as fallback.
- The **cloud backend needs no schema changes** for a notes MVP.

**MVP recommendation:** cloud-only (online-required) notes app - auth, note list/folders, search, read-only rich rendering, markdown editing, create/delete. Defer offline-first sync, the rich block editor, journal, collab, and AI to post-MVP. Estimated at roughly 6–9 focused weeks for one developer (§10.5).

---

## 2. The system as it exists today

### 2.1 Monorepo

Bun workspaces (`bun@1.3.14`), workspaces `apps/*` + `packages/*`. The root `package.json` is the shared dependency pool.

| Workspace                         | Purpose                                                                                                          | Size                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `apps/web` (`@skriuw/web`)        | Next.js 16 / React 19 app. **The product, and the home of all shared domain logic.**                             | `src/` ≈ 642 files, ~96.5k LOC |
| `apps/desktop` (`skriuw-desktop`) | Tauri 2 shell; bundles `packages/web-spa`; Rust gives local SQLite index + markdown vault over ~87 IPC commands. | Rust ≈ 9.6k LOC, 13 files      |
| `apps/extension`                  | Chrome MV3 web clipper → `POST /api/sync/capture` with bearer token.                                             | ~1.2k LOC                      |
| `packages/web-spa`                | Vite build harness for desktop: shims Next.js/server modules away so `apps/web/src` runs as a plain SPA.         | ~944 LOC, mostly shims         |
| `prisma/`                         | Postgres schema, 27 models.                                                                                      | 570 LOC                        |
| `party/` + `wrangler.jsonc`       | Cloudflare Worker (Durable Objects) running `y-partyserver` for Yjs collab. One DO per note.                     | small                          |

There is **no `apps/mobile`** and no extracted shared package for domain logic yet - `apps/web/src/domain/` _is_ the shared logic, consumed by the desktop via the `web-spa` alias trick.

### 2.2 `apps/web/src` layout

```
src/
├── app/          Next.js routes (pages + API)
├── core/         auth, workspace-backend, shortcuts, pwa, quick-access
├── domain/       ★ backend-agnostic business logic (mostly portable TS)
│   ├── notes/ (23)  data-transfer/ (21)  ai/ (10)  sharing/ (8)
│   ├── journal/ (6) seed/ (6)  sync/ (6)  folders/ (4)  tags/ (4)
│   └── collaboration/ people/ storage/ trash/ recents/ validation/
├── features/     20 feature folders (UI + hooks; DOM-coupled)
├── lib/          auth.ts, auth-client.ts, prisma, app-origin
├── providers/    app-providers, query-cache-persistence, bootstraps
├── shared/       ui kit, hooks, lib utilities
└── types/        shared types (RichTextDocument, MarkdownContent, …)
```

The `domain/` vs `features/` split is the load-bearing wall: `domain/` is the reuse target for mobile; `features/` is the rewrite target.

### 2.3 How the desktop consumes the web app (relevant precedent)

`packages/web-spa/vite.config.ts` aliases every Next.js and server module (`next/navigation`, `@/lib/prisma`, `@/lib/auth`, `server-only`, …) to stubs, then builds `apps/web/src` with `@tanstack/react-router`. This proves the codebase already tolerates running without Next - but it does so by _shimming_, not by clean package boundaries. Mobile should do the extraction properly (§9.2) rather than adding a second shim layer.

---

## 3. The seam: `WorkspaceBackend`

Everything below `features/*` hooks talks to one interface. This is the mobile integration contract.

**Definition:** `apps/web/src/core/workspace-backend/types.ts` (235 lines - interface at lines 111–235).

```
core/workspace-backend/
├── types.ts            235 LOC  interface + wire types            ★ portable
├── context.tsx          48 LOC  provider + backend selection
├── server-backend.ts   107 LOC  web impl → Prisma server actions
├── local-backend.ts    515 LOC  guest impl → IndexedDB blob
├── local-store.ts      371 LOC  guest storage adapter
├── tauri-backend.ts   1155 LOC  desktop impl → Rust IPC           ← template for mobile
├── note-builders.ts    129 LOC  pure helpers shared by impls      ★ portable
├── write-queue.ts       45 LOC  per-record write serialization    ★ portable
└── capability-error.ts  18 LOC  WorkspaceCapabilityError          ★ portable
```

### 3.1 Shape

```ts
type WorkspaceBackend = {
	mode: "server" | "local" | "tauri"; // mobile adds: "mobile" (or "expo")
	capabilities: WorkspaceCapabilities; // { journal, sharing, collaboration,
	//   notifications, ai, trash, history,
	//   coverUpload } - all booleans
	// …methods
};
```

Optional methods (`listNotes?`, `listTrash?`, …) + the capabilities object are how a backend declares partial support. The UI is **already built to degrade**: capability-gated nav (`features/layout/components/icon-rail.tsx` - journal at `:214`, trash at `:284`), `WorkspaceCapabilityError` for unsupported calls, cache-query fallbacks when an optional method is absent. A mobile backend that only implements notes gets a coherent app for free _if_ the mobile UI reuses the same gating idea.

### 3.2 Full method surface (what a complete backend implements)

| Group              | Methods                                                                         | Needed for notes-MVP?                                         |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Notes: search/list | `searchNotes?`, `listNotes?`, `listFolders?`                                    | ✅                                                            |
| Notes: CRUD        | `createNote`, `updateNote`, `deleteNote`, `deleteNotes?`, `getNote`, `getNotes` | ✅                                                            |
| Notes: import      | `importNotes?`, `importArchive?` (tauri-only)                                   | ❌                                                            |
| Versions           | `getNoteVersions`, `restoreNoteVersion`                                         | ❌ (throw capability error)                                   |
| Links/graph        | `getNoteBacklinks`, `getNoteGraph`                                              | ◐ backlinks nice-to-have; graph no                            |
| Folders            | `createFolder`, `updateFolder`, `deleteFolder`                                  | ✅                                                            |
| Trash              | `listTrash?`, `restoreTrash?`, `purgeTrash?`, `emptyTrash?`                     | ◐ soft-delete already happens server-side; UI later           |
| Journal            | 7 methods                                                                       | ❌                                                            |
| People             | 6 methods (`listPeople`, `createPerson`, `mergePersons`, …)                     | ❌ (read-only `listPeople` needed only to _render_ `$` chips) |
| Tags               | 5 methods (`listTags`, `renameTag`, `deleteTag`, `setTagColor`, `listTagNotes`) | ◐ read-only `listTags` for colors                             |
| Cover              | `uploadCoverImage?`                                                             | ❌ (render covers, don't upload)                              |

### 3.3 Backend selection today

`context.tsx:16-31`: `isTauriRuntime()` → tauri; else authenticated → server; else guest. Mobile adds a fourth branch - or, cleaner, the Expo app simply constructs its own backend directly since it never runs the web selection code.

### 3.4 Capability matrix (existing + proposed mobile)

| capability    | server | guest | tauri | **mobile MVP** | mobile V2                  |
| ------------- | ------ | ----- | ----- | -------------- | -------------------------- |
| journal       | ✅     | ❌    | ✅    | ❌             | ✅                         |
| sharing       | ✅     | ❌    | ❌    | ❌             | ◐ view-only                |
| collaboration | ✅     | ❌    | ❌    | ❌             | ❌ (long-term)             |
| notifications | ✅     | ❌    | ❌    | ❌             | ✅ (push!)                 |
| ai            | ✅     | ❌    | ✅    | ❌             | ✅ (cloud AI route exists) |
| trash         | ✅     | ❌    | ✅    | ◐              | ✅                         |
| history       | ✅     | ❌    | ✅    | ❌             | ✅                         |
| coverUpload   | ✅     | ❌    | ✅    | ❌             | ✅                         |

---

## 4. Data & content model

### 4.1 Prisma schema (`prisma/schema.prisma`, 27 models)

Clusters:

- **Auth (Better Auth):** `User`, `Session` (token-based cookie sessions), `Account` (OAuth: GitHub, Google), `Verification`, `RateLimit`.
- **Notes core:** `Folder` (hierarchical, `parentId` self-relation, soft-delete), **`Note`** (the center: `name`, `content` markdown, `richContent` JSONB, `preferredEditorMode`, `tags String[]`, `properties Json`, `icon`, `cover`, `journalMeta`, `deletedAt`), `NoteVersion` (full snapshots, `contentHash`), `NoteLink` (graph edges - one row per outgoing wiki-link/tag/person, unique on `(sourceNoteId, kind, targetLabel)`), `NoteShare` + `NoteShareView` (public links with frozen content snapshots), `Person`, `NoteTagMeta` (tag colors only - membership is derived from NoteLink rows).
- **Journal:** `JournalEntry`, `JournalLink`, `JournalTag`.
- **Sync/tokens:** `SyncToken` (sha256-hashed bearer tokens, scopes `sync:read`/`sync:write` - powers desktop + clipper), `SyncEvent` (audit + idempotency).
- **AI/storage:** `AiProviderKey` (encrypted BYO keys), `AiUsageLog`, `AiErrorEvent`, `UserStorageConfig` (BYO S3/Vercel-Blob).
- **Misc:** `UserRecent`, `SeedBundle`, `CollaborationRequest`, `NoteCollaborator`, `Notification`.

**For a mobile notes MVP, zero schema changes are required.** The only additive schema work in any plan is if you extend `SyncToken` scopes (not recommended - see §5).

### 4.2 The dual content representation (critical to understand)

Every note (and journal entry, and version) stores content **twice**:

1. `content: String` - **markdown**. Canonical, searchable, export-friendly.
2. `richContent: Json` - the **BlockNote document** (`Block[]` from `@blocknote/core`), the editor's native format. Nullable; when null it's derived from markdown by `markdownToRichDocument()`.
3. `preferredEditorMode: "block" | "raw"` - which surface the user last used.

Rules learned the hard way (from repo memory):

- **JSONB key-order**: Postgres reorders JSON keys; naive stringify-compare of `richContent` caused typing reverts. `richDocumentKey()` (stable stringify) exists for comparisons - a mobile client doing echo-suppression must use it.
- Plain-markdown edits must **clear stale `richContent`** (web uses `Prisma.DbNull`) or the block view resurrects old content. A mobile markdown editor must send `richContent: null` on raw saves - the server path already handles this if you go through `note-write-core.ts`.

This dual model is a _gift_ for mobile MVP: **a markdown-only editor is a first-class citizen** of the data model, not a hack. `preferredEditorMode: "raw"` notes already exist and round-trip perfectly.

### 4.3 Links / tags / people indexing

- Inline syntax: `[[Wiki Link|alias]]`, `[label](note://id)`, `#tag` (2–32 chars), `$Person` (persisted as `kind:"person"`, `targetLabel = person.id`), `@user`.
- On every save the server diffs and rewrites `NoteLink` rows (`domain/notes/note-link-sync.ts`). **If mobile writes go through the server API, indexing is free** - the mobile client never needs to run the extraction itself (though the extraction code is portable TS if it ever wants to, e.g. for offline).
- Graph/tags/people overview pages union `NoteLink` + `JournalLink`.

### 4.4 Version history

Server-side policy in `domain/notes/versioning.ts` (portable TS): skip identical `contentHash`, skip trivial ≤2-char/whitespace deltas, coalesce autosaves within 60s, retain 200/note. **Mobile gets version capture for free** by writing through the server core. The mobile UI can simply not show history in MVP (`capabilities.history: false`).

---

## 5. API surface & the auth problem

### 5.1 What exists today

| Surface                                                                                                                                           | Auth                                                   | Mobile-usable as-is?                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Server actions** (`domain/*/actions.ts`) - note/folder/journal/people/tags/trash CRUD                                                           | Cookie session, Next-internal protocol                 | ❌ **Not callable from native code.** Server actions are a Next.js RPC bound to the framework. |
| `api/auth/[...all]` - Better Auth catch-all                                                                                                       | Cookies                                                | ◐ callable, but native apps have no browser cookie jar                                         |
| `api/sync/capture` (POST, create note), `api/sync/export` (GET, full workspace), `api/sync/folders` (GET), `api/sync/verify`, `api/sync/activity` | **Bearer `SyncToken`** (sha256 hash, scopes), CORS `*` | ✅ but **read + create-only** - no update/delete                                               |
| `api/ai` (+ keys/usage routes)                                                                                                                    | Session (optional; anonymous w/ inline key)            | ◐ needs session → blocked on auth answer                                                       |
| `api/collaboration/auth`                                                                                                                          | Session; mints 5-min HMAC token for the Yjs room       | ◐ same                                                                                         |
| `api/data/export`, `api/data/import`                                                                                                              | Session                                                | ◐ same                                                                                         |
| `api/notifications/stream`                                                                                                                        | SSE, session                                           | ◐ same                                                                                         |
| `api/storage/config`, `api/account/*`                                                                                                             | Session (+ step-up)                                    | ◐ same                                                                                         |

**Conclusion: today there is no API a mobile app could use to _edit_ a note.** This is the single biggest server-side gap, and it's cheap to close because the logic is already extracted (server actions are thin wrappers over `domain/` core functions like `createNoteForUser` in `note-write-core.ts` - deliberately extracted for exactly this reason when the clipper API was built).

### 5.2 Auth: pick one of three paths

**Option A - Better Auth Expo plugin (recommended).**
Better Auth ships first-class Expo support: `@better-auth/expo` on the server (added to the `plugins` array in `apps/web/src/lib/auth.ts`) + `@better-auth/expo/client` in the app, storing the session cookie in `expo-secure-store` and attaching it to fetches. Email/password works directly; GitHub/Google OAuth works via deep-link scheme (add `skriuw://` to `trustedOrigins`).

- Pros: same `Session`/`User` tables, same session semantics, official path, minimal server delta (~20 lines), the auth client API mirrors the web one you already use.
- Cons: version-pin coordination with the existing `better-auth` version; OAuth deep-link flow needs `trustedOrigins`/scheme config and testing (echoes of the `tauri://` origin lesson in `app-origin.ts`).

**Option B - extend the `SyncToken` bearer scheme.**
Add `workspace:write`-style scopes and let the mobile app operate like a super-clipper.

- Pros: infra exists, CORS solved, tokens revocable per-device (nice!).
- Cons: you'd re-implement login (how does the app _get_ a token? today they're minted in the web settings UI), no session refresh semantics, and you'd grow a parallel auth system. Fine as a stopgap, wrong as the destination.

**Option C - JWT/bearer plugin on Better Auth.**
Possible but Option A already solves cookie transport for native; C adds surface without benefit.

**Decision to make: Option A**, keeping `SyncToken` for what it is (clipper/desktop sync + possible CI/scripting).

### 5.3 The mobile REST layer (`/api/workspace/*`)

New thin routes wrapping existing domain cores - **no business logic**, just auth + zod validation + call-through:

```
GET    /api/workspace/notes            → list (metadata only: id, name, parentId, tags, icon, updatedAt, sortOrder)
GET    /api/workspace/notes/:id        → full note (content + richContent + mode)
POST   /api/workspace/notes            → createNoteForUser (domain/notes/note-write-core.ts)
PATCH  /api/workspace/notes/:id        → update core (name/content/richContent/mode/parent/tags) - triggers link-sync + versioning for free
DELETE /api/workspace/notes/:id        → soft-delete (domain/trash)
GET    /api/workspace/folders          → tree
POST   /api/workspace/folders          / PATCH /:id / DELETE /:id
GET    /api/workspace/search?q=        → features/notes/server/search-notes (already extracted)
GET    /api/workspace/tags             → list w/ colors (read-only, for chip rendering)
GET    /api/workspace/people           → list (read-only, for $ chip rendering)
```

Design notes:

- Authenticate via Better Auth session (works for both web fetches and the Expo client after §5.2A).
- Include `updatedAt` (or a rowVersion) in PATCH responses and accept an `If-Unmodified-Since`-style precondition → cheap conflict detection now, foundation for offline sync later.
- Reuse the `idempotency-key` pattern from `api/sync/capture` on POST.
- List endpoint returns **metadata only** - mirrors the web pattern where RQ persists bodies per-note and lists come cheap. Mobile fetches bodies on open + prefetch.

Effort: ~1–2 weeks including tests, because every handler body already exists as a domain function.

---

## 6. Where the complexity lies

Every feature, classified for mobile. **Classes:** `REUSE` (logic runs as-is in RN) · `ADAPT` (portable core, new thin UI) · `REWRITE` (DOM-bound, needs native rebuild) · `SERVER` (server does it; mobile just calls) · `SKIP` (not applicable / not planned).

### Tier 0 - foundation (MVP-blocking)

| Feature                    | Where                                                  | Class        | Complexity | Notes                                                                |
| -------------------------- | ------------------------------------------------------ | ------------ | ---------- | -------------------------------------------------------------------- |
| Workspace backend contract | `core/workspace-backend/types.ts`                      | REUSE        | -          | Extract to shared package (§9.2)                                     |
| Auth                       | `lib/auth.ts`, `lib/auth-client.ts`                    | ADAPT        | ●●○○○      | `@better-auth/expo` both sides; OAuth deep links are the fiddly part |
| Mobile REST API            | new `app/api/workspace/*`                              | SERVER       | ●●○○○      | Wraps existing domain cores                                          |
| Notes CRUD + folders       | `domain/notes`, `domain/folders`                       | SERVER       | ●○○○○      | Already done server-side                                             |
| Markdown→rich parsing      | `domain/notes/rich-document.ts`                        | REUSE        | ●○○○○      | Pure TS, type-only BlockNote import, verified                        |
| Search                     | `search-query.ts` (parse) + `search-notes.ts` (server) | SERVER+REUSE | ●○○○○      | Operator parsing portable; execution server-side                     |

### Tier 1 - the editor (MVP-defining, see §7)

| Feature                         | Where                                          | Class           | Complexity |
| ------------------------------- | ---------------------------------------------- | --------------- | ---------- |
| Rich **rendering** (read view)  | new RN renderer over `richContent` JSON        | ADAPT           | ●●●○○      |
| Markdown **editing** (raw mode) | new RN `TextInput`/CodeMirror-less editor      | REWRITE (small) | ●●○○○      |
| Rich **editing** (block mode)   | BlockNote - DOM only, 69 files of custom specs | REWRITE (huge)  | ●●●●●      |

### Tier 2 - high value, post-MVP, mostly cheap (server already does the work)

| Feature                  | Class           | Complexity | Notes                                                                                           |
| ------------------------ | --------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| Journal                  | SERVER + new UI | ●●○○○      | Add `/api/workspace/journal/*`; plain-text editor is easy on mobile                             |
| Trash                    | SERVER + new UI | ●○○○○      | Endpoints + list UI                                                                             |
| Version history          | SERVER + new UI | ●●○○○      | Policy runs server-side already                                                                 |
| Tags/People overview     | SERVER + new UI | ●●○○○      | Read endpoints exist conceptually; chip rewrite stays server-side                               |
| AI actions               | SERVER          | ●●○○○      | `POST /api/ai` already session-authed + streaming; mobile = client only. Skip Ollama.           |
| Covers (render)          | REUSE           | ●○○○○      | URLs; upload later needs RN image compression (canvas-based `note-cover-image.ts` doesn't port) |
| Templates                | REUSE           | ●○○○○      | `domain/notes/templates.ts` is static data                                                      |
| Recents / quick switcher | ADAPT           | ●●○○○      | `fuzzy-match.ts` portable                                                                       |
| Push notifications       | NEW             | ●●●○○      | `Notification` model + SSE exist; native push (APNs/FCM via Expo) is net-new server work        |

### Tier 3 - expensive or genuinely hard on mobile

| Feature                                                    | Class            | Complexity | Why                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Offline-first + sync**                                   | NEW              | ●●●●●      | Nothing exists server-side beyond full export. Needs delta sync protocol, per-note conflict handling (LWW vs 3-way merge on markdown), local SQLite (`expo-sqlite`), outbox queue. The `tauri-backend.ts` + `write-queue.ts` + RQ-persistence patterns are good prior art but this is a project of its own. Do **read-cache offline** first (cheap), full offline-write later. |
| Real-time collab                                           | SKIP (long)      | ●●●●●      | Yjs provider could technically run in RN, but it's welded to BlockNote's collaboration option - pointless without the rich editor. Token mint endpoint is ready when the day comes.                                                                                                                                                                                            |
| Graph view                                                 | ADAPT            | ●●●○○      | Data from `getNoteGraph`; needs a Skia/SVG force layout - showpiece, not MVP                                                                                                                                                                                                                                                                                                   |
| Diagram (mermaid) block                                    | ADAPT            | ●●●○○      | Render via WebView or server-rendered SVG; edit = skip                                                                                                                                                                                                                                                                                                                         |
| Import/export                                              | SKIP             | ●●●○○      | Desktop/web job; mobile users won't unzip Obsidian vaults on a phone                                                                                                                                                                                                                                                                                                           |
| Sharing (create/manage)                                    | SERVER           | ●●○○○      | View shared notes = just URLs; management UI post-MVP                                                                                                                                                                                                                                                                                                                          |
| Vim mode, tabs/split, shortcuts                            | SKIP             | -          | Keyboard-culture features; split is _already_ disabled on mobile web (`use-notes-layout.ts` ~:290)                                                                                                                                                                                                                                                                             |
| Web clipper                                                | SKIP             | -          | iOS Share Extension is the mobile analog - nice post-MVP idea (reuses `/api/sync/capture` verbatim)                                                                                                                                                                                                                                                                            |
| Settings (12 sections)                                     | REWRITE (subset) | ●●○○○      | Mobile needs ~3 sections: account, appearance, about                                                                                                                                                                                                                                                                                                                           |
| Onboarding/seed, admin, marketing, dev-tools, desktop glue | SKIP             | -          | N/A                                                                                                                                                                                                                                                                                                                                                                            |

### Complexity heat summary

```
 trivial ────────────────────────────────────── project-sized
 templates      folders   auth(expo)   rich-render   BlockNote-on-mobile
 tags(read)     trash     REST layer   graph view    offline-first sync
 search(parse)  journal   AI client    diagrams      realtime collab
 covers(read)   versions  push-notifs
```

---

## 7. The editor problem

**Fact:** BlockNote (`@blocknote/mantine` + `@blocknote/core` + `@blocknote/react`) is ProseMirror on the DOM. The custom schema - blocks `procode`, `checkListItem`, `fileTree`, `diagram`; inline `noteLink`, `tag`, `person`, `user` (`features/editor/components/inline-specs/schema.ts`) - plus ~10 ProseMirror plugins (vim, search, selection bubble, AI streaming applier, chip nav) is the single largest DOM-coupled asset in the codebase. None of it runs in React Native.

**What survives:** the _document format_. `richContent` is plain JSON, and `domain/notes/rich-document.ts` parses/serializes it with only type-only BlockNote imports. Any mobile rendering/editing strategy works against that JSON + markdown, not against BlockNote the library.

### Options

|        | Strategy                                                                                                                                                                                                                                                                                                                                                      | Effort | Fidelity                                                                                                                     | Offline             | Verdict                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| **E1** | **Native read-view + markdown edit** - RN renderer component over `richContent` JSON (headings, lists, checkboxes, code w/ syntax highlight, tables, chips as colored pills, images); editing switches to a full-screen markdown `TextInput` with a formatting accessory bar; save with `preferredEditorMode:"raw"` semantics (server re-derives richContent) | ●●○○○  | Read: high. Edit: plain                                                                                                      | ✅                  | **MVP**                                                                     |
| **E2** | **WebView-hosted BlockNote** - bundle a tiny web page with the real editor + exact schema; bridge over `postMessage` (load doc, autosave, keyboard height, chip pickers native-side)                                                                                                                                                                          | ●●●●○  | Full parity incl. custom blocks                                                                                              | ✅ (asset is local) | **V2** - proven pattern; keyboard/scroll/IME quirks are where the time goes |
| **E3** | Native rich editor (10tap/Tentap = TipTap-in-RN, or expo-rich-text)                                                                                                                                                                                                                                                                                           | ●●●●●  | Partial - would need re-implementing every custom block + inline chip spec on a different schema, then a converter both ways | ✅                  | Not worth it; schema divergence forever                                     |
| **E4** | Markdown-only forever                                                                                                                                                                                                                                                                                                                                         | ●○○○○  | Low                                                                                                                          | ✅                  | Under-sells the product                                                     |

**Recommendation: E1 for MVP, E2 as the flagship V2 feature.** E1 alone is a legitimate mobile notes app (Bear/iA-Writer-shaped); E2 later gets full parity without a second schema. E3 is the trap.

One caution for E1's checkbox-toggle temptation: toggling a checkbox in the read view means mutating `richContent` JSON directly and serializing back to markdown. The portable `rich-document.ts` gives you the JSON side; the missing piece is a small pure-TS `richContent → markdown` emitter (the web calls `editor.blocksToMarkdownLossy()` on the live editor, which mobile won't have). The schema is small and fully known - writing that emitter (~1–2 days) unlocks _structured_ mutations (checkbox toggles, appends) without a full editor, and is also the enabler for share-sheet/append-to-note features later.

---

## 8. Portable domain layer

Verified free of `react`/`react-dom`/`next/*`/`window`/`document` imports (type-only imports noted):

| File (under `apps/web/src/`)                                                                           | What you get                                                                                                                                                                       | Caveat                                        |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `domain/notes/rich-document.ts`                                                                        | `markdownToRichDocument`, `parseInlineContent`, `flattenInlineChips`, `richDocumentToSearchableMarkdown`, `richDocumentKey`, `resolveRichDocument`, `extractRichDocumentPersonIds` | type-only `@blocknote/core`                   |
| `domain/notes/note-links.ts`                                                                           | `extractNoteLinks`, `extractNoteTags`, `normalizeNoteTitle`, `TAG_PATTERN`, wikilink resolver                                                                                      | -                                             |
| `domain/notes/note-link-sync.ts`                                                                       | `buildDesiredNoteLinkRows`                                                                                                                                                         | -                                             |
| `domain/notes/search-query.ts`                                                                         | `parseSearchQuery` (`tag:`/`#`, `person:`/`$`, free text)                                                                                                                          | -                                             |
| `domain/notes/search-snippet.ts`                                                                       | `buildSearchSnippet`                                                                                                                                                               | -                                             |
| `domain/notes/versioning.ts`                                                                           | version persistence policy                                                                                                                                                         | server runs it; portable if offline needs it  |
| `domain/notes/chip-rewrite.ts`                                                                         | tag/person rename propagation                                                                                                                                                      | server-side concern                           |
| `domain/notes/graph.ts`, `graph-from-notes.ts`                                                         | graph node/edge builders                                                                                                                                                           | -                                             |
| `domain/notes/templates.ts`, `properties.ts`, `note-id.ts`, `unlinked-mentions.ts`, `tag-detection.ts` | templates, property model, id gen                                                                                                                                                  | -                                             |
| `domain/tags/normalize.ts`                                                                             | `normalizeTagName`, `formatTagLabel`                                                                                                                                               | ⚠ two-normalizer gotcha - always use this one |
| `domain/data-transfer/frontmatter.ts`, `adapters/markdown-import-shared.ts`                            | frontmatter + import parsing                                                                                                                                                       | check zip paths for `node:` fs                |
| `core/workspace-backend/types.ts`, `note-builders.ts`, `write-queue.ts`, `capability-error.ts`         | the contract + shared impl helpers                                                                                                                                                 | -                                             |
| `shared/lib/diagram.ts`, `file-tree.ts`, `word-count.ts`, `fuzzy-match.ts`                             | fence detection, ASCII tree, word count, fuzzy search                                                                                                                              | -                                             |

**Not portable:** `domain/*/actions.ts` (`"use server"` - but they define the contract the REST layer wraps), `local-store.ts`/`local-backend.ts` (IndexedDB/`window`), `note-cover-image.ts` (canvas), everything in `features/*` and `providers/*`, `tauri-backend.ts` (`window.__TAURI__`).

**Rust layer:** nothing to port. `markdown.rs`/`content_analysis.rs` have TS twins (`use-rust-content-analysis.ts` already returns `null` off-Tauri and the TS path takes over); the rest is local-SQLite mirroring or desktop plumbing.

---

## 9. Proposed mobile architecture

### 9.1 Target shape

```
                        ┌────────────────────────────────────────┐
                        │  apps/mobile  (Expo, expo-router)      │
                        │  ┌──────────┐ ┌──────────┐ ┌────────┐  │
                        │  │ screens/ │ │ RN read- │ │ md     │  │
                        │  │ nav      │ │ renderer │ │ editor │  │
                        │  └────┬─────┘ └────┬─────┘ └───┬────┘  │
                        │       └── React Query (same keys) ──┐  │
                        │  ┌──────────────────────────────────▼┐ │
                        │  │ mobileBackend : WorkspaceBackend   │ │  ← 4th impl
                        │  │ fetch → /api/workspace/* (+ RQ     │ │
                        │  │ AsyncStorage persistence = offline │ │
                        │  │ READ cache, mirrors web RQ rules)  │ │
                        │  └──────────────┬─────────────────────┘ │
                        │  @better-auth/expo client (SecureStore) │
                        └─────────────────┼───────────────────────┘
                                          │ HTTPS (session cookie)
            ┌─────────────────────────────▼──────────────────────────────┐
            │ apps/web (Next.js on Vercel)                               │
            │  NEW: app/api/workspace/*  ──wraps──▶  domain/* cores      │
            │  lib/auth.ts + expo() plugin          (note-write-core,    │
            │  existing: /api/ai, /api/sync/*        link-sync,          │
            │                                        versioning, trash)  │
            └─────────────────────────────┬──────────────────────────────┘
                                          │ Prisma
                                     Neon Postgres

  shared code:   packages/domain (extracted from apps/web/src/domain + backend types)
                 consumed by: apps/web, packages/web-spa, apps/mobile
```

### 9.2 Package extraction (do this first, it de-risks everything)

Create `packages/domain` (`@skriuw/domain`) and move the §8 inventory into it, leaving re-export stubs at the old `@/domain/...` paths so the web app and desktop build don't churn. Contents: pure domain files + `workspace-backend/types.ts` + `note-builders.ts` + `write-queue.ts` + `shared/lib/{diagram,file-tree,word-count,fuzzy-match}.ts`. Constraints: no `@/` alias inside the package, no DOM/Next imports (enforce with an oxlint rule), `@blocknote/core` as a type-only dev dep. This is mechanical (~2–4 days) and immediately gives mobile, web, desktop, and the extension one source of truth.

### 9.3 The mobile backend (4th `WorkspaceBackend` implementation)

`apps/mobile/src/backend/http-backend.ts`, structurally a sibling of `tauri-backend.ts` (which is the best template - it already shows wire-shape mapping, write-queue usage, and capability declaration):

- `mode: "server"`-like semantics but its own tag (extend the union: `"mobile"`).
- MVP capabilities: everything `false` except core notes/folders/search.
- Wraps `fetch` against `/api/workspace/*` with the Better Auth Expo cookie attached.
- Writes serialized through the existing `write-queue.ts` per note id (prevents interleaved autosaves - same reason tauri/local use it).
- Echo suppression on refetch-after-save via `richDocumentKey()` (JSONB reorder lesson, §4.2).

### 9.4 State & offline (MVP posture)

- **React Query** with the same query-key discipline as web (`notesKeys.files(scope)` / `.detail(id)` from `features/notes/lib/notes-keys.ts` - move keys into the shared package too).
- **Offline READ**: RQ persister over AsyncStorage (or MMKV), persisting note bodies only - a direct port of `query-cache-persistence.tsx` rules (7-day maxAge, bodies-not-lists). Cheap, huge perceived-quality win: notes you've opened remain readable on the subway.
- **Offline WRITE**: _not in MVP._ Queue-and-replay with conflict UX is Tier-3 (§6). The write-queue + `updatedAt` preconditions in the REST layer are deliberate stepping stones toward it.

### 9.5 Expo stack choices

| Concern        | Choice                                                                                                                            | Note                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Framework      | Expo SDK (current), **expo-router**, dev-client builds via EAS                                                                    | You'll need a dev build (not Expo Go) once SecureStore + deep-link OAuth are in |
| Navigation     | expo-router stacks: `(auth)`, `(app)/notes`, `(app)/note/[id]`, `(app)/search`, `settings`                                        |                                                                                 |
| Auth storage   | `expo-secure-store` via `@better-auth/expo/client`                                                                                |                                                                                 |
| Data           | `@tanstack/react-query` (same major as web) + AsyncStorage/MMKV persister                                                         |                                                                                 |
| Markdown edit  | `TextInput` (multiline) + custom accessory toolbar; consider `react-native-live-markdown` (Expensify) for inline syntax highlight |                                                                                 |
| Rich read-view | hand-rolled RN components over `richContent` JSON (flat block list → `FlashList`)                                                 | code highlight: `react-native` Shiki is heavy - start with plain mono + bg      |
| Icons/emoji    | note `icon` is emoji/string - renders natively                                                                                    |                                                                                 |
| Styling        | your call; NativeWind if you want to share Tailwind muscle-memory, StyleSheet otherwise                                           | theme tokens can mirror the 3 web themes' `--theme-*` values                    |

### 9.6 What the web/server side must change (complete list)

1. `lib/auth.ts`: add `expo()` plugin + `skriuw://` (and dev scheme) to trusted origins.
2. New `app/api/workspace/*` route handlers (§5.3).
3. Extract `packages/domain` (§9.2) - refactor, not behavior change.
4. (Optional, later) `Notification` push fanout via Expo Push for mobile.

Nothing else. No schema migration, no changes to desktop or extension.

---

## 10. MVP scope: notes only

### 10.1 Product definition

> Sign in to your Skriuw account and have every note in your pocket: browse folders, search, read any note beautifully rendered, edit or capture in markdown. Online-required (with read cache for recently opened notes).

### 10.2 In scope

| Area          | Detail                                                                                                                                                                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | Email/password sign-in + sign-up; GitHub/Google OAuth if deep-linking cooperates early, else defer to 1.1                                                                                                                                                                                                                                     |
| Note list     | Folder tree + flat recent list; pull-to-refresh; note icons; sort per `sortOrder`                                                                                                                                                                                                                                                             |
| Search        | Server search w/ `tag:`/`#`/`person:` operators (parsing shared)                                                                                                                                                                                                                                                                              |
| Read view     | Native renderer for `richContent`: headings, paragraphs, lists, checklists (toggleable ✅ via the TS emitter, §7), quotes, code blocks, tables, images/covers, dividers; chips (`#tag` colored via tag meta, `[[wikilink]]` navigable, `$person`/`@user` as pills); diagram/file-tree blocks render as labeled code fences (graceful degrade) |
| Edit          | Markdown editor with accessory bar (bold/italic/heading/list/checkbox/link), autosave (debounced, write-queued), rename, move-to-folder                                                                                                                                                                                                       |
| Create/delete | New note (blank or template from `NOTE_TEMPLATES`), swipe-to-delete (server soft-deletes → recoverable from web trash)                                                                                                                                                                                                                        |
| Offline       | Read-only cache of opened notes + last list snapshot; clear "offline - read only" state                                                                                                                                                                                                                                                       |
| Settings      | Account (sign out, profile basics), appearance (theme light/dark/system), about                                                                                                                                                                                                                                                               |

### 10.3 Explicitly out (and where each lands)

Journal (V1.1) · trash UI (V1.1) · version history (V1.1) · AI actions (V1.1 - server route is ready) · tags/people management (V1.2) · rich block editing (V2 = WebView BlockNote) · graph (V2) · offline writes/sync (V2/V3) · collab (V3+) · sharing management, import/export, vim, tabs/split, clipper, covers upload, admin (web-only or V-later).

### 10.4 Build order

| Phase                | Work                                                                                                                                                        | Est.      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **0. Foundations**   | Extract `packages/domain`; add expo plugin to auth; scaffold `apps/mobile` in the workspace (Metro + bun workspace config); EAS dev build running on device | ~1 wk     |
| **1. API**           | `/api/workspace/*` routes + zod contracts + tests; verify from a script with a real session                                                                 | ~1–1.5 wk |
| **2. App shell**     | expo-router nav, auth screens + session persistence, RQ + persister wiring, `mobileBackend` impl                                                            | ~1–1.5 wk |
| **3. Browse & read** | Folder/list screens, search, the read-view renderer (the biggest pure-frontend chunk), chip rendering + wikilink nav                                        | ~1.5–2 wk |
| **4. Write**         | Markdown editor + accessory bar, autosave pipeline + write queue + echo suppression, create/rename/move/delete, checkbox toggling (TS emitter)              | ~1.5 wk   |
| **5. Polish & ship** | Offline read state, themes, haptics, error/empty states, icon/splash, TestFlight                                                                            | ~1 wk     |

**Total: ~6–9 weeks** single-developer, TestFlight-quality. Android afterwards is mostly QA + store work since Expo keeps it one codebase (budget ~1–2 weeks of Android-specific polish).

### 10.5 MVP acceptance checks

- Sign in on a cold install → full note tree < 2s on LTE.
- Open a heavily-formatted web-authored note (tables, code, chips, cover) → renders faithfully, no crashes on unknown blocks (forward-compatible fallback block: render as fenced text).
- Edit on phone → web shows the change (and a version snapshot) on next refetch; `richContent` correctly regenerated server-side; no typing echo/revert.
- Kill network → previously opened notes readable; edit affordance disabled with clear messaging.
- Note created on phone from template → opens correctly in the web block editor.

---

## 11. Post-MVP roadmap

1. **V1.1 (server-ready features, thin UI):** journal (plain-text entries fit mobile perfectly), AI actions sheet (summarize/rewrite/title via existing `/api/ai` streaming), version history list + restore, trash.
2. **V1.2:** tags/people browse screens, share-sheet "clip to Skriuw" (iOS Share Extension → `/api/sync/capture` verbatim), push notifications (Expo Push + `Notification` model).
3. **V2:** WebView BlockNote editor (full parity), graph view (Skia), cover upload, home-screen widgets / quick capture.
4. **V3:** offline-first writes (local SQLite + outbox + `updatedAt` preconditions grown into real sync), then evaluate collab.

---

## 12. Risks & open decisions

| Risk / decision                                                           | Impact                           | Mitigation                                                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth Expo plugin vs. current `better-auth` version compatibility   | blocks Phase 0                   | Spike it first - day 1 of Phase 0; fallback is Option B (SyncToken) as a temporary bridge                                                                 |
| OAuth deep-link flow on iOS (Google's WebView policy, `skriuw://` scheme) | sign-in friction                 | Ship email/password first; OAuth can trail                                                                                                                |
| Read-renderer fidelity drift as web adds block types                      | broken notes on old app versions | Renderer must have an explicit unknown-block fallback + a `richContent` schema version check                                                              |
| `richContent → markdown` TS emitter correctness (checkbox toggles)        | data corruption risk             | Property-test roundtrip against `markdownToRichDocument`; ship read-only checkboxes if not confident                                                      |
| Server actions ↔ REST drift (two write paths)                             | subtle divergence                | REST handlers must call the _same_ core functions (`note-write-core.ts` etc.) - enforce by review; long-term, migrate web fetches onto the REST layer too |
| Monorepo/Metro friction (bun workspaces + Expo)                           | tooling tax                      | Known-solvable (Metro `watchFolders` + workspace roots); keep `packages/domain` dependency-light                                                          |
| Scope creep toward the rich editor in MVP                                 | schedule ×2                      | E1/E2 split is the contract: MVP ships without BlockNote, period                                                                                          |

---

_Sources: repo exploration 2026-07-09 - `core/workspace-backend/_`, `prisma/schema.prisma`, `app/api/**`, `domain/**`, `features/\*_`, `apps/desktop/src-tauri/src/_`, `party/notes.ts`, `packages/web-spa/_`._
