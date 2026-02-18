# SKRIUW — Engineering Specification & Fix Plan

> **For AI Agents**: This document is the single source of truth for all planned work. Read it fully before touching any code. Each chapter is self-contained and can be executed independently. Do not skip the "Do Not Touch" and "UI Preservation" sections.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [Tech Stack Reference](#3-tech-stack-reference)
4. [UI & Design System — DO NOT CHANGE](#4-ui--design-system--do-not-change)
5. [Architecture Diagnosis](#5-architecture-diagnosis)
6. [Chapter 1 — Editor State Rewrite](#chapter-1--editor-state-rewrite)
7. [Chapter 2 — Mutation & Cache Strategy](#chapter-2--mutation--cache-strategy)
8. [Chapter 3 — Auth UI Wiring](#chapter-3--auth-ui-wiring)
9. [Chapter 4 — Task Persistence Fix](#chapter-4--task-persistence-fix)
10. [Chapter 5 — Navigation & Loading Flicker](#chapter-5--navigation--loading-flicker)
11. [Chapter 6 — Sidebar & Pin UX](#chapter-6--sidebar--pin-ux)
12. [Chapter 7 — Context Menu Polish](#chapter-7--context-menu-polish)
13. [Chapter 8 — Z-Index & Popover Stacking](#chapter-8--z-index--popover-stacking)
14. [Chapter 9 — Elysia Backend Extraction](#chapter-9--elysia-backend-extraction)
15. [Chapter 10 — Monorepo Cleanup](#chapter-10--monorepo-cleanup)
16. [Testing Expectations](#16-testing-expectations)
17. [Shared Invariants](#17-shared-invariants)

---

## 1. Project Overview

**Skriuw** is a Notion/Obsidian-style note-taking app. Its core value is speed and a clean editor experience, not feature breadth.

**Scope (in):**
- Fast, reliable single-pane note editor
- Folder/note tree in sidebar
- Tasks embedded in notes (via BlockNote slash command)
- Demo mode (guest, localStorage) → Auth (server, PostgreSQL)
- Web (Next.js), Desktop (Tauri 2), Mobile (future Expo)

**Scope (out — do not build or fix):**
- S3 / file storage connectors
- Split-view editor (dropped requirement)
- Real-time collaboration
- Settings complexity beyond basic preferences

---

## 2. Repository Layout

```
skriuw-monorepo/
├── apps/
│   ├── web/                         ← Next.js 16 (App Router), primary runtime
│   │   ├── app/                     ← Next.js routes
│   │   │   ├── (app)/               ← Authenticated app shell
│   │   │   │   ├── note/[...slug]/  ← Note editor page
│   │   │   │   ├── tasks/           ← Task list page
│   │   │   │   ├── archive/         ← Trash/import/export
│   │   │   │   └── profile/         ← User profile
│   │   │   ├── (auth)/              ← Auth pages (login)
│   │   │   ├── api/                 ← Next.js API routes
│   │   │   └── page.tsx             ← Root (landing / redirect)
│   │   ├── features/                ← Feature-colocated code
│   │   │   ├── editor/              ← BlockNote editor, hooks, blocks
│   │   │   ├── notes/               ← Note CRUD, context, hooks
│   │   │   ├── tasks/               ← Task CRUD, detail panel
│   │   │   ├── authentication/      ← Auth forms, guards
│   │   │   ├── settings/            ← User preferences
│   │   │   ├── shortcuts/           ← Keyboard shortcuts
│   │   │   ├── search/              ← Full-text search
│   │   │   ├── activity/            ← Activity tracking
│   │   │   ├── ai/                  ← AI prompt integration
│   │   │   └── uploads/             ← File uploads
│   │   ├── components/              ← Cross-feature UI
│   │   │   ├── layout/              ← App shell, toolbars, sidebars
│   │   │   ├── sidebar/             ← Left sidebar tree
│   │   │   └── right-sidebar/       ← TOC, backlinks
│   │   ├── stores/                  ← Zustand UI stores
│   │   │   └── ui-store.ts          ← Sidebar, task panel, modal state
│   │   ├── lib/                     ← Non-feature utilities
│   │   ├── modules/                 ← Larger self-contained modules
│   │   ├── hooks/                   ← Generic React hooks
│   │   ├── styles/
│   │   │   └── globals.css          ← Tailwind v4 theme + CSS vars (DO NOT CHANGE)
│   │   └── src-tauri/               ← Tauri desktop configuration
│   ├── desktop/                     ← Tauri desktop app wrapper
│   └── mobile/                      ← Future Expo mobile app
├── packages/
│   ├── db/                          ← Drizzle schema + migrations
│   │   └── src/schema.ts            ← Single schema file (DO NOT RESTRUCTURE)
│   ├── crud/                        ← Client data abstraction (guest/server adapter)
│   ├── ui/                          ← Shared component library
│   ├── shared/                      ← Shared utilities, types, constants
│   ├── config/                      ← ESLint/TS config packages
│   ├── style/                       ← Prettier/lint tooling
│   └── env/                         ← Zod env validation
├── AGENTS.md                        ← Root agent rules (read this too)
├── docs/
│   └── SPEC.md                      ← THIS FILE
└── problems.md                      ← Original bug report list
```

---

## 3. Tech Stack Reference

| Concern | Library / Tool | Version | Notes |
|---|---|---|---|
| Runtime | Bun | 1.3.3 | Use `bun` for all installs/runs |
| Monorepo | Turbo | ^2.6.2 | `turbo.json` at root |
| Frontend | Next.js | 16.1.6 | App Router, `force-dynamic` at root layout |
| UI Framework | React | 19.2.0 | |
| Styling | Tailwind CSS | v4 | CSS-first config via `globals.css` `@theme` |
| Editor | BlockNote | ^0.44.2 | `@blocknote/core` + `@blocknote/react` |
| Server State | TanStack Query | ^5.90.16 | Primary async state manager |
| Client State | Zustand | ^5.0.8 | UI-only state (sidebars, panels) |
| Database | PostgreSQL | hosted (Neon) | Via `packages/db` |
| ORM | Drizzle | ^0.44.7 | Schema at `packages/db/src/schema.ts` |
| Auth | Better Auth | ^1.4.5 | `lib/auth-client.ts` for client hooks |
| Desktop | Tauri | 2.0 | `apps/web/src-tauri/` |
| Animations | Framer Motion | ^12.23.12 | Use sparingly, prefer CSS |
| Type Checking | TypeScript | 5.9.3 | `bun run check-types` to validate |
| Testing | Bun test | built-in | `bun run test` |

### Key Internal Packages

| Import Path | Source | Purpose |
|---|---|---|
| `@skriuw/db` | `packages/db` | Drizzle schema types |
| `@skriuw/crud` | `packages/crud` | Guest/server data adapter |
| `@skriuw/ui` | `packages/ui` | Component library |
| `@skriuw/shared` | `packages/shared` | Utilities, `generateId`, `GUEST_USER_ID`, `cn` |

### Key Internal Paths (apps/web)

| Import Alias | Resolves To |
|---|---|
| `@/features/...` | `apps/web/features/...` |
| `@/components/...` | `apps/web/components/...` |
| `@/lib/...` | `apps/web/lib/...` |
| `@/stores/...` | `apps/web/stores/...` |
| `@/hooks/...` | `apps/web/hooks/...` |

### Auth Pattern

```ts
// Client-side session
import { useSession } from '@/lib/auth-client'
const { data: session } = useSession()
const userId = session?.user?.id ?? GUEST_USER_ID

// Guest detection
import { isGuestUserId, GUEST_USER_ID } from '@skriuw/shared'
if (isGuestUserId(userId)) { /* use localStorage */ }
```

### Commands

```bash
bun run dev          # Start Next.js dev server
bun run check-types  # TypeScript validation (ALWAYS run after changes)
bun run test         # Run tests
bun run build        # Production build
bun run dbpush       # Push Drizzle schema to DB
bun run lint         # ESLint
```

---

## 4. UI & Design System — DO NOT CHANGE

**This is a hard constraint across all chapters.** The visual design, feel, and component library must remain identical. No agent should alter:

### CSS Variables & Theme

Defined in `apps/web/styles/globals.css`. The full token set:

```
Light mode root:
  --background: 0 0% 100%
  --background-secondary: 0 0% 96%
  --foreground: 0 0% 20%
  --primary: 222 47% 11%
  --secondary: 220 14% 96%
  --muted: 220 14% 96%
  --muted-foreground: 0 0% 46%
  --border: 220 13% 91%
  --brand-400: 167.8 53.25% 65%
  --brand-500: 167.8 53.25% 54.71%
  --radius: 0.375rem

Dark mode (.dark):
  --background: 0 0% 7%
  --background-secondary: 0 0% 8.6%
  --foreground: 0 0% 85%
  --primary: 0 0% 90%
  --secondary: 0 0% 18%
  --muted: 0 0% 18%
  --muted-foreground: 0 0% 55%
  --border: 0 0% 18%

Typography:
  --font-sans: 'Ubuntu Sans', system-ui, -apple-system, sans-serif
  Code: 'Fira Code'
  Prose: 'Inter'
```

### Preserved Components (use as-is, never replace)

- All components from `@skriuw/ui` — `Button`, `Checkbox`, `EmptyState`, `Icons`, etc.
- `components/sidebar/` — the entire sidebar tree
- `components/layout/` — app shell, toolbars, window controls
- `features/editor/components/editor-wrapper.tsx` — the outer editor shell
- `features/editor/components/editor-header.tsx` — title, icon, cover, tags
- `features/editor/components/bottom-command-surface.tsx` — mobile command bar
- All CSS in `features/editor/styles/editor.css`

### What "Same Look and Feel" Means

When fixing logic bugs:
1. Never change classNames on existing components unless directly fixing a visual bug.
2. Never swap a component for a different primitive (e.g. don't replace `Button` from `@skriuw/ui` with a native `<button>`).
3. Never remove animations that already exist.
4. Skeleton loaders must match the existing pattern: `animate-pulse` with `bg-muted/50` and `bg-muted/30` divs.
5. Dark mode must work. Test both `light` and `dark` themes.

---

## 5. Architecture Diagnosis

### Root Cause: Triple State Desync

The editor has three independent state owners fighting each other:

```
Layer 1: TanStack Query cache
         notesKeys.list(userId) → Item[]
         This is the server/localStorage source of truth.

Layer 2: Local useState in use-editor.ts
         const [note, setNote] = useState<Note | null>(null)
         This is a LOCAL COPY of the note, loaded from Layer 1.

Layer 3: BlockNote internal ProseMirror state
         editor.document → Block[]
         This is the editor's own copy of the content.
```

**The failure modes:**

1. `useCreateBlockNote({ initialContent })` only reads `initialContent` at mount time. When you navigate to a different note, `initialContent` changes but the editor ignores it — it already has state.

2. The `replaceBlocks` + `queueMicrotask` + `hasInitializedRef` patch in `use-editor.ts` is a timing hack that races against React re-renders.

3. Every save calls `onSettled: () => invalidateQueries({ queryKey: notesKeys.list(userId) })`, which triggers a full refetch of ALL notes — causing the "flicker" on every keystroke debounce.

4. `NoteEditor` holds its own `useState` for `icon`, `coverImage`, and `tags` that are synced from the note via a `useEffect` — yet another layer that can lag behind the actual data.

### Root Cause: Task Slash-Menu Disconnect

The task block created by the slash menu (`task-block.tsx`) renders a UI block in BlockNote immediately, but the underlying DB record is only created when `handleSave` runs and `syncTasks` fires. If navigation happens before save completes, or if the blockId doesn't match what the task panel queries, the panel opens to "not found".

### Root Cause: Save Invalidation Flood

`useUpdateNoteMutation` has both `onMutate` (optimistic update, correct) AND `onSettled: invalidateQueries` (refetch everything, wrong). The optimistic update already keeps the UI correct. The `onSettled` invalidation forces a server round-trip and refetch on every debounced save — that's the flicker.

---

## Chapter 1 — Editor State Rewrite

**File:** `apps/web/features/editor/hooks/use-editor.ts`
**Dependencies:** `apps/web/features/editor/components/note-editor.tsx`

**Goal:** Eliminate the triple-state problem. The editor must have exactly one source of truth: TanStack Query. The editor instance must be clean-mounted per note via React's `key` prop.

### What Is Broken

```
use-editor.ts currently:
  1. Loads note data via getNote() (async, goes through context → findNoteInTree)
  2. Copies it into local useState<Note>
  3. Creates BlockNote editor with useMemo'd initialContent
  4. On note change: patches editor via replaceBlocks() inside queueMicrotask
  5. Uses hasInitializedRef to prevent double-patching
  6. Auto-save debounce fires handleSave every 1000ms
  7. handleSave calls updateNote → onSettled invalidates all notes
```

### The Fix

**Step 1: Remove local `useState<Note>` from `use-editor.ts`**

Replace the async `getNote` + `useState` pattern with direct usage of `useNoteQuery(noteId)` from `use-notes-query.ts`. This hook already exists and returns `{ data: note, isLoading, error }` from TanStack Query.

```ts
// BEFORE (broken)
const [note, setNote] = useState<Note | null>(null)
useEffect(() => {
  const loadNote = async () => {
    const noteData = await getNote(noteId) // goes through context tree search
    setNote(noteData)
  }
  loadNote()
}, [noteId])

// AFTER (correct)
import { useNoteQuery } from '../notes/hooks/use-notes-query'
const { data: note, isLoading, error } = useNoteQuery(noteId)
```

**Step 2: Remove `hasInitializedRef` and `replaceBlocks` hack**

Delete these from `use-editor.ts`:
- `const hasInitializedRef = useRef(false)`
- The `useEffect` that calls `editor.replaceBlocks(...)`
- `queueMicrotask`
- The `useEffect` that resets `hasInitializedRef` on noteId change
- `initialLoadAttemptedRef`

**Step 3: Key the editor component by noteId**

In `apps/web/features/editor/components/note-editor.tsx`, find where `<EditorWrapper>` is rendered. Add `key={noteId}` to the component that owns `useEditor`. This forces React to fully unmount and remount the editor when switching notes, giving BlockNote a clean slate with the correct `initialContent`.

The cleanest place is on `NoteEditor` itself from its parent. In `apps/web/app/(app)/note/[...slug]/page.tsx` (or wherever `<NoteEditor noteId={noteId} />` is rendered):

```tsx
// In the parent that renders NoteEditor
<NoteEditor key={noteId} noteId={noteId} />
```

Or, if `NoteEditor` is rendered inside `NoteSplitView`, add the key there.

**Step 4: Simplify `initialContent` in `use-editor.ts`**

After removing local state, `initialContent` can be computed directly from the TanStack Query data:

```ts
const { data: note, isLoading, error } = useNoteQuery(noteId)

const initialContent = useMemo(() => {
  if (note?.content && note.content.length > 0) {
    return note.content
  }
  return getDefaultContent()
}, [note?.id]) // only recompute when note ID changes, not content (editor owns content after mount)
```

**Step 5: Remove secondary useState for icon/coverImage/tags from NoteEditor**

`apps/web/features/editor/components/note-editor.tsx` has:

```ts
const [icon, setIcon] = useState<string | undefined>(note?.icon || undefined)
const [coverImage, setCoverImage] = useState<string | undefined>(note?.coverImage || undefined)
const [tags, setTags] = useState<string[]>(note?.tags || [])

useEffect(() => {
  if (note) {
    if (note.icon !== icon) setIcon(note.icon || undefined)
    // ...
  }
}, [note])
```

Replace all three with derived values directly from `note` (which now comes from TanStack Query and is always fresh):

```ts
const icon = note?.icon || undefined
const coverImage = note?.coverImage || undefined
const tags = note?.tags || []
```

Remove the three `useState` calls and the `useEffect` that synced them.

**Step 6: Fix auto-save cleanup**

The save timeout must be cancelled on unmount. Verify this pattern in `use-editor.ts`:

```ts
useEffect(() => {
  if (!editor || !noteId || isLoading || !autoSave || readOnly) return

  function handleChange() {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(handleSave, autoSaveDelay)
  }

  editor.onEditorContentChange(handleChange)

  return () => {
    // CRITICAL: cancel pending save on unmount/noteId change
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = undefined
    }
  }
}, [editor, noteId, isLoading, autoSave, autoSaveDelay, readOnly, handleSave])
```

Confirm the cleanup is present. If not, add it.

### Files to Edit

| File | Change |
|---|---|
| `apps/web/features/editor/hooks/use-editor.ts` | Full rewrite of note loading logic. Remove useState, use useNoteQuery directly. Remove hasInitializedRef, replaceBlocks hack, queueMicrotask. |
| `apps/web/features/editor/components/note-editor.tsx` | Remove useState for icon/coverImage/tags. Remove sync useEffect. Derive from note directly. |
| `apps/web/features/notes/components/note-split-view.tsx` | Add `key={noteId}` to wherever `<NoteEditor>` is rendered. |
| `apps/web/app/(app)/note/[...slug]/page.tsx` | Confirm or add `key={noteId}` on the NoteEditor parent. |

### Files to NOT Edit

- `use-notes-query.ts` — only edit in Chapter 2
- `useEditorConfig.ts` — do not touch
- `editor-wrapper.tsx` — do not touch
- `editor-header.tsx` — do not touch
- Any `features/editor/blocks/` files — do not touch
- Any `features/editor/slash-menu/` files — do not touch

### Validation

After this chapter:
- Switch between 5 different notes rapidly. No stale content should appear in any note.
- Type in a note. The content should be exactly what you typed when you return to it.
- No "loading" flash should appear when switching between already-loaded notes.
- Run `bun run check-types` — zero new errors.

---

## Chapter 2 — Mutation & Cache Strategy

**Files:** `apps/web/features/notes/hooks/use-notes-query.ts`

**Goal:** Stop the `onSettled: invalidateQueries` flood on every save. Make optimistic updates the only mechanism for `updateNote`. Allow the server to reconcile in the background without triggering UI refetches.

### What Is Broken

Every single mutation in `use-notes-query.ts` calls:

```ts
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
}
```

For `updateNote`, this happens on every debounced save (every 1000ms of typing). This refetches the entire notes list from the server — causing the flicker.

For `createNote`, `deleteItem`, `moveItem`, `renameItem`, `pinItem`, `favoriteNote` — invalidation is fine because these are discrete user actions where freshness matters.

### The Fix

**Step 1: Remove `onSettled` from `useUpdateNoteMutation` only**

`useUpdateNoteMutation` already has a correct `onMutate` optimistic update and `onError` rollback. The `onSettled` invalidation is redundant and harmful.

```ts
// REMOVE THIS from useUpdateNoteMutation:
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
}
```

The optimistic update in `onMutate` keeps the UI correct. If the server write fails, `onError` rolls back. No refetch needed.

**Step 2: Keep `onSettled` on all other mutations**

`useCreateNoteMutation`, `useDeleteMutation`, `useMoveItemMutation`, `useRenameItemMutation`, `usePinItemMutation`, `useFavoriteNoteMutation`, `useSetNoteVisibilityMutation` — keep their `onSettled` invalidations. These are low-frequency, discrete actions where server reconciliation is important.

**Step 3: Increase `staleTime` for authenticated users**

```ts
return useQuery({
  queryKey: notesKeys.list(userId),
  queryFn: async () => { ... },
  staleTime: isGuestUserId(userId) ? 0 : 5 * 60 * 1000, // 5 min for auth users (was 60s)
  refetchOnMount: isGuestUserId(userId) ? true : false,   // don't refetch on every mount for auth users
  refetchOnWindowFocus: false,                             // never refetch on window focus
})
```

**Step 4: Fix double-invalidation in `useUpdateNoteMutation`'s `onMutate`**

The current `onMutate` calls `cancelQueries` before optimistic update, which is correct. Verify it looks like this and doesn't also call invalidate:

```ts
onMutate: async (newNote) => {
  await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
  const previousNotes = queryClient.getQueryData(notesKeys.list(userId))
  
  queryClient.setQueryData(notesKeys.list(userId), (old: Item[] = []) => {
    const updateItem = (items: Item[]): Item[] => {
      return items.map((item) => {
        if (item.id === newNote.id) {
          return { ...item, ...newNote, updatedAt: Date.now() }
        }
        if (item.type === 'folder') {
          return { ...item, children: updateItem(item.children) }
        }
        return item
      })
    }
    return updateItem(old)
  })
  
  return { previousNotes }
},
onError: (err, newNote, context) => {
  queryClient.setQueryData(notesKeys.list(userId), context?.previousNotes)
},
// onSettled: DELETED
```

### Files to Edit

| File | Change |
|---|---|
| `apps/web/features/notes/hooks/use-notes-query.ts` | Remove `onSettled` from `useUpdateNoteMutation`. Increase `staleTime` and set `refetchOnWindowFocus: false` on `useNotesQuery`. |

### Validation

After this chapter:
- Type continuously in a note for 10 seconds. The sidebar and editor should not flicker or reload at all.
- Create a new note. The sidebar should update instantly (optimistic) and then reconcile silently.
- Delete a note. Same — instant removal, no flicker.
- Run `bun run check-types`.

---

## Chapter 3 — Auth UI Wiring

**Files:** `apps/web/features/authentication/`, `apps/web/app/(auth)/`

**Goal:** The login/register UI exists but is not fully wired. The demo (guest) → auth migration flow must work end-to-end.

### Current State

- `apps/web/app/(auth)/login/page.tsx` — exists and renders `<LoginForm>` inside a split layout. Auth page is visually complete.
- `apps/web/features/authentication/components/login-form.tsx` — exists.
- `apps/web/features/notes/hooks/use-guest-migration.ts` — exists. Handles migrating guest localStorage notes to server on sign-in.
- The `LoginForm` accepts `title` and `subtitle` props.

### What Needs Fixing

**Step 1: Audit `login-form.tsx` for missing register flow**

Open `apps/web/features/authentication/components/login-form.tsx`. Verify it handles both sign-in and sign-up. It should use `better-auth`'s client methods:

```ts
import { authClient } from '@/lib/auth-client'

// Sign in
await authClient.signIn.email({ email, password })

// Sign up
await authClient.signUp.email({ email, password, name })
```

If either is missing, implement it. The toggle between "Sign In" and "Create Account" should be a tab or link within the same form — do not create a separate register page.

**Step 2: Verify guest migration fires on sign-in**

`use-guest-migration.ts` is included in `NotesProvider`. Confirm it:
1. Detects when a guest session becomes an authenticated session
2. Reads notes from `localStorage` (keyed by `GUEST_USER_ID`)
3. POSTs them to the server via the create note mutations
4. Clears localStorage after successful migration

If the migration hook has bugs (race conditions on session detection), fix the `useEffect` dependencies.

**Step 3: Verify redirect after auth**

After successful sign-in, the user should be redirected to `/` (the app root), not stay on `/login`. Confirm `router.push('/')` or `router.replace('/')` fires on auth success.

**Step 4: Verify the back button on auth page**

The login page has a "Back Home" button linking to `/`. Confirm this works and does not break if the user is already authenticated (they should be redirected away from `/login` automatically if already signed in).

**Step 5: Protect app routes**

`apps/web/features/authentication/require-auth.ts` should be used on `(app)` group routes. Check `apps/web/app/(app)/` layout for auth guard. If missing, add:

```ts
// apps/web/app/(app)/layout.tsx
import { requireAuth } from '@/features/authentication/require-auth'
// run requireAuth() at the top of the layout, redirect to /login if no session
```

Note: guest users ARE allowed in the app — they use `GUEST_USER_ID`. "Require auth" here means ensuring the layout initializes properly for both guest and authenticated users, not blocking guests.

### Files to Potentially Edit

| File | Change |
|---|---|
| `apps/web/features/authentication/components/login-form.tsx` | Verify sign-in + sign-up both work with better-auth client. |
| `apps/web/features/notes/hooks/use-guest-migration.ts` | Fix useEffect deps / race conditions if present. |
| `apps/web/app/(auth)/login/page.tsx` | Verify redirect after auth. |

### UI Constraint

The login page layout (split left/right, gradient, blockquote, floating blob background) must not change. Only fix the functionality inside `<LoginForm>`.

### Validation

- Visit `/login` as a guest. Fill form, submit. Session should be created.
- After sign-in, redirect to `/`.
- Guest notes should appear after migration.
- Run `bun run check-types`.

---

## Chapter 4 — Task Persistence Fix

**Files:**
- `apps/web/features/editor/slash-menu/task-block.tsx`
- `apps/web/features/tasks/hooks/use-tasks-query.ts`
- `apps/web/features/editor/hooks/use-editor.ts` (auto-save)
- `apps/web/app/api/tasks/sync/route.ts`

**Goal:** Tasks created via the slash menu (`/task`) must persist immediately and be retrievable by the task detail panel.

### What Is Broken

The task block is inserted into BlockNote as a visual element. It only persists to the DB when `handleSave` fires (debounced 1000ms). The task detail panel opens by `blockId` but queries the DB — if the save hasn't happened yet, the task doesn't exist in the DB and the panel shows "not found".

Additionally, the task sync in `handleSave` calls `syncTasks.mutate(...)` which is fire-and-forget. On navigation before save completes, the task never syncs.

### The Fix

**Step 1: Eager task creation on block insert**

In `task-block.tsx`, the "open task panel" button fires `openTaskPanel(block.id)`. Before opening the panel, trigger an immediate save if the task doesn't exist yet.

The cleanest solution: when `taskBlockSpec` renders and the block is new (no existing DB record), fire an immediate `syncTasks` for just that block. Since BlockNote fires `onEditorContentChange` on every insert, the debounced save will catch it — but we need it to be immediate.

Approach: In `useEditor`'s `handleSave`, expose an `immediatelySave` function (no debounce). Call this from the task panel open handler.

```ts
// In use-editor.ts, add:
const immediatelySave = useCallback(() => {
  if (!editor || !noteId || readOnly) return
  if (saveTimeoutRef.current) {
    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = undefined
  }
  handleSave()
}, [editor, noteId, readOnly, handleSave])

// Return it from useEditor:
return { ..., immediatelySave }
```

**Step 2: Wire immediatelySave through NoteEditor context**

`task-block.tsx` doesn't have direct access to `useEditor`. The task panel is opened via `useUIStore.getState().openTaskPanel(block.id)`. We need to ensure a save happens before the panel tries to fetch the task.

Options (choose one, prefer option A):

**Option A (recommended):** Use a custom event. When `openTaskPanel` is called from `task-block.tsx`, dispatch a `'skriuw:save-before-task-open'` custom event on `window`. In `note-editor.tsx`, listen for this event and call `immediatelySave()`.

```ts
// In task-block.tsx, in the onClick handler:
onClick={(e) => {
  e.stopPropagation()
  e.preventDefault()
  window.dispatchEvent(new CustomEvent('skriuw:save-before-task-open', { detail: { blockId: block.id } }))
  // Small delay to allow save to start before panel opens
  setTimeout(() => {
    const state = useUIStore.getState()
    if (state.taskStack.length > 0) {
      state.pushTask(block.id)
    } else {
      state.openTaskPanel(block.id)
    }
  }, 100)
}}
```

```ts
// In note-editor.tsx, add a useEffect:
useEffect(() => {
  function handleSaveBeforeTask() {
    immediatelySave()
  }
  window.addEventListener('skriuw:save-before-task-open', handleSaveBeforeTask)
  return () => window.removeEventListener('skriuw:save-before-task-open', handleSaveBeforeTask)
}, [immediatelySave])
```

**Option B (simpler but less clean):** Call `immediatelySave` on every editor content change instead of debouncing — only for authenticated users. Not recommended, too many writes.

**Step 3: Verify task sync API route**

Open `apps/web/app/api/tasks/sync/route.ts`. Confirm it:
1. Requires auth (`requireAuth()` or reads session)
2. Accepts `{ noteId: string, tasks: ExtractedTask[] }`
3. Does a full replace: deletes all tasks for `noteId`, inserts new ones
4. Returns `200 OK` on success

If the route has any bug where it silently returns early before writing, fix it.

**Step 4: Fix task detail panel "not found" for newly created tasks**

In `apps/web/features/tasks/components/task-detail-panel.tsx`, the panel queries by `blockId`. If the task doesn't exist yet (save in flight), it should show a loading state rather than "not found". Add a small retry or a pending state:

```ts
// In task-detail-panel.tsx or the query hook it uses:
// If the task query returns null but we just opened the panel,
// wait up to 2s before showing "not found"
const [isWaitingForTask, setIsWaitingForTask] = useState(true)
useEffect(() => {
  if (!task && !isLoading) {
    const timer = setTimeout(() => setIsWaitingForTask(false), 2000)
    return () => clearTimeout(timer)
  } else {
    setIsWaitingForTask(false)
  }
}, [task, isLoading])
```

Show the skeleton while `isWaitingForTask` is true.

### Files to Edit

| File | Change |
|---|---|
| `apps/web/features/editor/hooks/use-editor.ts` | Add `immediatelySave` function and return it. |
| `apps/web/features/editor/components/note-editor.tsx` | Listen for `skriuw:save-before-task-open` event, call `immediatelySave`. |
| `apps/web/features/editor/slash-menu/task-block.tsx` | Dispatch event before opening task panel. Add 100ms delay before `openTaskPanel`. |
| `apps/web/features/tasks/components/task-detail-panel.tsx` | Add retry/pending state before showing "not found". |
| `apps/web/app/api/tasks/sync/route.ts` | Audit and fix any silent early returns. |

### Validation

- Open a note. Type `/task`. Name the task. Click the open-detail arrow immediately.
- Task detail panel should open and show the task (may show skeleton briefly).
- Refresh the page. Navigate back to the note. The task block should be present with the saved content.
- Run `bun run check-types`.

---

## Chapter 5 — Navigation & Loading Flicker

**Files:**
- `apps/web/app/(app)/note/[...slug]/page.tsx`
- `apps/web/features/notes/components/note-split-view.tsx`
- `apps/web/features/editor/components/note-editor.tsx`

**Goal:** Switching between notes should feel instant. No loading skeleton should flash when navigating to a note that's already in the TanStack Query cache.

### What Is Broken

1. `note/[...slug]/page.tsx` resolves the `noteId` from the slug by searching `items`. If `items` hasn't loaded yet OR if `isInitialLoading` is true, it shows a skeleton. But after Chapter 1 and 2 fixes, the items list is always cached — so this skeleton should never appear after first load.

2. The `isLoading` state in the old `use-editor.ts` was causing a flash by starting as `false`, then setting to `true`, then back to `false`. After Chapter 1, since we use `useNoteQuery` directly, `isLoading` from TanStack Query is only `true` on the very first fetch.

3. `NoteEditorSkeleton` in the note page is shown when `noteId` is null/unresolved. The `showNotFound` delay (200ms timer) is a band-aid. After Chapter 1, notes are in cache and `resolveNoteId` should succeed synchronously.

### The Fix

**Step 1: Conditional skeleton display**

In `apps/web/app/(app)/note/[...slug]/page.tsx`, only show the skeleton during `isInitialLoading` (when the notes list has never been fetched). Never show skeleton when `isInitialLoading` is false but `noteId` hasn't resolved yet — that's a 404.

```ts
// Current flow:
// isInitialLoading → show skeleton
// !noteId && !isInitialLoading → start 200ms timer → showNotFound
// noteId → render NoteEditor

// After fix:
// isInitialLoading → show skeleton (first app load only)
// !noteId && !isInitialLoading → immediately treat as not found (after a 50ms grace period max)
// noteId → render NoteEditor with key={noteId}
```

Reduce `showNotFound` timer from 200ms to 50ms. The 200ms was compensating for the async `getNote` lookup — after Chapter 1, this is no longer needed.

**Step 2: Ensure `NoteEditor` renders immediately from cache**

After Chapter 1, `useNoteQuery(noteId)` returns `{ data: note }` synchronously from TanStack Query cache when the note has been seen before. The `isLoading` will be `false` and `note` will be populated immediately.

Confirm that `note-editor.tsx` does NOT show the skeleton loading div when `isLoading` is false, even if `note` is null momentarily during key-based remount. The key-based remount is clean — `isLoading` starts at the TanStack Query cached state.

**Step 3: Prefetch on sidebar hover (optional but high impact)**

In the sidebar item component (look in `components/sidebar/sidebar-component.tsx` or similar), add a `onMouseEnter` prefetch:

```ts
// In the sidebar note item render:
const queryClient = useQueryClient()

function handleMouseEnter() {
  queryClient.prefetchQuery({
    queryKey: notesKeys.detail(note.id),
    queryFn: () => fetchNote(note.id),
    staleTime: 60 * 1000,
  })
}
```

This makes note switching feel truly instant — by the time the user clicks, the data is already in cache.

**Step 4: Remove `force-dynamic` if safe**

`apps/web/app/layout.tsx` has `export const dynamic = 'force-dynamic'` at the top. This was added because BlockNote is client-only. Since the root layout doesn't directly render BlockNote, this might be removable — but only if doing so doesn't break anything. Test carefully. If removing it causes hydration errors, leave it and document why.

### Files to Edit

| File | Change |
|---|---|
| `apps/web/app/(app)/note/[...slug]/page.tsx` | Reduce showNotFound timer to 50ms. |
| `apps/web/components/sidebar/sidebar-component.tsx` | Add prefetchQuery on mouseEnter for note items. |

### Validation

- Load the app. Click rapidly between 5 different notes.
- No skeleton should flash when clicking between already-visited notes.
- First visit to a note (cold cache) may show skeleton briefly — this is acceptable.
- Run `bun run check-types`.

---

## Chapter 6 — Sidebar & Pin UX

**Files:** `apps/web/components/sidebar/sidebar-component.tsx` (and related sidebar files)

**Goal:** Fix the pin UX issues described in `problems.md` Issue 5. Pinned items must always appear at the top. The pin indicator must be clean.

### What Is Broken

From `problems.md`:
- Pin icon is visually unpleasant
- Checkbox appears on the left when active, inconsistently
- Pinned items do not stand out
- Pinned items should always be at position one in the list

### The Fix

**Step 1: Sort pinned items to top in sidebar**

The notes list from TanStack Query returns items in DB order. The sidebar should sort them before rendering. In the sidebar component that renders the tree:

```ts
// Sort function to apply before rendering
function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    // Pinned items first, sorted by pinnedAt desc (most recently pinned first)
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    if (a.pinned && b.pinned) {
      return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
    }
    // Non-pinned: sort by updatedAt desc
    return b.updatedAt - a.updatedAt
  })
}
```

Apply this sort recursively (also sort within folders).

**Step 2: Redesign the pin indicator**

Remove the standalone pin icon button from the item row. Replace with:
- A subtle top-border accent on pinned items (use `border-l-2 border-brand-500` on the left edge of the item)
- OR a small filled dot/indicator using `bg-brand-500` on the left
- The pin/unpin action moves to the context menu only (right-click or `...` menu)

The goal is: no checkbox on the left, no distracting pin icon. Just a subtle visual marker that the item is pinned.

Example implementation for the pinned indicator:

```tsx
<div
  className={cn(
    'flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer group',
    'hover:bg-accent',
    item.pinned && 'border-l-2 border-brand-500 pl-[calc(0.5rem-2px)]'
  )}
>
```

**Step 3: Keep pin/unpin in context menu**

Verify the context menu (right-click on sidebar item) has a "Pin" / "Unpin" option that calls `pinItem`. If missing, add it using the existing context menu pattern in the codebase.

### Files to Edit

| File | Change |
|---|---|
| `apps/web/components/sidebar/sidebar-component.tsx` | Apply `sortItems` before render. Redesign pin indicator (left border accent). Move pin action to context menu only. |

### UI Constraint

Do not change the sidebar's overall structure, font sizes, spacing, or color scheme. Only change the pin indicator visual and sort order. Use `border-brand-500` (maps to `hsl(var(--brand-500))`) for the accent.

### Validation

- Pin several items. They should all appear at the top of the sidebar list.
- Pinned items should have a visible left-border accent.
- No stray checkboxes or pin icons in the item row.
- Unpin via context menu. Item returns to normal sort position.
- Run `bun run check-types`.

---

## Chapter 7 — Context Menu Polish

**Files:**
- `apps/web/features/shortcuts/context-menu-context.tsx`
- `apps/web/features/shortcuts/display.tsx`
- Any file rendering the context menu items

**Goal:** Fix typos and the broken "Move" submenu (Issue 10 from `problems.md`).

### What Is Broken

- Context menu has spelling mistakes in item labels
- The "Move" option opens a secondary popup that has misspelled text and feels broken
- Submenus render inconsistently

### The Fix

**Step 1: Audit all context menu string literals**

Search for context menu item labels:

```bash
grep -r "context.menu\|contextMenu\|ContextMenu\|\"Move\"\|\"Copy\"\|\"Rename\"\|\"Delete\"\|\"Duplicate\"\|\"Archive\"\|\"Pin\"\|\"Unpin\"\|\"Favorite\"" apps/web/features/shortcuts/ apps/web/components/sidebar/
```

Correct all spelling mistakes. Common ones from the bug report: check "Move" submenu labels specifically.

**Step 2: Fix the Move submenu rendering**

The Move submenu should list available folders. It likely uses a `DropdownMenuSub` or similar. Ensure:
1. The submenu trigger label is spelled correctly: "Move to folder"
2. The submenu content renders inside a `DropdownMenuSubContent` with proper `z-index` (see Chapter 8)
3. Folder items in the submenu are clickable and call `moveItem(itemId, folderId)`
4. A "Move to root" option exists at the top (to move items out of all folders)
5. The current parent folder should be visually indicated (e.g. checkmark) but not clickable

**Step 3: Ensure consistent item ordering in context menu**

Standard order for note context menu:
1. Open
2. ── separator ──
3. Rename
4. Duplicate
5. Move to folder ▶
6. ── separator ──
7. Pin / Unpin
8. Favorite / Unfavorite
9. ── separator ──
10. Archive
11. Delete (moves to trash)

### Files to Edit

| File | Change |
|---|---|
| Context menu files in `apps/web/features/shortcuts/` | Fix all spelling mistakes in string literals. |
| Sidebar context menu component | Fix Move submenu rendering, ensure it uses proper submenu components. |

### Validation

- Right-click a note in the sidebar. All menu items spelled correctly.
- Hover "Move to folder". Submenu appears, lists folders.
- Click a folder in the submenu. Note moves to that folder.
- Run `bun run check-types`.

---

## Chapter 8 — Z-Index & Popover Stacking

**Files:**
- `apps/web/components/layout/top-toolbar.tsx`
- Any popover/tooltip component rendered in the top bar

**Goal:** Fix Issue 11 — the top bar help sidebar popover renders under the sidebar instead of above it.

### What Is Broken

The top bar has a toggle button that opens a help sidebar. On hover, a popover/tooltip appears. Its `z-index` is lower than the sidebar's `z-index`, causing it to render behind.

### The Fix

**Step 1: Audit z-index layers**

Identify the current z-index values used in the app. Search:

```bash
grep -r "z-index\|z-\[" apps/web/components/ apps/web/features/ apps/web/styles/
```

The typical layering should be:
```
z-10   base content
z-20   sidebar
z-30   top toolbar
z-40   dropdowns, popovers, context menus
z-50   modals, dialogs
z-60   toasts, notifications
z-[9999] Tauri window drag regions (if any)
```

**Step 2: Fix the popover z-index**

In `top-toolbar.tsx` or wherever the help popover is defined, find the `Popover`, `Tooltip`, or `HoverCard` component. Ensure its content has `z-40` or higher:

```tsx
// If using @skriuw/ui Popover:
<PopoverContent className="z-40 ...">

// If using a custom div:
<div className="absolute z-40 ...">
```

**Step 3: Verify all popovers and dropdowns**

Do a quick check that all `DropdownMenuContent`, `PopoverContent`, `TooltipContent`, and `HoverCardContent` components in the top toolbar and sidebar have at least `z-40`. This is often handled by Radix UI primitives automatically via a portal — if the component uses `Portal`, z-index is not needed. Check if the problematic component is missing a `Portal`.

If the issue is that the component renders in-DOM (not portalled), the fix is to use `asChild` with a Radix portal wrapper or set an explicit `z-index`.

### Files to Edit

| File | Change |
|---|---|
| `apps/web/components/layout/top-toolbar.tsx` | Fix popover/tooltip z-index or ensure it uses a Portal. |

### Validation

- Open the app. Hover the help toggle in the top bar.
- The popover/tooltip must appear above all sidebars and panels.
- Run `bun run check-types`.

---

## Chapter 9 — Elysia Backend Extraction

**Goal:** Extract all Next.js API routes into a standalone `apps/api/` server using Elysia on Bun. This server becomes the single API endpoint for Web, Tauri, and future Mobile clients.

> **Note:** This chapter is the most involved. It should be done AFTER Chapters 1–8 are complete and stable. Do NOT start this chapter unless the app is functionally working.

### Motivation

- Next.js API routes are awkward for Tauri (which needs a standalone HTTP endpoint for sync)
- Elysia with Eden Treaty provides end-to-end type safety without tRPC overhead
- A standalone server is easier to deploy, test, and reason about
- Future mobile (Expo) needs a real API, not Next.js routes

### Architecture

```
apps/api/
├── src/
│   ├── index.ts              ← Elysia app entry, port 3001
│   ├── auth.ts               ← Better Auth integration
│   ├── db.ts                 ← Drizzle connection (reuse packages/db)
│   ├── middleware/
│   │   ├── auth.ts           ← requireAuth middleware
│   │   └── cors.ts           ← CORS for web + Tauri origins
│   └── routes/
│       ├── notes.ts          ← GET/POST/PUT/DELETE /notes
│       ├── tasks.ts          ← Task CRUD + sync
│       ├── settings.ts       ← User settings
│       ├── shortcuts.ts      ← Keyboard shortcut overrides
│       ├── uploads.ts        ← File uploads (if kept)
│       └── user.ts           ← User seed, profile
├── package.json
└── tsconfig.json
```

### Implementation Steps

**Step 1: Create `apps/api/` package**

```bash
mkdir -p apps/api/src/routes apps/api/src/middleware
```

`apps/api/package.json`:
```json
{
  "name": "api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@skriuw/db": "workspace:*",
    "@skriuw/shared": "workspace:*",
    "better-auth": "^1.4.5",
    "drizzle-orm": "^0.44.7",
    "elysia": "^1.3.0",
    "@elysiajs/cors": "^1.3.0",
    "@elysiajs/bearer": "^1.3.0"
  }
}
```

**Step 2: Migrate routes**

For each route in `apps/web/app/api/`, create an equivalent Elysia route in `apps/api/src/routes/`. The logic inside each route handler is copy-paste — only the framework wrapper changes.

Example migration:

```ts
// BEFORE: apps/web/app/api/notes/route.ts (Next.js)
export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const notes = await db.select().from(notesTable).where(eq(notesTable.userId, session.user.id))
  return Response.json(notes)
}

// AFTER: apps/api/src/routes/notes.ts (Elysia)
import Elysia from 'elysia'
import { requireAuth } from '../middleware/auth'

export const notesRoutes = new Elysia({ prefix: '/notes' })
  .use(requireAuth)
  .get('/', async ({ userId, db }) => {
    return db.select().from(notesTable).where(eq(notesTable.userId, userId))
  })
```

**Step 3: Update `apps/web` to point at `apps/api`**

Create `apps/web/lib/api-client.ts`:

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // send session cookie
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.error ?? `API error: ${response.status}`)
  }
  return response.json()
}
```

Replace all direct `fetch('/api/...')` calls in `features/notes/`, `features/tasks/`, etc. with `apiRequest('/notes/...')`.

**Step 4: Keep Next.js API routes temporarily**

During migration, keep the Next.js API routes as a fallback. Add a feature flag `NEXT_PUBLIC_USE_ELYSIA_API=true` to switch between them. Remove Next.js routes only after Elysia routes are verified working.

**Step 5: Update Tauri to use `apps/api`**

In Tauri dev mode, configure the webview to allow `localhost:3001` as an allowed origin. In production Tauri builds, bundle the Elysia server or configure it as a sidecar process.

### Files to Create

| File | Description |
|---|---|
| `apps/api/src/index.ts` | Elysia entry point |
| `apps/api/src/middleware/auth.ts` | Auth middleware using better-auth |
| `apps/api/src/routes/notes.ts` | Notes CRUD |
| `apps/api/src/routes/tasks.ts` | Tasks CRUD + sync |
| `apps/api/src/routes/settings.ts` | Settings |
| `apps/api/src/routes/user.ts` | User seeding and profile |
| `apps/api/package.json` | Package manifest |
| `apps/web/lib/api-client.ts` | Typed fetch wrapper |

### Validation

- Start `apps/api` with `bun run dev` on port 3001.
- Start `apps/web` with `bun run dev` on port 3000.
- All CRUD operations work end-to-end.
- Tauri dev build connects to `localhost:3001`.
- Run `bun run check-types` in both `apps/api` and `apps/web`.

---

## Chapter 10 — Monorepo Cleanup

**Goal:** Remove dead packages and simplify the monorepo. Reduce cognitive overhead for future development.

> **Note:** Do this chapter LAST, after all other chapters are complete. Changing package structure can break imports across the entire codebase.

### Packages to Evaluate

| Package | Status | Action |
|---|---|---|
| `packages/db` | Active, critical | Keep as-is |
| `packages/ui` | Active, critical | Keep as-is |
| `packages/shared` | Active | Keep, merge `packages/env` types in if small |
| `packages/crud` | Active for guest mode | Keep for now; evaluate after Chapter 9 |
| `packages/config` | ESLint/TS config only | Keep (tooling, not runtime) |
| `packages/style` | Prettier/lint tooling | Keep (tooling, not runtime) |
| `packages/env` | Zod env validation | Evaluate: can fold into `packages/shared` or `apps/web/lib/env.ts` |
| `packages/core` | Listed in directory, check contents | Audit: if empty or redundant, remove |

### Step 1: Audit `packages/core`

```bash
find packages/core -type f | sort
```

If it contains no significant code (just re-exports or empty), delete it:
```bash
bun run safe-delete packages/core
```
Remove all imports of `@skriuw/core` from the codebase first.

### Step 2: Evaluate `packages/env`

```bash
cat packages/env/src/server.ts
cat packages/env/src/client.ts
```

If it's just a few Zod env schemas, move the contents into `apps/web/lib/env.ts` and delete the package. Update all imports.

### Step 3: Consolidate `turbo.json` tasks**

After removing packages, update `turbo.json` to remove any pipeline entries for deleted packages.

### Files to Edit

| File | Change |
|---|---|
| `turbo.json` | Remove pipeline entries for deleted packages |
| `pnpm-workspace.yaml` | Remove deleted package paths |
| `package.json` (root) | Remove devDependencies on deleted packages |
| All files importing deleted packages | Update import paths |

### Validation

- `bun run check-types` passes.
- `bun run build` succeeds.
- `bun run dev` starts without errors.

---

## 16. Testing Expectations

Each chapter should be followed by these verification steps. An agent must not mark a chapter complete without passing these.

### Per-Chapter Checklist

```
[ ] bun run check-types — zero new TypeScript errors
[ ] bun run test — all existing tests pass
[ ] bun run lint — no new lint errors
[ ] Manual smoke test: navigate between 3+ notes, type content, refresh
[ ] Dark mode: verify the changed UI areas look correct in dark theme
[ ] Guest mode: verify functionality works without a session (using GUEST_USER_ID)
```

### Key Regression Tests (Manual)

| Scenario | Expected |
|---|---|
| Open app as guest | Notes load from localStorage, no auth required |
| Create note as guest | Note appears in sidebar instantly |
| Type in note for 5 seconds | No flicker, no skeleton flash |
| Navigate to another note | Correct content loads, no stale content from previous note |
| Sign up (new account) | Guest notes migrate to server, user lands on `/` |
| Sign in (existing account) | Notes load from server |
| Create note as auth user | Note appears in sidebar, persists on refresh |
| Delete note | Removed from sidebar instantly, gone on refresh |
| Rename note | Sidebar updates instantly |
| Pin note | Jumps to top of sidebar |
| Open task detail | Panel shows task content |
| Right-click note in sidebar | Context menu appears, all items spelled correctly |
| Hover top bar toggle | Popover appears above sidebar |

---

## 17. Shared Invariants

These rules apply to ALL chapters. Any agent working in this codebase must follow them.

### Never Do

- Never remove a CSS class from a component unless fixing a specific visual bug in scope.
- Never replace `@skriuw/ui` components with raw HTML equivalents.
- Never add a new state management solution (no new stores, no Context that wraps TanStack Query, no SWR).
- Never add `console.log` to production code paths (debug logs are acceptable in dev-only branches).
- Never write unscoped DB queries against user-owned tables (`notes`, `folders`, `tasks`, `settings`, `shortcuts`). Always include `userId` in the `where` clause.
- Never call `queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })` from `useUpdateNoteMutation`'s `onSettled` (Chapter 2 removes this — do not re-add it).
- Never use `useEffect` to load data that TanStack Query already manages.
- Never introduce a dependency that conflicts with the Bun runtime (check Bun compatibility before adding any new npm package).

### Always Do

- Always run `bun run check-types` after any TypeScript change.
- Always scope user data queries by `userId`.
- Always handle both guest mode (`isGuestUserId(userId)`) and authenticated mode in the same hook.
- Always use `cn()` from `@skriuw/shared` for conditional class names.
- Always use `notify()` from `@/lib/notify` for user-facing notifications (not `alert()` or `console.error`).
- Always use `generateId()` from `@skriuw/shared` for new entity IDs.
- Always use `haptic.success()` / `haptic.error()` from `@skriuw/shared` for Tauri haptic feedback on important actions.
- Always preserve the `isLoading` / `isPending` / `error` pattern from TanStack Query — never replace with manual `useState(false)` booleans.

### State Management Decision Tree

```
Q: Is this state derived from server data (notes, tasks, user)?
   → YES: Use TanStack Query (useQuery / useMutation)

Q: Is this state purely UI (sidebar open, modal visible, active panel)?
   → YES: Use Zustand (ui-store.ts or a feature-specific store)

Q: Is this state local to a single component and not needed elsewhere?
   → YES: Use useState

Q: Is this state shared across the component tree but NOT server data?
   → Use Zustand or React Context (not TanStack Query)

NEVER: duplicate server data into useState or Zustand
NEVER: put UI state into TanStack Query
```

### Import Conventions

```ts
// Feature internals
import { useNotes } from '@/features/notes'
import { useEditor } from '@/features/editor/hooks/use-editor'

// Package imports
import { cn, generateId, GUEST_USER_ID } from '@skriuw/shared'
import { Button } from '@skriuw/ui'
import type { Note } from '@skriuw/db'

// Avoid deep cross-feature relative imports
// BAD:  import { something } from '../../features/notes/utils/flatten-notes'
// GOOD: import { something } from '@/features/notes/utils/flatten-notes'
```

---

*End of SPEC.md — Last updated: see git log*