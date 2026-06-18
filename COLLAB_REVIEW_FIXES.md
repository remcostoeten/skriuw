# Collaboration / Sharing — Review-Fix Execution Plan

> Self-contained plan to fix the regressions found while auditing + hardening the
> collaboration/sharing module. A fresh session can execute this end-to-end without
> re-discovering context. Hand each **Task** to a sub-agent (Agent tool).
>
> **Branch:** `daddy`  •  **No DB migration needed** (pure logic/UI changes).

---

## 0. Baseline — what is ALREADY in the working tree (uncommitted)

The first pass already landed these edits (do **not** redo them; they are the
substrate this plan builds on). Verify with `git diff HEAD --stat`; expected files:

- `src/domain/collaboration/queries.ts` — added owner guards to `getCollaborators` + `getPendingRequestsForNote` (C1, IDOR fix).
- `src/domain/collaboration/actions.ts` — atomic `respondToCollabRequest` (M2); `requestCollaboration` upsert + P2002 swallow (M3).
- `src/domain/persistence/guards.ts` — new `isUniqueConstraintError(error)` (P2002 helper).
- `src/domain/notes/note-access.ts` — **new** `resolveNoteAccess(db, userId, noteId) → { ownerId, role: "owner"|"editor"|"viewer" } | null`.
- `src/domain/notes/models.ts` — `NoteAccessRole` type; `NoteFile.ownerId?` + `NoteFile.access?`.
- `src/domain/notes/queries.ts` — `getNote` is now collaborator-aware; `recordToNoteFile(record, access?)`.
- `src/domain/notes/actions.ts` — `fetchNote` collaborator-aware; `updateNote` honors editor permission (writes versions/links under `ownerId`); `recordToNoteFile(record, access?)`; `fetchNotes` passes owner access.
- `src/features/editor/components/editor-container.tsx` — `readOnly={file?.access === "viewer"}`.
- `src/features/notes/components/metadata-panel.tsx` — `isOwner={file.access ? file.access === "owner" : true}`.

**Key invariant introduced:** reads (`getNote`/`fetchNote`) return a note when the
caller is the owner **or** an accepted `noteCollaborator`. `NoteFile.access` carries
the caller's role (`undefined` ⇒ owner's own note / legacy path). Editor writes are
bookkept under the **owner's** id (`ownerId`), not the editor's `user.id`.

The review below found that this `userId`→`ownerId` split, plus the new
collaborator-aware reads, created the regressions this plan fixes.

---

## 1. Findings to fix (ranked)

| # | Sev | File | Problem |
|---|-----|------|---------|
| 1 | 🔴 Critical | `src/domain/sharing/actions.ts` | `publishNote` calls collaborator-aware `getNote` with no owner check → a viewer/editor collaborator can publish a **public share link of the owner's note**. Share UI gated only on `<GuestGate>`, not ownership. |
| 2 | 🟡 Med | `src/domain/notes/queries.ts` + `actions.ts` | Editor versions are written under `ownerId` but `listNoteVersions`/`restoreNoteVersion` read by `user.id` → editor never sees/restores their own checkpoints. |
| 3 | 🟡 Med | `src/features/notes/server/backlinks-queries.ts` | `listNoteBacklinks` loads active note `where:{ userId: user.id }` → returns `[]` for editor collaborators (no backlinks on shared notes). |
| 4 | 🟡 Med | `query-cache-persistence.tsx`, `editor-container.tsx`, `metadata-panel.tsx` | UI gates fail **open** when `access` is `undefined`; reachable via un-busted IndexedDB body cache (`CACHE_VERSION = "v1"`) and stale-after-revoke snapshots. |
| 5 | 🟡 Med | `src/domain/notes/actions.ts` | `updateNote` runs `resolveNoteAccess` (extra `SELECT`) before every save → doubles round-trips on the owner autosave hot path. |
| 6 | 🟢 Low | `src/domain/collaboration/actions.ts` | `requestCollaboration` always creates a notification; concurrent P2002-swallow path → duplicate `collab_request` notifications. |
| 7 | 🟢 Low | `notes/queries.ts`, `notes/actions.ts`, `collaboration/queries.ts` | Duplication: `getNote`/`fetchNote` re-inline `resolveNoteAccess` logic; owner-guard copy-pasted twice. |

---

## 2. Tasks (assign to sub-agents)

> **File-ownership rule to avoid write conflicts:** `src/domain/notes/actions.ts`
> is touched by Task B *and* Task C (different functions). Run **B and C in the same
> agent, or sequentially** — never two parallel agents on `actions.ts`.
>
> **Parallel-safe batches:** `{A}`, `{B+C}`, `{D}`, `{E}` can each run concurrently.
> Run `{F: verify}` only after all others finish.

---

### Task A — 🔴 Close the `publishNote` ownership hole (+ audit all `getNote`/`fetchNote` callers)

**Files:** `src/domain/sharing/actions.ts`, `src/features/notes/components/metadata-panel.tsx` (+ audit-only across `src/`).

1. **Server guard (authoritative fix).** In `publishNote` (around line 67–103), after
   `const note = await getNote(validated.noteId);`, reject non-owners. `getNote` now
   returns `NoteFile.access`:
   ```ts
   const note = await getNote(validated.noteId);
   if (!note || (note.access && note.access !== "owner")) {
     throw new Error("Note not found");
   }
   ```
   (Keep the existing `if (!note) throw` behavior; the added clause blocks
   editor/viewer. `access === undefined` stays allowed = owner's own note.)

2. **Audit sibling sharing actions** in the same file: `updateNoteShareSettings`,
   `refreshNoteShareSnapshot`, `revokeNoteShare`, `getNoteShare`. Confirm each still
   guards with `noteShare.findFirst/updateMany({ ..., userId: user.id })` (they do —
   they are safe). Do **not** change them; just confirm in your report.

3. **UI gate.** In `metadata-panel.tsx`, the Share-link section (the `onShare`
   button / "Create link" / "Manage link", currently inside `<GuestGate feature="share">`,
   ~lines 289–340) must also be hidden for non-owners. Compute once near the top of
   the component, next to where `file` is available:
   ```ts
   const isOwnNote = !file?.access || file.access === "owner";
   ```
   and render the share affordance only when `isOwnNote`. (Mirror this for any
   "send/export as link" entry point that ends up calling `publishNote` /
   `resolveShareUrlForAction` — grep `use-note-send.ts` and `note-share-link.ts`.)

4. **Caller audit (report only, fix if clearly broken).** Grep `getNote(` and
   `fetchNote(` across `src/`. For each caller, confirm it does **not** assume the
   returned note is owned by the current user before doing an owner-only side effect.
   Known-safe: editor render, `use-note.ts`. Known-fixed-here: `publishNote`. Flag
   anything else (e.g. journal, AI actions) that mutates or shares based on a note
   that could now be collaborator-owned.

**Acceptance:** a viewer/editor collaborator calling `publishNote` (or clicking share)
gets "Note not found" / no share UI; owners are unaffected.

---

### Task B — 🟡 Make version history + restore collaborator-aware  *(same agent as C)*

**Files:** `src/domain/notes/queries.ts` (`listNoteVersions`), `src/domain/notes/actions.ts` (`restoreNoteVersion`, `fetchNoteVersions`), and reuse `resolveNoteAccess`.

Root cause: versions are stored under `ownerId`; reads filter by `user.id`.

1. **`listNoteVersions(noteId, limit)`** (`queries.ts`): resolve access, read under owner.
   ```ts
   import { resolveNoteAccess } from "@/domain/notes/note-access";
   ...
   export async function listNoteVersions(noteId: string, limit = 12): Promise<NoteVersion[]> {
     if (isGuestScopedId(noteId)) return [];
     const { prisma, user } = await getAuthenticatedUser();
     const access = await resolveNoteAccess(prisma, user.id, noteId);
     if (!access) return [];
     const records = await prisma.noteVersion.findMany({
       where: { userId: access.ownerId, noteId },   // was user.id
       orderBy: { createdAt: "desc" },
       take: limit,
     });
     return records.map(recordToNoteVersion);
   }
   ```

2. **`restoreNoteVersion(versionId)`** (`actions.ts`): currently every query is
   `userId: user.id`. An editor must be allowed to restore, with all bookkeeping under
   `ownerId`. Restructure:
   - Load the version by id **without** userId scoping: `tx.noteVersion.findUnique({ where: { id: versionId } })` (or `findFirst({ where: { id: versionId } })`). If missing → `{ versionCreated: false }`.
   - `const access = await resolveNoteAccess(tx, user.id, version.noteId);`
     `if (!access || access.role === "viewer") return { versionCreated: false };`
   - Load current note by id (not userId-scoped): `tx.note.findFirst({ where: { id: version.noteId, deletedAt: null } })`.
   - Replace every remaining `user.id` in this function with `access.ownerId` (the
     pre-restore snapshot insert, and the `tx.note.update` where-clause → use
     `{ id: version.noteId, deletedAt: null }` for editors, keep `userId`-scoped for owner
     if you prefer, but `access.ownerId` works for both).
   - Verify the restored version's `noteId` belongs to the same note (it does, by construction).

3. **`fetchNoteVersions(id)`** (`actions.ts`): it delegates to `listNoteVersions`, which
   is now access-aware — no change needed beyond confirming it doesn't re-scope by `user.id`.

**Acceptance:** an editor opens a shared note, creates a checkpoint, sees it in history,
and can restore it. Owner still sees the editor's versions in their own history.

---

### Task C — 🟡 Remove the extra `SELECT` on the owner autosave hot path  *(same agent as B)*

**File:** `src/domain/notes/actions.ts` (`updateNote`).

Current `updateNote` calls `resolveNoteAccess` (1 extra `SELECT`) before the
`tx.note.update`, on **every** save. The owner case (vast majority, fires on every
batched keystroke via the debounced save controller) previously was a single
`userId`-scoped `update`. Restore the owner fast-path: **attempt the cheap owner-scoped
update first; only resolve collaborator access on `P2025` (no owner row).**

Sketch (keep behavior identical for owner; collaborator path unchanged in effect):

```ts
export async function updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult> {
  const validated = parseServerInput(updateNoteInputSchema, input);
  const { prisma, user } = await getAuthenticatedUser();

  // Build the owner-capable patch (content/name/tags/editorMode + parentId/sortOrder).
  // For the owner this is the full patch; for an editor we strip parentId/sortOrder below.
  // ... (existing patch-building, but DON'T gate parentId/sortOrder yet) ...

  return prisma.$transaction(async (tx) => {
    // 1) Owner fast path: single round trip, no resolveNoteAccess.
    let record: NoteRecord | null = null;
    let ownerId = user.id;
    let role: NoteAccessRole = "owner";
    try {
      if (isOwnerParentChange) await assertOwnedParentFolder(tx, user.id, validated.parentId); // only if parentId provided
      record = await tx.note.update({
        where: { id: validated.id, userId: user.id, deletedAt: null },
        data: ownerPatch,
      });
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;
      // 2) Not the owner (or note gone). Resolve collaborator access.
      const access = await resolveNoteAccess(tx, user.id, validated.id);
      if (!access || access.role === "viewer") return { versionCreated: false };
      ownerId = access.ownerId;
      role = access.role; // "editor"
      // Rebuild patch WITHOUT parentId/sortOrder (owner-only org), then:
      try {
        record = await tx.note.update({
          where: { id: validated.id, deletedAt: null },
          data: editorPatch,
        });
      } catch (err2) {
        if (isRecordNotFoundError(err2)) return { versionCreated: false };
        throw err2;
      }
    }

    const updatedNote = recordToNoteFile(record, { ownerId, role });
    // ... syncNoteLinks(tx, ownerId, ...), insertNoteVersion(tx, ownerId, ...),
    //     updateExistingNoteVersion(tx, ownerId, ...) exactly as today ...
  });
}
```

Notes:
- `assertOwnedParentFolder` must run **before** the update only for the owner path and
  only when `validated.parentId !== undefined`. Inside the transaction is fine (it takes a
  `db` arg). If keeping it outside the tx is simpler, gate it on a cheap pre-check, but do
  **not** reintroduce an unconditional `resolveNoteAccess` for owners.
- The trade-off: an **editor** save now costs `failed-owner-update + resolveNoteAccess +
  editor-update` (≈3 trips), but editor saves are rare; owner saves (the hot path) return
  to **1 trip**. This is the right bias.
- Avoid duplicating the entire patch-building block; factor the parentId/sortOrder lines so
  the editor patch is "owner patch minus parentId/sortOrder" (e.g. build base patch, then
  conditionally add org fields, and drop them on the editor branch).

**Acceptance:** owner autosave issues exactly one note write query (verify by reading the
code path / optional query log); editor edits still persist; viewers still no-op.

**⚠️ Because B and C both edit `actions.ts`, do them in one agent. Re-run `bunx tsc --noEmit` after.**

---

### Task D — 🟡 Fail-closed UI gates + bust the stale body cache

**Files:** `src/providers/query-cache-persistence.tsx`, `src/features/editor/components/editor-container.tsx`, `src/features/notes/components/metadata-panel.tsx`.

1. **Bust the IndexedDB cache.** In `query-cache-persistence.tsx`, bump
   `CACHE_VERSION` (currently `"v1"` ~line 13, used as `buster` ~line 59) to `"v2"`.
   This discards pre-change persisted note bodies that lack `access`, removing the
   "shared note hydrates with `access: undefined`" path.

2. **Editor read-only — fail closed.** In `editor-container.tsx`, a shared note must be
   editable **only** for owner/editor. Change:
   ```ts
   // before: readOnly={file?.access === "viewer"}
   readOnly={!!file && file.access !== undefined && file.access !== "owner" && file.access !== "editor"}
   ```
   Rationale: `access === undefined` legitimately means the owner's own note (editable),
   so we keep that editable, but any explicit non-owner/non-editor role (i.e. `"viewer"`,
   or a future role) is read-only. Equivalent to `file?.access === "viewer"` today but
   robust to new roles. **If you prefer strict fail-closed even for `undefined`**, that
   would break the owner's freshly-created notes (which have `access === undefined`) — do
   NOT do that unless Task E also sets `access: "owner"` on every owner read/create path.

3. **Collaborator section / share gate.** `metadata-panel.tsx` already computes
   `isOwner={file.access ? file.access === "owner" : true}`. Leave the `undefined ⇒ owner`
   default (correct for owner's own notes once the cache is busted), but ensure the
   **share** affordance uses the `isOwnNote` gate added in Task A. No further change if
   Task A covered the share UI.

4. **Revoke staleness (note only, optional).** After an owner revokes/downgrades a
   collaborator, the collaborator's open editor can hold a stale `access`. Server already
   enforces (writes no-op). If you want belt-and-suspenders, invalidate
   `notesKeys.detail(noteId)` when the `["shared-notes"]` query result drops a note or
   changes its permission. Document as a follow-up if not done.

**Acceptance:** old persisted snapshots are dropped on next load; a viewer never gets a
writable surface; owner's own notes remain fully editable.

---

### Task E — 🟢 Cleanup: consolidate the access logic (optional, do last)

**Files:** `src/domain/notes/note-access.ts`, `src/domain/notes/queries.ts`, `src/domain/notes/actions.ts`, `src/domain/persistence/guards.ts`, `src/domain/collaboration/queries.ts`.

1. Add a record-returning sibling in `note-access.ts` so `getNote`/`fetchNote` stop
   re-inlining the owner-check + `noteCollaborator.findUnique` + permission mapping:
   ```ts
   export type ResolvedNoteWithAccess = { record: /* full note row */; ownerId: string; role: NoteAccessRole };
   export async function resolveReadableNote(db, userId, noteId): Promise<ResolvedNoteWithAccess | null> { ... }
   ```
   Then `getNote`/`fetchNote` become: resolve → `recordToNoteFile(record, { ownerId, role })`.
   Keeps the "single authorization gate" promise the `note-access.ts` docstring makes.
2. Extract the copy-pasted owner guard in `collaboration/queries.ts` (`getCollaborators`,
   `getPendingRequestsForNote`) into `assertOwnsNote(db, userId, noteId): Promise<boolean>`
   in `persistence/guards.ts`, mirroring `assertOwnedParentFolder`.
3. (Trivial) `recordToNoteFile` mutate-then-return → spread:
   `return access ? { ...base, ownerId: access.ownerId, access: access.role } : base;`
   Note this function is duplicated across `queries.ts` and `actions.ts` (pre-existing);
   consider hoisting to a shared mapper if cheap, otherwise leave.

**Acceptance:** no behavior change; `tsc` + tests green; the three access call-sites share one implementation.

---

### Task F — ✅ Verify (run after A–E)

Run from repo root `/home/remcostoeten/dev/skriuw`:

```bash
bunx tsc --noEmit 2>&1 | grep -vE '^__tests__/' | grep 'error TS'   # expect empty
bun run lint 2>&1 | grep -iE 'error'                                 # expect no NEW errors
bun test __tests__/domain/notes/mappers.test.ts
bun test __tests__/features/notes/store.test.ts
```

Pre-existing `tsc` errors live only in `__tests__/domain/notes/rich-document.test.ts`
and `__tests__/shared/api/use-api-mutation.test.ts` — unrelated, ignore them.

**Manual smoke (recommended, can't be automated here):** two accounts —
1. Owner shares note → invites account B as **editor** → B opens it, edits, reloads → edit persists; B sees version history + backlinks.
2. Owner invites B as **viewer** → B's editor is read-only; B cannot publish a share link; `publishNote` from B is rejected.
3. Owner **revokes** B → B can no longer open/edit.

### Suggested new automated tests (Task B/A coverage)
- `updateNote` as editor persists content; as viewer no-ops (`versionCreated:false`, no `note`).
- `publishNote` as non-owner collaborator throws / returns no share.
- `listNoteVersions` returns the owner-stored versions for an editor.

---

## 3. Execution order summary

```
Batch 1 (parallel):  Task A  |  Task B+C (one agent, actions.ts)  |  Task D
Batch 2:             Task E (cleanup, optional)
Batch 3:             Task F (verify) — gate before commit
```

Do **not** commit/push unless the user asks. When committing, end the message with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
