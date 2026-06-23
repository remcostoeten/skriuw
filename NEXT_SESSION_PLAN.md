# Next Session Plan

Two tracks: **infra hardening** (quick wins) and **real-time collaboration** (bigger lift).

---

## Track 1 — Infra Hardening

### 1A. Add `prisma migrate deploy` to Vercel build

**Problem:** `vercel.json` / `package.json` build script only runs `prisma generate`. Any future schema
migration applied locally will silently not exist in prod until someone manually runs
`prisma migrate deploy` against Neon — exactly what caused the June 2026 500 outage.

**Fix:**
- Open `package.json` and change the build script from:
  ```
  "build": "prisma generate && next build"
  ```
  to:
  ```
  "build": "prisma generate && prisma migrate deploy && next build"
  ```
- The `DATABASE_URL` env var is already set in Vercel (it's what powers the app).
  `migrate deploy` is idempotent — it only runs unapplied migrations.
- Verify by checking `vercel.json` too — if it overrides the build command, update it there instead.

**Files to check:** `package.json` (build script), `vercel.json` (buildCommand field if present).

---

### 1B. SSE stream auth timeout

**Problem:** A tab that logs out (or whose session expires) still holds an open `EventSource` to
`/api/notifications/stream`. It keeps polling until the server eventually returns a 401 and the
browser closes the connection — but with no exponential backoff, a dead session can hammer the
endpoint indefinitely.

**Fix:**
- In `src/app/api/notifications/stream/route.ts` (or wherever the SSE handler lives):
  - Return `401` immediately if `getAuthenticatedUser()` fails — this tells the browser to not retry.
  - The EventSource spec says the browser will NOT auto-reconnect on a 4xx, so this is sufficient.
- In `src/features/notifications/hooks/use-notifications.ts`:
  - In `openSharedSource`, handle `source.onerror` more carefully: if the server sent a 401, don't
    reopen. Currently `onerror` just closes and nulls `sharedSource` — the next mount will reopen it.
  - Add a simple "error count" guard: if `errorCount >= 3`, stop reopening and clear the subscription.

**Files:** `src/app/api/notifications/stream/route.ts`, `src/features/notifications/hooks/use-notifications.ts`.

---

### 1C. Commit everything from the previous session

All the collaboration + notifications work is uncommitted. Stage and commit these files on branch `daddy`:

```
prisma/migrations/20260618000000_add_collaboration_tables/
prisma/migrations/20260618000001_add_journal_deleted_at_index/
src/domain/sharing/actions.ts
src/features/notes/components/metadata-panel.tsx
src/domain/notes/queries.ts
src/domain/notes/actions.ts
src/features/notes/server/backlinks-queries.ts
src/providers/query-cache-persistence.tsx
src/features/editor/components/editor-container.tsx
src/domain/notes/note-access.ts
src/domain/persistence/guards.ts
src/domain/collaboration/queries.ts
src/domain/collaboration/actions.ts
src/features/collaboration/lib/pending-collab.ts
src/features/collaboration/components/collab-request-button.tsx
src/features/collaboration/components/pending-collab-replay.tsx
src/providers/app-providers.tsx
src/features/notes/components/sidebar/shared-section.tsx
src/features/sharing/hooks/use-note-sharing.ts
src/features/collaboration/components/collaborators-section.tsx
src/features/notifications/hooks/use-notifications.ts
src/features/notifications/components/notification-bell.tsx
src/features/layout/components/icon-rail.tsx
src/features/notes/components/sidebar-panel.tsx
```

---

## Track 2 — Real-Time Collaboration

### Context

Currently two editors on the same note will silently overwrite each other — last `updateNote` call
wins. The editor is TipTap (ProseMirror under the hood).

### Chosen approach: Yjs + y-partykit (or Liveblocks)

**Option A — Yjs + PartyKit (self-hosted, cheaper at scale)**
- Yjs is a CRDT library that integrates directly with TipTap via `@tiptap/extension-collaboration`.
- PartyKit is a Cloudflare Workers-based WebSocket host for Yjs rooms — free tier is generous,
  deploys to edge, no server to maintain.
- TipTap's `Collaboration` extension replaces the default content model with a `Y.Doc`.

**Option B — Liveblocks (managed, easier setup)**
- Liveblocks provides a hosted Yjs backend + presence out of the box.
- Has a TipTap integration (`@liveblocks/yjs`).
- Costs money at scale but zero infra to run.

**Recommendation:** Start with **Liveblocks** for speed (one weekend), migrate to PartyKit later
if cost becomes an issue.

---

### Implementation steps (whichever backend)

#### Step 1 — Schema / room naming

Each note gets a room ID. Use the note's `id` directly: `room:${noteId}`.
Access is gated at the room-auth endpoint (Step 2).

#### Step 2 — Room auth endpoint

Create `src/app/api/collaboration/auth/route.ts`:
- Call `getAuthenticatedUser()`.
- Call `resolveNoteAccess(prisma, user.id, noteId)` — the existing access resolver.
- If `role === "viewer"` → grant read-only token. If `editor` or `owner` → grant write token.
- If no access → 403.

This reuses the exact same access model already in place. No new permission logic needed.

#### Step 3 — TipTap editor integration

In `src/features/editor/components/editor-container.tsx`:
- Add `@tiptap/extension-collaboration` and `@tiptap/extension-collaboration-cursor`.
- Wrap the editor in a Liveblocks/Yjs provider when `file.access !== undefined` (i.e. shared note).
  For owned notes with no collaborators, keep the existing plain editor — no CRDT overhead.
- The `CollaborationCursor` extension shows other users' cursors with their name + a color derived
  from their user ID.

#### Step 4 — Presence (cursors + who's online)

The collaboration cursor extension handles this automatically once the Yjs provider is connected.
Show a small avatar row in the editor toolbar for users currently in the same room.

#### Step 5 — Saving

With Yjs, the `Y.Doc` is the source of truth, not the ProseMirror JSON. Two options:
- **Option A (simpler):** Keep the existing `updateNote` debounced save — TipTap still emits
  `onUpdate` events from Yjs changes. The CRDT prevents conflicts; the save is just persistence.
  Risk: rapid concurrent edits may cause more saves. Mitigate by keeping the 1500ms debounce.
- **Option B (cleaner):** Save the Yjs binary snapshot (`Y.encodeStateAsUpdate`) alongside the
  JSON content in a new `ydoc` column on `Note`. On load, hydrate from the snapshot if present.
  This avoids JSON round-trip drift. Requires a migration (`ALTER TABLE "Note" ADD COLUMN ydoc BYTEA`).

Start with **Option A** — it's zero-schema-change and the existing save path already works.

#### Step 6 — Conflict UI (offline / stale tab)

Currently a stale tab can overwrite on reconnect. With Yjs this is handled automatically — the CRDT
merges edits. But display a "you're offline" banner when the WebSocket disconnects so the user knows
their edits are queued.

---

### Files to create / modify for Track 2

| File | Action |
|------|--------|
| `src/app/api/collaboration/auth/route.ts` | New — room auth endpoint |
| `src/features/editor/components/editor-container.tsx` | Add Yjs/Liveblocks provider + cursor extension |
| `src/features/editor/components/editor-toolbar.tsx` | Add presence avatar row (optional, polish) |
| `prisma/schema.prisma` | Optional: add `ydoc Bytes?` to `Note` model (Step 5B only) |
| `package.json` | Add `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `@liveblocks/react`, `@liveblocks/yjs` (or `yjs`, `y-partykit`) |

---

## Order of attack for next session

1. `1C` — commit everything first so the branch is clean
2. `1A` — add migrate deploy to build (5 min)
3. `1B` — SSE auth timeout fix (20 min)
4. `2` — real-time collab (biggest chunk; do Step 1–3 first, presence and ydoc snapshot are polish)
