# Right Path: scaling the notes data layer

> Status: design proposal. Companion to PR #107 (note-link/tag inline chips).
> The chips ship today on the existing eager-loaded data layer. This doc
> describes the larger refactor we should plan for next, before workspaces
> grow beyond a few hundred notes.

## Problem

`src/domain/notes/api.ts → listNotes()` runs `select("*")` over the full
`notes` table for the signed-in user. Every cell — including the full
`content` (markdown) and `rich_content` (BlockNote JSON) — is shipped to
the browser, kept in `useNotes()`'s react-query cache, and held in memory
for the lifetime of the session.

Rough budgets:

| Notes | Avg payload per note | Total transfer |
|-------|----------------------|----------------|
| 100   | 5 KB                 | 0.5 MB         |
| 1 000 | 5 KB                 | 5 MB           |
| 1 000 | 50 KB                | 50 MB          |
| 5 000 | 50 KB                | 250 MB         |

Beyond ~1k notes this becomes:

- Slow first paint (network + JSON parse cost).
- Memory pressure on lower-end devices.
- Wasted bandwidth on phones / metered connections.
- Wasted server-side reads on Supabase.

The note link / tag chips don't need any of that — they only need `{id,
name, tags?}` to resolve a target. The active editor is the only consumer
of `content` / `rich_content`.

## Proposed split

Two endpoints, two react-query keys:

### 1. `listNoteMetadata()`

```ts
// src/domain/notes/api.ts
export type NoteMetadata = {
  id: string;
  name: string;
  parentId: string | null;
  tags: string[];
  preferredEditorMode: NoteEditorMode;
  createdAt: Date;
  modifiedAt: Date;
};

export async function listNoteMetadata(): Promise<NoteMetadata[]> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("notes")
    .select("id, name, parent_id, tags, preferred_editor_mode, created_at, updated_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToNoteMetadata);
}
```

Cheap, tiny rows. Drives:

- Sidebar tree.
- Command palette / search-by-title.
- Backlink chip resolution (only needs `{id, name}`).
- Backlinks panel "Outgoing / Incoming" lists (target metadata only).

### 2. `getNote(id)`

```ts
export async function getNote(id: string): Promise<NoteFile | null> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToNoteFile(data) : null;
}
```

Called when a note becomes active. react-query caches per-id, so flipping
back to a recently-viewed note is instant.

### Wiring

- `useNotes()` → split into `useNoteMetadata()` (today's eager list, slimmer)
  and `useActiveNote(id)` (per-id fetch).
- `useNotesLayout` reads `useNoteMetadata()` for the sidebar / indexes and
  `useActiveNote(activeFileId)` for the editor.
- Editor receives `metadata: NoteMetadata[]` for chip resolution instead of
  full `files: NoteFile[]`.

### Migration plan

1. Land metadata endpoint and `useNoteMetadata` alongside the existing
   `useNotes`. Sidebar + chip resolver migrate first (no behavior change,
   just less data per render).
2. Add `useActiveNote(id)`. Editor reads from it; falls back to the existing
   `files.find(...)` path until parity is verified.
3. Remove the old `listNotes()` + `useNotes()` after the editor migration.
4. Update `buildNoteLinkIndex` to take metadata-only inputs. The link
   extractor still needs *content* of every note to compute incoming links,
   which kills the savings — see "Backlinks index" below.

## Backlinks index

Once we stop shipping every note's content, `buildNoteLinkIndex` can no
longer scan in-browser. Three options:

| Option | Where | Cost | Notes |
|--------|-------|------|-------|
| A. Server search per active note | Postgres `LIKE '%[[Title]]%'` or `tsvector` | Per-note query on activate | Cheap, simple, lives next to `getNote`. |
| B. Materialized `note_links` table | Trigger on note save | Constant query cost; trigger writes on every save | Best for read-heavy workloads + graph views. |
| C. Edge function index | Cron / on-write | Periodic | Stale until rebuild; not great. |

Recommend **A** for now (Postgres regex / FTS), upgrade to **B** when we
need the graph view or "what links here" sidebar to feel instant on 5k+
notes. The chip click flow is unaffected — chips only need target
metadata, never source content.

## Risks

- Hydration mismatch: Supabase RLS + per-id queries multiply request
  count. Use react-query batching (`select` over multiple ids) where the
  UI naturally batches (e.g. backlinks panel pre-fetch).
- Stale tags: `tags` lives on the metadata row but is currently derived
  from `extractNoteTags(content)` on load. Move tag derivation server-side
  (trigger or Postgres generated column) so the metadata row is the source
  of truth.
- Editor state on swap: the active editor cache must not flush richContent
  until the new note's `getNote(id)` resolves; otherwise we get a flash of
  empty editor. Suspense + a skeleton, or keep last content visible.

## Out of scope (separate doc)

- Adaptive prefetch — see `preload-algorithm.md`.
- Offline / local-first sync.
- Multi-workspace fan-out.
