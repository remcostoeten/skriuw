# AGENT_TASKS.md — Discrete Task List for Individual Agents

> **How to use this file:**
> Each task below is self-contained. An agent can pick up any single task, read its full context block, and execute it without needing the rest of the codebase history. Every task references exact file paths, explains the root cause, and defines done criteria.
>
> **Always read first:**
> - `AGENTS.md` (root) — non-negotiable rules
> - `docs/SPEC.md` — full architecture reference
>
> **Before marking any task done:**
> 1. `bun run check-types` — zero new errors
> 2. `bun run test` — all existing tests pass
> 3. Manual smoke test as described in the task
>
> **Task status legend:**
> - `[ ]` Open — not started
> - `[~]` In progress
> - `[x]` Complete

---

## Chapter 1 — Editor State

---

### TASK-001 — Replace local useState in `use-editor.ts` with `useNoteQuery`

**Status:** `[x]`

**File(s):**
- `apps/web/features/editor/hooks/use-editor.ts`

**Root cause:**
`use-editor.ts` loads note data by calling `getNote(noteId)` (an async function from `useNotesContext`), then copies the result into a local `useState<Note | null>`. This creates a second copy of data that TanStack Query already owns. The two copies go out of sync, causing stale content in the editor.

`useNoteQuery(noteId)` already exists in `apps/web/features/notes/hooks/use-notes-query.ts` and returns the note directly from TanStack Query cache — synchronously when the note has been fetched before.

**What to change:**

1. At the top of `use-editor.ts`, import `useNoteQuery`:
   ```ts
   import { useNoteQuery } from '@/features/notes/hooks/use-notes-query'
   ```

2. Remove the following from `use-editor.ts`:
   - `const [note, setNote] = useState<Note | null>(null)`
   - `const [isLoading, setIsLoading] = useState(false)`
   - `const [error, setError] = useState<string | null>(null)`
   - The entire `useEffect` that calls `loadNote()` (the async function that calls `getNote`)
   - `initialLoadAttemptedRef`
   - The import of `useNotesContext` if it is only used for `getNote`

3. Replace with:
   ```ts
   const { data: note, isLoading, error: queryError } = useNoteQuery(noteId)
   const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load note') : null
   ```

4. Update the return value of `useEditor` — it currently returns `{ editor, note, noteName, isLoading, setNoteName, handleSave, error }`. Keep this return signature identical so callers don't break. `note` now comes from TanStack Query instead of local state.

5. `noteName` is currently initialized from `note?.name`. Keep this pattern but initialize from `useNoteQuery` data:
   ```ts
   const [noteName, setNoteName] = useState(note?.name ?? '')
   useEffect(() => {
     if (note?.name) setNoteName(note.name)
   }, [note?.id]) // only reset name when note ID changes, not on every name update
   ```

**Do not change:**
- The returned API shape (`editor`, `note`, `noteName`, `isLoading`, `setNoteName`, `handleSave`, `error`)
- Any logic related to `autoSave`, `handleSave`, `saveTimeoutRef`
- The spellcheck observer logic
- `useEditorConfig` usage
- Any imports not related to the note-loading logic being removed

**Done criteria:**
- `bun run check-types` passes
- Navigate to a note — content loads correctly
- Navigate between two notes — each shows its own content
- No TypeScript errors in `use-editor.ts`

---

### TASK-002 — Remove `hasInitializedRef` / `replaceBlocks` / `queueMicrotask` hack from `use-editor.ts`

**Status:** `[x]`

**Depends on:** TASK-001 (must be complete first)

**File(s):**
- `apps/web/features/editor/hooks/use-editor.ts`

**Root cause:**
After `useCreateBlockNote` mounts the editor with `initialContent`, navigating to a different note changes `note` (and therefore `initialContent`) but BlockNote ignores the new value — it already has its own internal ProseMirror state. The current workaround is to call `editor.replaceBlocks(editor.document, contentToLoad)` inside a `queueMicrotask`, guarded by `hasInitializedRef` to prevent running twice.

This is fragile. The correct fix is to use a React `key` on the editor component (TASK-003), which causes a full clean remount when the note changes. Once TASK-003 is in place, the `replaceBlocks` hack is not only unnecessary but actively harmful — it would double-apply content.

**What to change:**

Remove the following from `use-editor.ts`:
1. `const hasInitializedRef = useRef(false)`
2. The `useEffect` block that contains `editor.replaceBlocks(...)` and `queueMicrotask(...)`
3. The `useEffect` that resets `hasInitializedRef.current = false` when `noteId` changes

Simplify `initialContent`:
```ts
// BEFORE
const initialContent = useMemo(() => {
  if (note?.content && note.content.length > 0) {
    return note.content
  }
  return getDefaultContent()
}, [note?.content])  // ← wrong dep, re-memos on every content change

// AFTER
const initialContent = useMemo(() => {
  if (note?.content && note.content.length > 0) {
    return note.content
  }
  return getDefaultContent()
}, [note?.id])  // ← only recompute when switching to a different note
```

**Do not change:**
- `useCreateBlockNote` call
- `getDefaultContent` function
- Any save logic
- The spellcheck observer

**Done criteria:**
- `bun run check-types` passes
- No `hasInitializedRef`, `replaceBlocks`, or `queueMicrotask` remaining in the file
- Editor still loads correct content (because TASK-003 handles clean remounts)

---

### TASK-003 — Add `key={noteId}` to force clean editor remount on note change

**Status:** `[x]`

**Depends on:** TASK-001, TASK-002

**File(s):**
- `apps/web/features/notes/components/note-split-view.tsx`
- `apps/web/app/(app)/note/[...slug]/page.tsx` (verify here too)

**Root cause:**
React reuses mounted component instances when the same component renders with a different prop. `<NoteEditor noteId={newId} />` reuses the same instance that was mounted for `noteId={oldId}`. BlockNote's editor instance was created with the old note's content and doesn't re-initialize.

Adding `key={noteId}` tells React to treat each note as a completely different component tree, forcing a fresh mount with the correct `initialContent` for each note.

**What to change:**

1. Open `apps/web/features/notes/components/note-split-view.tsx`. Find where `<NoteEditor noteId={...} />` is rendered (likely inside the main pane). Add `key={noteId}`:
   ```tsx
   <NoteEditor key={noteId} noteId={noteId} ... />
   ```

2. Open `apps/web/app/(app)/note/[...slug]/page.tsx`. Find where `NoteSplitView` or `NoteEditor` is rendered. If `NoteEditor` is rendered directly here, add `key={noteId}` to it. If `NoteSplitView` is the container, add `key={noteId}` to `NoteSplitView` instead.

3. Search for any other places that render `<NoteEditor`:
   ```bash
   grep -r "NoteEditor" apps/web --include="*.tsx" -l
   ```
   Add `key={noteId}` to each rendering site.

**Do not change:**
- Any component logic inside `NoteEditor` or `note-split-view.tsx`
- Props passed to `NoteEditor`
- The layout or visual structure

**Done criteria:**
- `bun run check-types` passes
- Click note A → see note A content
- Click note B → see note B content, not note A's content
- Click back to note A → see note A content again
- No stale content from a previous note ever appears

---

### TASK-004 — Remove secondary `useState` for icon/coverImage/tags from `NoteEditor`

**Status:** `[x]`

**Depends on:** TASK-001

**File(s):**
- `apps/web/features/editor/components/note-editor.tsx`

**Root cause:**
`NoteEditor` declares its own local state for `icon`, `coverImage`, and `tags`, then syncs them from the `note` object via a `useEffect`. This creates yet another state layer that can lag behind the TanStack Query data. Since `note` now comes directly from TanStack Query (after TASK-001), it is always fresh and can be read directly.

**What to change:**

1. Find and remove these three `useState` declarations in `note-editor.tsx`:
   ```ts
   const [icon, setIcon] = useState<string | undefined>(note?.icon || undefined)
   const [coverImage, setCoverImage] = useState<string | undefined>(note?.coverImage || undefined)
   const [tags, setTags] = useState<string[]>(note?.tags || [])
   ```

2. Remove the `useEffect` that syncs them:
   ```ts
   useEffect(() => {
     if (note) {
       if (note.icon !== icon) setIcon(note.icon || undefined)
       if (note.coverImage !== coverImage) setCoverImage(note.coverImage || undefined)
       if (JSON.stringify(note.tags) !== JSON.stringify(tags)) setTags(note.tags || [])
     }
   }, [note])
   ```

3. Replace the three variables with direct reads from `note`:
   ```ts
   const icon = note?.icon ?? undefined
   const coverImage = note?.coverImage ?? undefined
   const tags = note?.tags ?? []
   ```

4. The `setIcon`, `setCoverImage`, `setTags` local setters were used in `handleIconChange`, `handleCoverImageChange`, `handleTagsChange`. Since we no longer have local state, remove the `setIcon(newIcon)`, `setCoverImage(newCover)`, `setTags(newTags)` calls from those handlers — the TanStack Query optimistic update in `useUpdateNoteMutation` handles the UI update automatically.

   Example:
   ```ts
   // BEFORE
   const handleIconChange = useCallback((newIcon?: string) => {
     setIcon(newIcon)           // ← remove this line
     if (editor && note) {
       updateNote(note.id, editor.document, undefined, newIcon)
     }
   }, [editor, note, updateNote])

   // AFTER
   const handleIconChange = useCallback((newIcon?: string) => {
     if (editor && note) {
       updateNote(note.id, editor.document, undefined, newIcon)
     }
   }, [editor, note, updateNote])
   ```

**Do not change:**
- `handleIconChange`, `handleCoverImageChange`, `handleTagsChange` logic beyond removing the local setState calls
- `EditorHeader` props — the same values are passed, just sourced directly from `note` now
- Any other component logic

**Done criteria:**
- `bun run check-types` passes
- Change a note's icon → icon updates in editor header immediately
- Reload page → icon is still correct
- Tags display correctly and persist

---

### TASK-005 — Verify and harden auto-save cleanup on unmount

**Status:** `[x]`

**File(s):**
- `apps/web/features/editor/hooks/use-editor.ts`

**Root cause:**
The auto-save debounce sets a 1000ms timeout on every keystroke. If the user navigates away within 1000ms, the timeout fires after the component has unmounted. The `noteId` in the closure refers to the old note, and `handleSave` fires — this is actually correct behavior (saving the right note) but the cleanup must be verified to not cause React state updates on unmounted components.

**What to verify and fix:**

1. Find the `useEffect` in `use-editor.ts` that registers `editor.onEditorContentChange(handleChange)`. Confirm it returns a cleanup function that:
   - Clears `saveTimeoutRef.current` with `clearTimeout`
   - Sets `saveTimeoutRef.current = undefined`

   If the cleanup is missing or incomplete, add it:
   ```ts
   useEffect(() => {
     if (!editor || !noteId || isLoading || !autoSave || readOnly) return

     function handleChange() {
       if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
       saveTimeoutRef.current = setTimeout(() => {
         handleSave()
       }, autoSaveDelay)
     }

     editor.onEditorContentChange(handleChange)

     return () => {
       if (saveTimeoutRef.current) {
         clearTimeout(saveTimeoutRef.current)
         saveTimeoutRef.current = undefined
       }
     }
   }, [editor, noteId, isLoading, autoSave, autoSaveDelay, readOnly, handleSave])
   ```

2. Verify `saveTimeoutRef` is declared as `const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)` (not `ReturnType<typeof setTimeout>`). Use `undefined` as the initial value, not `null`.

3. Confirm `handleSave` is wrapped in `useCallback` with stable dependencies so it doesn't cause the effect to re-run on every render.

**Do not change:**
- The auto-save delay (1000ms default)
- The `handleSave` logic itself
- Any other effects

**Done criteria:**
- `bun run check-types` passes
- Type rapidly in a note, immediately navigate away
- The note content should be saved (check on reload)
- No "Can't perform a React state update on an unmounted component" warnings in console

---

## Chapter 2 — Mutation & Cache

---

### TASK-006 — Remove `onSettled: invalidateQueries` from `useUpdateNoteMutation`

**Status:** `[x]`

**File(s):**
- `apps/web/features/notes/hooks/use-notes-query.ts`

**Root cause:**
`useUpdateNoteMutation` fires on every debounced save (default: every 1000ms of typing). Its `onSettled` callback calls `queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })`, which triggers a full refetch of the entire notes list from the server. This causes the visible "flicker" every time you type. The optimistic update in `onMutate` already keeps the UI correct — the `onSettled` invalidation is purely harmful here.

**What to change:**

In `apps/web/features/notes/hooks/use-notes-query.ts`, find `useUpdateNoteMutation`. Remove the `onSettled` callback entirely from this mutation only:

```ts
// REMOVE THIS BLOCK from useUpdateNoteMutation:
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
},
```

The final shape of `useUpdateNoteMutation` should have:
- `mutationFn` — keep
- `onMutate` — keep (this is the optimistic update)
- `onError` — keep (this is the rollback)
- `onSettled` — **DELETE**

**Do not change:**
- `onSettled` in any other mutation (`useCreateNoteMutation`, `useDeleteMutation`, `useMoveItemMutation`, `useRenameItemMutation`, `usePinItemMutation`, `useFavoriteNoteMutation`, `useSetNoteVisibilityMutation`)
- `onMutate` in `useUpdateNoteMutation`
- `onError` in `useUpdateNoteMutation`
- Any other part of the file

**Done criteria:**
- `bun run check-types` passes
- Type continuously in a note for 15 seconds
- The sidebar and any visible UI should NOT flicker or briefly show loading states
- The note content should be correct after typing stops
- Open DevTools Network tab — no GET requests to `/api/notes` or equivalent firing every second while typing

---

### TASK-007 — Tune `staleTime` and disable `refetchOnWindowFocus` for notes list query

**Status:** `[x]`

**File(s):**
- `apps/web/features/notes/hooks/use-notes-query.ts`

**Root cause:**
The `useNotesQuery` hook currently uses `staleTime: 60 * 1000` (1 minute) for authenticated users, and TanStack Query's default `refetchOnWindowFocus: true`. This means every time the user alt-tabs back to the app, TanStack Query re-fetches the entire notes list. For a note-taking app where the user frequently switches to other apps, this causes constant background re-fetches and subtle UI flickers.

**What to change:**

Find `useNotesQuery` in `apps/web/features/notes/hooks/use-notes-query.ts`. In the `useQuery` call, update these options:

```ts
return useQuery({
  queryKey: notesKeys.list(userId),
  queryFn: async () => { /* keep as-is */ },
  staleTime: isGuestUserId(userId) ? 0 : 5 * 60 * 1000,  // 5 min for auth (was 60s)
  refetchOnMount: isGuestUserId(userId) ? true : false,    // don't refetch on mount for auth
  refetchOnWindowFocus: false,                              // never refetch on window focus
  refetchOnReconnect: true,                                 // DO refetch on network reconnect
})
```

**Rationale for each change:**
- `staleTime 5 min`: Notes don't change on the server unless this user (or a future collaborator) edits them. 5 minutes is safe and dramatically reduces server traffic.
- `refetchOnMount: false` for auth users: The notes are already in cache from the initial load. Remounting a component (e.g. switching tabs in the app) should not trigger a server fetch.
- `refetchOnWindowFocus: false`: This app is single-user. The user switching back from another app window doesn't mean notes changed on the server.
- `refetchOnReconnect: true`: If the user was offline and comes back online, a re-fetch is warranted.

**Do not change:**
- Guest user behavior (`isGuestUserId` branch) — guests always use `staleTime: 0` and `refetchOnMount: true` because their data source is localStorage which is always fresh
- The `queryFn` implementation
- Any other query options not listed above

**Done criteria:**
- `bun run check-types` passes
- Open the app, load notes
- Alt-tab to another application, come back
- Network tab in DevTools should NOT show a new GET request to the notes API on focus
- Opening the app fresh (first load) should still fetch notes from the server

---

## Chapter 3 — Auth UI

---

### TASK-008 — Audit and fix `login-form.tsx` sign-in and sign-up flows

**Status:** `[x]` — Fully implemented. Sign-in via `signIn.email`, sign-up via `signUp.email`, social (GitHub/Google), anonymous/guest mode. Toggle between modes, error display, redirect to `/` on success, `LoadingButton` and `EmailAutocomplete` used. No changes needed.

**File(s):**
- `apps/web/features/authentication/components/login-form.tsx`
- `apps/web/lib/auth-client.ts` (read-only reference)

**Root cause:**
The auth page exists and is visually complete, but the `LoginForm` component may be missing a sign-up (register) flow, or the sign-in flow may not correctly redirect after success.

**What to audit and fix:**

1. Open `login-form.tsx`. Verify it has:
   - A toggle between "Sign In" and "Create Account" modes (tab, link, or button)
   - Sign-in using `authClient.signIn.email({ email, password, callbackURL: '/' })`
   - Sign-up using `authClient.signUp.email({ email, password, name, callbackURL: '/' })`
   - Loading state during submission (disable the submit button, show spinner)
   - Error display for failed attempts (wrong password, email taken, etc.)

2. If sign-up is missing, implement it. The toggle between modes should be a simple state switch:
   ```ts
   const [mode, setMode] = useState<'signin' | 'signup'>('signin')
   ```
   Show different fields and submit logic based on `mode`. For sign-up, add a `name` field.

3. Verify the `callbackURL` in both `signIn.email` and `signUp.email` is set to `'/'` so the user lands on the app after auth.

4. The `LoginForm` accepts `title` and `subtitle` props. These are already passed from the login page — do not change the props interface.

5. Use the existing `LoadingButton` component from `apps/web/features/authentication/components/loading-button.tsx` for the submit button.

6. Use `EmailAutocomplete` from `apps/web/features/authentication/components/email-autocomplete.tsx` for the email input.

**UI constraint:** Do not change the layout, colors, fonts, or spacing of the login form. Only add or fix the functional behavior.

**Done criteria:**
- `bun run check-types` passes
- Visit `/login`, enter valid credentials → redirected to `/`
- Visit `/login`, enter new account details → account created, redirected to `/`
- Visit `/login`, enter wrong password → error message displayed, no crash

---

### TASK-009 — Verify guest migration hook fires correctly on sign-in

**Status:** `[x]` — Audited `use-guest-migration.ts`. Correctly keyed on `session?.user?.id`. Idempotent via `skriuw:migrated_to_${userId}` localStorage flag. Migrates notes and folders recursively. Clears localStorage after success. Stable mutation refs prevent stale closures. No changes needed.

**File(s):**
- `apps/web/features/notes/hooks/use-guest-migration.ts`
- `apps/web/features/notes/context/notes-context.tsx` (reference only)

**Root cause:**
When a guest user signs in, their notes stored in `localStorage` under `GUEST_USER_ID` should be migrated to the server. `use-guest-migration.ts` exists and is included in `NotesProvider`, but may have race conditions in its `useEffect` dependency array that cause it to fire at the wrong time or not at all.

**What to audit and fix:**

1. Open `use-guest-migration.ts`. Find the `useEffect` that triggers migration. Verify:
   - It only triggers when `session` changes from `undefined/null` to a real user session
   - It does NOT trigger on every render
   - It reads notes from `localStorage` keyed by `GUEST_USER_ID`
   - It calls the `createNote` mutation for each guest note
   - It clears the guest notes from `localStorage` after successful migration
   - It is guarded against running twice (use a `useRef` flag or `sessionStorage` key)

2. The migration should be idempotent. If it runs twice (e.g. due to React StrictMode double-invoke), it should not create duplicate notes. Add a guard:
   ```ts
   const hasMigratedRef = useRef(false)
   
   useEffect(() => {
     if (!session?.user || hasMigratedRef.current) return
     hasMigratedRef.current = true
     // run migration...
   }, [session?.user?.id])
   ```

3. The migration does not need to block the UI. It should be fire-and-forget with the notes appearing in the sidebar as TanStack Query invalidates.

4. After migration completes, call `queryClient.invalidateQueries({ queryKey: notesKeys.list(session.user.id) })` to refresh the notes list.

**Do not change:**
- The logic that determines which notes to migrate
- The `createNote` mutation calls
- `NotesProvider` — do not restructure how the hook is called

**Done criteria:**
- `bun run check-types` passes
- Open app as guest, create 2-3 notes
- Sign in to an account
- All guest notes should appear in the authenticated notes list
- Guest notes should be removed from localStorage after migration
- Migration should not run again on page refresh once completed

---

## Chapter 4 — Task Persistence

---

### TASK-010 — Add `immediatelySave` to `use-editor.ts`

**Status:** `[x]`

**Depends on:** TASK-001, TASK-005

**File(s):**
- `apps/web/features/editor/hooks/use-editor.ts`

**Root cause:**
The editor auto-saves on a 1000ms debounce. When a task block is inserted via slash menu and the user immediately clicks to open the task detail panel, the task hasn't been saved to the DB yet. The panel queries by `blockId` and gets "not found".

We need a way to trigger an immediate save (cancelling any pending debounced save) that can be called from outside the debounce cycle.

**What to change:**

1. In `use-editor.ts`, add `immediatelySave` to the hook:
   ```ts
   const immediatelySave = useCallback(() => {
     if (!editor || !noteId || readOnly) return
     // Cancel any pending debounced save
     if (saveTimeoutRef.current) {
       clearTimeout(saveTimeoutRef.current)
       saveTimeoutRef.current = undefined
     }
     // Run save synchronously
     handleSave()
   }, [editor, noteId, readOnly, handleSave])
   ```

2. Add `immediatelySave` to the return value of `useEditor`:
   ```ts
   return {
     editor,
     note,
     noteName,
     isLoading,
     setNoteName,
     handleSave,
     immediatelySave,  // ← add this
     error,
   }
   ```

3. Update the return type annotation at the top of the file (the `props` type):
   ```ts
   type props = {
     editor: BlockNoteEditor | null
     note: Note | null
     noteName: string
     isLoading: boolean
     setNoteName: (name: string) => void
     handleSave: () => void
     immediatelySave: () => void  // ← add this
     error: string | null
   }
   ```

**Do not change:**
- `handleSave` implementation
- Auto-save debounce logic
- Any other return values

**Done criteria:**
- `bun run check-types` passes
- `immediatelySave` is exported from `useEditor`
- Calling `immediatelySave()` triggers a save without the 1000ms delay

---

### TASK-011 — Dispatch save event from task block before opening panel

**Status:** `[x]`

**Depends on:** TASK-010

**File(s):**
- `apps/web/features/editor/slash-menu/task-block.tsx`
- `apps/web/features/editor/components/note-editor.tsx`

**Root cause:**
When the user clicks the "open task detail" arrow in a task block, it calls `useUIStore.getState().openTaskPanel(block.id)`. The task detail panel immediately queries the DB for this `blockId`. But the task hasn't been saved yet (auto-save hasn't fired). The panel finds nothing and shows "not found".

**What to change:**

**In `task-block.tsx`:**

Find the `onClick` handler on the "open detail" button (the circle-arrow icon on the right of the task block). Replace it:

```ts
// BEFORE:
onClick={(e) => {
  e.stopPropagation()
  e.preventDefault()
  const state = useUIStore.getState()
  if (state.taskStack.length > 0) {
    state.pushTask(block.id)
    return
  }
  state.openTaskPanel(block.id)
}}

// AFTER:
onClick={(e) => {
  e.stopPropagation()
  e.preventDefault()
  // Signal the active NoteEditor to save immediately before panel opens
  window.dispatchEvent(
    new CustomEvent('skriuw:save-before-task-open', { detail: { blockId: block.id } })
  )
  // Small delay to allow the save to start before panel queries the DB
  setTimeout(() => {
    const state = useUIStore.getState()
    if (state.taskStack.length > 0) {
      state.pushTask(block.id)
    } else {
      state.openTaskPanel(block.id)
    }
  }, 150)
}}
```

**In `note-editor.tsx`:**

Destructure `immediatelySave` from `useEditor`:
```ts
const { editor, note, isLoading, error, noteName, setNoteName, immediatelySave } = useEditor({
  noteId,
  autoSave,
  autoSaveDelay
})
```

Add a `useEffect` to listen for the custom event:
```ts
useEffect(() => {
  function handleSaveBeforeTaskOpen() {
    immediatelySave()
  }
  window.addEventListener('skriuw:save-before-task-open', handleSaveBeforeTaskOpen)
  return () => {
    window.removeEventListener('skriuw:save-before-task-open', handleSaveBeforeTaskOpen)
  }
}, [immediatelySave])
```

**Do not change:**
- Task block visual rendering (checkbox, content area, metadata row)
- `useUIStore` — do not modify the store
- Task panel components

**Done criteria:**
- `bun run check-types` passes
- Open a note
- Type `/task`, name the task "test task"
- Immediately click the open-detail arrow (without waiting)
- Task detail panel should open and show the task (may briefly show skeleton)
- Reload the page — the task should still be there

---

### TASK-012 — Add pending state to task detail panel before showing "not found"

**Status:** `[x]`

**File(s):**
- `apps/web/features/tasks/components/task-detail-panel.tsx`
- `apps/web/features/tasks/hooks/use-tasks-query.ts` (reference)

**Root cause:**
Even with TASK-011's 150ms delay, there is a race between "save fires" and "DB write completes". On slow connections or heavy load, the panel may query the DB before the task record exists. The current behavior is to immediately render "not found" or throw an error.

**What to change:**

1. Open `task-detail-panel.tsx`. Find where it handles `task === null` (or the error/empty state).

2. Add a brief waiting period before showing "not found". The panel should show its skeleton/loading state for up to 2 seconds while the task might still be saving:

   ```ts
   const [waitingForTask, setWaitingForTask] = useState(true)
   
   useEffect(() => {
     if (task || isLoading) {
       setWaitingForTask(false)
       return
     }
     // Give the save 2 seconds to complete before declaring "not found"
     const timer = setTimeout(() => setWaitingForTask(false), 2000)
     return () => clearTimeout(timer)
   }, [task, isLoading])
   
   // Reset when taskId changes
   useEffect(() => {
     setWaitingForTask(true)
   }, [taskId]) // where taskId is the block ID being displayed
   ```

3. In the render:
   ```tsx
   if (!task && (isLoading || waitingForTask)) {
     return <TaskDetailSkeleton />  // or whatever the existing skeleton component is
   }
   
   if (!task && !waitingForTask) {
     return <TaskNotFound />  // existing "not found" UI
   }
   ```

4. While waiting, also trigger a query refetch after 500ms to check if the task appeared:
   ```ts
   useEffect(() => {
     if (!task && !isLoading && waitingForTask) {
       const refetchTimer = setTimeout(() => {
         refetch()  // from the useQuery hook
       }, 500)
       return () => clearTimeout(refetchTimer)
     }
   }, [task, isLoading, waitingForTask, refetch])
   ```

**Do not change:**
- The task detail panel's visual design
- The task editing functionality
- The task query implementation

**Done criteria:**
- `bun run check-types` passes
- Open a brand new task immediately after creation
- Panel shows skeleton briefly, then shows the task
- Panel never shows "not found" for a task that was just created and saved

---

### TASK-013 — Audit `apps/web/app/api/tasks/sync/route.ts` for silent failures

**Status:** `[x]` — Audited. `requireMutation` auth check present. `noteId` validation present. `userId` scoping on both delete and insert. `try/catch` returns 500 on error. Atomic delete+insert in correct order. No silent failures found. No changes needed.

**File(s):**
- `apps/web/app/api/tasks/sync/route.ts`

**Root cause:**
The task sync route may have silent early returns (e.g. returning `200 OK` before completing the DB write) that cause tasks to appear saved but not actually be persisted.

**What to audit and fix:**

1. Open the route file. Verify the handler:
   - Calls `requireAuth()` or reads the session — if not authenticated, returns `401`
   - Reads `noteId` and `tasks` from the request body
   - Validates both are present — if missing, returns `400`
   - Deletes all existing tasks for `noteId` scoped to `userId`
   - Inserts the new tasks array
   - Returns `200` only AFTER both DB operations complete (not before)

2. Look for any `try/catch` blocks that swallow errors and return `200` even when the write fails. Fix them to return `500` with an error message:
   ```ts
   try {
     // ... db operations
   } catch (error) {
     console.error('Task sync failed:', error)
     return Response.json({ error: 'Failed to sync tasks' }, { status: 500 })
   }
   ```

3. Ensure the DB delete and insert are in the correct order (delete first, then insert). If they run in parallel via `Promise.all`, verify both are awaited before returning.

4. Verify `userId` scoping: the delete query must include `eq(tasks.userId, userId)` AND `eq(tasks.noteId, noteId)` — never delete tasks belonging to another user.

**Do not change:**
- The route's URL path
- The request/response shape
- Any auth middleware wiring

**Done criteria:**
- `bun run check-types` passes
- POST to `/api/tasks/sync` with valid payload → tasks appear in DB
- POST with missing `noteId` → `400` response
- POST without auth → `401` response

---

## Chapter 5 — Navigation & Loading Flicker

---

### TASK-014 — Reduce `showNotFound` timer in note page to 50ms

**Status:** `[x]`

**Depends on:** TASK-001, TASK-002, TASK-003

**File(s):**
- `apps/web/app/(app)/note/[...slug]/page.tsx`

**Root cause:**
The note page resolves `noteId` from the URL slug by searching the notes tree. There is a 200ms timer before showing "not found" — this was compensating for the async `getNote()` lookup that no longer exists after Chapter 1 fixes. With TanStack Query cache, `resolveNoteId` is synchronous once notes are loaded.

**What to change:**

Find the `setTimeout` in the note page that sets `showNotFound`:
```ts
timerRef.current = setTimeout(() => {
  setShowNotFound(true)
}, 200)
```

Change `200` to `50`:
```ts
timerRef.current = setTimeout(() => {
  setShowNotFound(true)
}, 50)
```

**Done criteria:**
- `bun run check-types` passes
- Navigate to a valid note → loads immediately, no "not found" flash
- Navigate to an invalid slug → "not found" appears within ~50ms

---

### TASK-015 — Add prefetch on sidebar note hover

**Status:** `[x]`

**File(s):**
- `apps/web/components/sidebar/sidebar-component.tsx` (or the file that renders individual note items in the sidebar tree — search for where note items are mapped)

**Root cause:**
When a user clicks a note in the sidebar, there is a brief moment where the note data is being fetched. If we prefetch on hover, the data is already in cache by the time the click happens, making navigation feel instant.

**What to change:**

1. Find the component that renders individual note/folder items in the sidebar. Search:
   ```bash
   grep -r "useNoteSlug\|getNoteUrl\|note\.id.*href\|router\.push.*note" apps/web/components/sidebar/ --include="*.tsx" -l
   ```

2. In that component, import `useQueryClient` and the query key factory:
   ```ts
   import { useQueryClient } from '@tanstack/react-query'
   import { notesKeys } from '@/features/notes/hooks/use-notes-query'
   ```

3. Add a `handleMouseEnter` handler on the clickable note item element:
   ```ts
   const queryClient = useQueryClient()
   
   function handleMouseEnter() {
     // Prefetch this note's detail into cache
     queryClient.setQueryData(
       notesKeys.detail(item.id),
       item  // the item is already in the tree — populate the detail cache directly
     )
   }
   ```

   Note: since the note data is already in `notesKeys.list(userId)`, we can populate `notesKeys.detail(id)` for free from the existing data — no network request needed.

4. Add `onMouseEnter={handleMouseEnter}` to the note item's root element.

**Do not change:**
- The sidebar item's visual design, layout, or click behavior
- The note navigation logic

**Done criteria:**
- `bun run check-types` passes
- Hover over a note in the sidebar
- Click it — note should load with zero visible delay (content already in cache)

---

## Chapter 6 — Sidebar & Pin UX

---

### TASK-016 — Sort pinned items to top of sidebar

**Status:** `[x]` — `sortItems` already implemented at line 1936 of `sidebar-component.tsx`. Verified it sorts pinned first, then by pinnedAt, then updatedAt, recursively. No changes needed.

**File(s):**
- `apps/web/components/sidebar/sidebar-component.tsx` (or the file that renders the sidebar tree — find where `items` is mapped)

**Root cause:**
Pinned items don't float to the top of the sidebar. They appear wherever they were when pinned. The sort must be applied to the items array before it is rendered, and applied recursively (also sort within folders).

**What to change:**

1. Find where the items array is consumed for rendering. It likely comes from `useNotesContext()` or is passed as a prop.

2. Before rendering, apply a sort function. Add this utility (either inline or in a nearby utils file):
   ```ts
   function sortItems(items: Item[]): Item[] {
     return [...items]
       .sort((a, b) => {
         // Pinned items first
         const aPinned = a.pinned ? 1 : 0
         const bPinned = b.pinned ? 1 : 0
         if (bPinned !== aPinned) return bPinned - aPinned
         // Among pinned: most recently pinned first
         if (a.pinned && b.pinned) {
           return ((b as any).pinnedAt ?? 0) - ((a as any).pinnedAt ?? 0)
         }
         // Among unpinned: most recently updated first
         return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
       })
       .map((item) => {
         if (item.type === 'folder' && item.children?.length) {
           return { ...item, children: sortItems(item.children) }
         }
         return item
       })
   }
   ```

3. Apply it where items are rendered:
   ```ts
   const sortedItems = sortItems(items)
   // render sortedItems instead of items
   ```

**Do not change:**
- The visual design of the sidebar
- The `items` array from the context (do not mutate it, only sort a copy)
- Folder expansion behavior

**Done criteria:**
- `bun run check-types` passes
- Pin a note → it immediately appears at the top of the sidebar list
- Pin multiple notes → they sort among themselves by most-recently-pinned first
- Unpin a note → it returns to normal position in the list

---

### TASK-017 — Replace pin icon with left-border accent on pinned items

**Status:** `[x]`

**File(s):**
- `apps/web/components/sidebar/sidebar-component.tsx` (the file rendering individual sidebar items)

**Root cause:**
The current pin indicator (icon button or checkbox on the left of the row) is visually noisy and unintuitive. The design goal is a subtle, clean indicator that an item is pinned without cluttering the row. A left-border accent using `border-brand-500` achieves this.

**What to change:**

1. Find the item row element for notes and folders in the sidebar. It likely has a class like `flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer`.

2. Add conditional border-left styling for pinned items:
   ```tsx
   <div
     className={cn(
       'flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer group hover:bg-accent transition-colors',
       item.pinned && 'border-l-2 border-brand-500 pl-[calc(0.5rem-2px)]'
     )}
   >
   ```
   The `pl-[calc(0.5rem-2px)]` compensates for the 2px border so the text doesn't shift.

3. Remove any standalone pin icon, pin button, or pin checkbox that appears inline in the item row. The pin/unpin action should exist only in the context menu (right-click).

4. Do NOT remove the pin/unpin option from the context menu — keep it there.

**UI constraint:**
- `border-brand-500` maps to `hsl(var(--brand-500))` — a teal/green accent. This is intentional per the design system.
- Do not add any text label, tooltip, or icon for the pin state inline in the row.
- The left border should only be 2px wide.

**Done criteria:**
- `bun run check-types` passes
- Pinned items show a subtle teal left-border accent
- No pin icon/checkbox visible inline in the row
- Unpinned items look identical to before
- Dark mode: border accent visible in both light and dark themes

---

## Chapter 7 — Context Menu Polish

---

### TASK-018 — Fix spelling mistakes in context menu labels

**Status:** `[x]` — Audited `sidebar-component.tsx` context menu labels. All spellings correct: "Pin to top", "Unpin from top", "Move to...", "Move folder to...", "Rename", "Duplicate", "Archive", "Delete". No misspellings found. No changes needed.

**File(s):**
Search for context menu files:
```bash
grep -rl "ContextMenu\|contextMenu\|context-menu\|\"Move\"\|\"Rename\"\|\"Duplicate\"" apps/web/features/shortcuts/ apps/web/components/sidebar/ --include="*.tsx" --include="*.ts"
```

**Root cause:**
The context menu (right-click on sidebar items) contains spelling mistakes in its action labels. These were reported in `problems.md` Issue 10.

**What to change:**

1. Open the identified files. Audit every string literal used as a menu item label.

2. Common corrections to look for:
   - "Favourit" → "Favorite"
   - "Dupplicate" → "Duplicate"
   - "Archieve" → "Archive"
   - "Permenent" → "Permanent"
   - "Move to floder" → "Move to folder"
   - Any other obvious misspelling

3. Also check the Move submenu specifically (the secondary popup triggered by hovering "Move"). Fix all label strings there.

4. Verify the standard label set is:
   - "Open"
   - "Rename"
   - "Duplicate"
   - "Move to folder"
   - "Pin" / "Unpin"
   - "Favorite" / "Unfavorite"
   - "Archive"
   - "Delete"
   - "Restore" (in trash context)
   - "Delete permanently" (in trash context)

**Do not change:**
- The structure, ordering, or grouping of menu items
- Any component logic or handlers
- Visual styling

**Done criteria:**
- `bun run check-types` passes
- Right-click any note → all menu labels spelled correctly
- Hover "Move to folder" → submenu labels spelled correctly

---

### TASK-019 — Fix "Move to folder" submenu rendering

**Status:** `[x]` — Audited. Move submenu uses `ContextMenuSub` / `ContextMenuSubTrigger` / `ContextMenuSubContent` / `MoveFolderMenu` correctly. "Move to root" option present. Current parent folder excluded from targets. Bulk move supported. No changes needed.

**File(s):**
- Same files identified in TASK-018
- Also check `apps/web/components/sidebar/` for the context menu component

**Root cause:**
The "Move to folder" option in the context menu opens a secondary submenu, but it renders inconsistently — it may appear at the wrong position, overlap other elements, or show incorrect folder names.

**What to change:**

1. Find the submenu implementation for "Move to folder". It should use Radix UI's `DropdownMenuSub`, `DropdownMenuSubTrigger`, and `DropdownMenuSubContent` pattern.

2. Ensure the structure matches:
   ```tsx
   <DropdownMenuSub>
     <DropdownMenuSubTrigger>Move to folder</DropdownMenuSubTrigger>
     <DropdownMenuSubContent>
       <DropdownMenuItem onClick={() => moveItem(itemId, null)}>
         Move to root
       </DropdownMenuItem>
       <DropdownMenuSeparator />
       {folders.map((folder) => (
         <DropdownMenuItem
           key={folder.id}
           onClick={() => moveItem(itemId, folder.id)}
           disabled={folder.id === item.parentFolderId}
         >
           {folder.name}
         </DropdownMenuItem>
       ))}
     </DropdownMenuSubContent>
   </DropdownMenuSub>
   ```

3. The `folders` list should come from `useNotesContext().items` filtered to `type === 'folder'`. Use `flattenNotes` or a similar utility from `apps/web/features/notes/utils/` to get a flat list of all folders.

4. The current parent folder should be `disabled` (grayed out, not clickable) to indicate it's the current location.

5. "Move to root" should always appear at the top, allowing users to move items out of all folders.

**Do not change:**
- The overall context menu structure outside the Move submenu
- The `moveItem` function call signature
- Visual styling beyond fixing the submenu component structure

**Done criteria:**
- `bun run check-types` passes
- Right-click a note → hover "Move to folder"
- Submenu appears with list of available folders
- Click a folder → note moves to that folder, sidebar updates
- "Move to root" moves the note to the top level

---

## Chapter 8 — Z-Index & Popover Stacking

---

### TASK-020 — Fix top bar popover/tooltip rendering below sidebar

**Status:** `[x]` — Audited. `TooltipContent` in `packages/ui/tooltip.tsx` already has `z-50` and renders via Radix UI portal (outside DOM tree, sibling of `<body>`). Right sidebar is `z-40 fixed`. Portal-rendered tooltips are not affected by parent stacking contexts. No z-index conflict exists. No changes needed.

**File(s):**
- `apps/web/components/layout/top-toolbar.tsx`
- Possibly `apps/web/components/layout/app-layout-shell.tsx` (check z-index of sidebar container)

**Root cause:**
The top bar has a toggle button (likely a help or info button) that shows a popover/tooltip on hover. This popover renders underneath the sidebar because its z-index is lower than the sidebar's z-index. Reported in `problems.md` Issue 11.

**What to change:**

1. Open `top-toolbar.tsx`. Find the button that triggers the popover/tooltip. Identify the component used — it may be `Popover`, `Tooltip`, `HoverCard`, or a custom div.

2. Check if the content component renders via a Radix UI Portal (which would handle z-index automatically). If it does render via a portal but still appears behind the sidebar, the sidebar has an abnormally high z-index that needs adjusting.

3. If the popover does NOT use a portal, add `className="z-50"` to the content component:
   ```tsx
   <PopoverContent className="z-50 ...existing classes...">
   ```
   or
   ```tsx
   <TooltipContent className="z-50 ...existing classes...">
   ```

4. If the sidebar container has a `z-index` higher than Radix UI's default portal z-index, find the sidebar's CSS and reduce its z-index to `z-20`:
   - Look in `apps/web/components/layout/app-layout-shell.tsx`
   - Look in `apps/web/components/sidebar/sidebar-layout.tsx`
   - Search: `grep -r "z-\[" apps/web/components/layout/ apps/web/components/sidebar/`

5. The z-index hierarchy should be:
   ```
   z-10   main content area
   z-20   sidebar
   z-30   top toolbar bar itself
   z-40   dropdowns, context menus, popovers
   z-50   modals, dialogs, toasts
   ```

**Do not change:**
- The functionality of the top bar button
- The content/text inside the popover
- Any layout or spacing

**Done criteria:**
- `bun run check-types` passes
- Hover the top bar toggle button
- The popover/tooltip appears ABOVE the sidebar in both open and closed sidebar states
- Dark mode: popover background is correct (`bg-popover` token)

---

## Chapter 9 — Elysia Backend (Future)

---

### TASK-021 — Scaffold `apps/api` Elysia server structure

**Status:** `[ ]`

**Note:** Do not start this task until Chapters 1–8 are complete and the app is stable.

**File(s) to create:**
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/index.ts`
- `apps/api/src/db.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/middleware/cors.ts`

**What to create:**

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
    "@elysiajs/cors": "^1.3.0"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "@types/node": "^24.2.1"
  }
}
```

`apps/api/src/index.ts`:
```ts
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'

const app = new Elysia()
  .use(cors({
    origin: [
      'http://localhost:3000',
      'tauri://localhost',
      'https://tauri.localhost',
    ],
    credentials: true,
  }))
  .get('/health', () => ({ ok: true, ts: Date.now() }))
  .listen(3001)

console.log(`API running at http://localhost:${app.server?.port}`)

export type App = typeof app
```

`apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

After scaffolding, add `apps/api` to the root `pnpm-workspace.yaml` (or `bun workspaces`) and to `turbo.json` pipeline.

**Done criteria:**
- `cd apps/api && bun run dev` starts without errors
- `curl http://localhost:3001/health` returns `{"ok":true,"ts":...}`
- `bun run check-types` passes in `apps/api`

---

### TASK-022 — Migrate notes API routes to Elysia

**Status:** `[ ]`

**Depends on:** TASK-021

**File(s):**
- `apps/web/app/api/notes/route.ts` (source — read only)
- `apps/api/src/routes/notes.ts` (create this)
- `apps/api/src/index.ts` (update to include notes routes)

**What to create:**

Translate the logic from the Next.js notes route into an Elysia route group. The DB query logic is identical — only the framework wrapper changes.

Reference the existing Next.js route for the exact DB queries, auth checks, and response shapes. Do not change the business logic.

Elysia route structure:
```ts
import { Elysia, t } from 'elysia'
// import db, auth middleware, schema types

export const notesRoutes = new Elysia({ prefix: '/notes' })
  .get('/', async ({ userId }) => {
    // GET all notes for userId — same logic as existing GET handler
  })
  .post('/', async ({ body, userId }) => {
    // POST create note — same logic as existing POST handler
  }, {
    body: t.Object({ /* zod/typebox schema matching existing body */ })
  })
  .put('/', async ({ body, userId }) => {
    // PUT update note
  })
  .delete('/', async ({ body, userId }) => {
    // DELETE note
  })
```

Register in `apps/api/src/index.ts`:
```ts
import { notesRoutes } from './routes/notes'
app.use(notesRoutes)
```

**Done criteria:**
- `bun run check-types` passes in `apps/api`
- `GET /notes` returns the user's notes (with auth cookie)
- `POST /notes` creates a note and returns it
- `PUT /notes` updates a note
- `DELETE /notes` soft-deletes a note

---

## Chapter 10 — Monorepo Cleanup (Future)

---

### TASK-023 — Audit and remove `packages/core` if empty

**Status:** `[ ]`

**Note:** Do this last — after all other chapters are complete.

**What to do:**

1. List all files in `packages/core`:
   ```bash
   find packages/core -type f | sort
   ```

2. Read each file. If the package contains only re-exports of other packages or is completely empty:
   - Remove all imports of `@skriuw/core` from the codebase:
     ```bash
     grep -r "@skriuw/core" apps/ packages/ --include="*.ts" --include="*.tsx" -l
     ```
   - Update each import to point to the original source
   - Delete `packages/core/` directory
   - Remove it from `pnpm-workspace.yaml` and root `package.json`
   - Remove it from `turbo.json`

3. If `packages/core` contains significant non-trivial code, document what it contains and do NOT delete it. Create a follow-up task instead.

**Done criteria:**
- `bun run check-types` passes
- `bun run build` succeeds
- `bun run dev` starts without errors
- No broken imports referencing `@skriuw/core`

---

### TASK-024 — Evaluate and fold `packages/env` into `apps/web`

**Status:** `[ ]`

**Note:** Do this last — after all other chapters are complete.

**What to do:**

1. Read the contents of `packages/env`:
   ```bash
   cat packages/env/src/server.ts
   cat packages/env/src/client.ts
   ```

2. If it contains only Zod env validation schemas (no complex logic):
   - Create `apps/web/lib/env.ts` and copy the content there
   - Update all imports from `@skriuw/env` to `@/lib/env`
   - Delete `packages/env/`
   - Remove from workspace config and `turbo.json`

3. If `packages/env` is used by packages OTHER than `apps/web` (e.g. by `packages/db`), keep it as-is. Do not move it.

**Done criteria:**
- `bun run check-types` passes in all packages
- `bun run dev` starts without errors
- Environment variables are still validated on startup

---

## Task Summary Table

| Task ID | Chapter | Description | Status | Depends On |
|---|---|---|---|---|
| TASK-001 | 1 — Editor | Replace local useState with useNoteQuery | `[x]` | — |
| TASK-002 | 1 — Editor | Remove replaceBlocks/queueMicrotask hack | `[x]` | TASK-001 |
| TASK-003 | 1 — Editor | Add key={noteId} for clean editor remount | `[x]` | TASK-001, TASK-002 |
| TASK-004 | 1 — Editor | Remove secondary useState in NoteEditor | `[x]` | TASK-001 |
| TASK-005 | 1 — Editor | Verify auto-save cleanup on unmount | `[x]` | — |
| TASK-006 | 2 — Cache | Remove onSettled invalidation from updateNote | `[x]` | — |
| TASK-007 | 2 — Cache | Tune staleTime and disable refetchOnWindowFocus | `[x]` | — |
| TASK-008 | 3 — Auth | Fix login-form sign-in and sign-up flows | `[x]` | — |
| TASK-009 | 3 — Auth | Verify guest migration hook | `[x]` | TASK-008 |
| TASK-010 | 4 — Tasks | Add immediatelySave to use-editor | `[x]` | TASK-001, TASK-005 |
| TASK-011 | 4 — Tasks | Dispatch save event before opening task panel | `[x]` | TASK-010 |
| TASK-012 | 4 — Tasks | Add pending state to task detail panel | `[x]` | — |
| TASK-013 | 4 — Tasks | Audit task sync route for silent failures | `[x]` | — |
| TASK-014 | 5 — Navigation | Reduce showNotFound timer to 50ms | `[x]` | TASK-001, TASK-002, TASK-003 |
| TASK-015 | 5 — Navigation | Add prefetch on sidebar note hover | `[x]` | — |
| TASK-016 | 6 — Sidebar | Sort pinned items to top of sidebar | `[x]` | — |
| TASK-017 | 6 — Sidebar | Replace pin icon with left-border accent | `[x]` | — |
| TASK-018 | 7 — Context Menu | Fix spelling in context menu labels | `[x]` | — |
| TASK-019 | 7 — Context Menu | Fix Move to folder submenu rendering | `[x]` | — |
| TASK-020 | 8 — Z-Index | Fix top bar popover z-index | `[x]` | — |
| TASK-021 | 9 — Backend | Scaffold Elysia apps/api server | `[ ]` | All Ch. 1–8 |
| TASK-022 | 9 — Backend | Migrate notes routes to Elysia | `[ ]` | TASK-021 |
| TASK-023 | 10 — Cleanup | Remove packages/core if empty | `[ ]` | All tasks |
| TASK-024 | 10 — Cleanup | Fold packages/env into apps/web | `[ ]` | All tasks |

---

*End of AGENT_TASKS.md*