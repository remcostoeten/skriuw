# DH-08: Live external Markdown reconciliation

Status: **partially implemented — conflict-safe saves (Phase 1) landed; passive watcher + conflict UI pending**

## What landed (Phase 1: revision-checked saves)

The plan's non-negotiable foundation — "do not implement watching without conflict-safe saves", and per the Rollback section the revision check stays enabled even without the watcher:

- `vault.rs` computes a content-derived revision (`note_revision` / `current_note_revision`, SHA-256 of the canonical file bytes) — not modification-time based.
- `note_vault_revision(id)` Tauri command returns a note's current on-disk revision; the desktop backend records it on every `getNote`/`getNotes` in a private `vaultRevisions` map (never added to the shared `NoteFile`).
- `save_note` gained `expectedVaultRevision` and `force`. Under the vault write lock it re-reads the file's current revision immediately before writing; a mismatch returns `VAULT_CONFLICT:<id>` and leaves the external content untouched. Its result now carries the new `vaultRevision`, which the backend caches for the next save.
- Tests: revision is stable across reads, changes on content/frontmatter edits, changes on an external edit, and is `None` for a note with no file. 134 Rust tests, clippy, fmt green; SPA typecheck/build and 23 workspace-backend tests green.

Result: normal autosave can no longer overwrite a newer external edit — the save is rejected and surfaces through the existing DH-07 save-error banner (which never overwrites on retry).

## What remains

The passive watcher and full conflict workflow (Phases 2–9): `vault_watcher.rs` (notify-based recursive watch, debounce, rename coalescing, ignored-path filtering), targeted per-entity reconciliation, revision-aware internal-write suppression, the `DesktopVaultSync` frontend listener + "Updated from disk" clean refresh, the dirty/conflict state machine and conflict-copy resolution UI, external create/delete/rename handling, watcher lifecycle (pause on DH-02 restore, rebind on root change, shutdown on exit), status UI, and the 10,000-file performance validation.

---

Original plan follows.

Priority: **P1 — local-first product promise**  
Primary owner: Rust vault plus desktop backend synchronization  
Estimated size: 5–8 focused implementation days

## Outcome

Markdown files added, edited, renamed, moved, or deleted outside Skriuw appear in the running desktop application without restart. Internal autosaves do not create event loops. Concurrent external edits and unsaved editor changes preserve both versions instead of silently overwriting either one.

## Why this is required

The vault is marketed as a folder of plain Markdown files, but externally added files surface only on launch reconciliation. The UI reads through SQLite, so external changes made while Skriuw runs remain stale. A naive watcher that simply invalidates queries would introduce a worse failure: an autosave could overwrite an external edit based on stale editor state.

This packet therefore includes both watching and optimistic revision checks. Do not implement watching without conflict-safe saves.

## Dependencies

DH-01 must land first. This plan relies on atomic canonical writes and a clear canonical-save/derived-index seam. Coordinate with DH-02 so watcher lifecycle pauses during staged restore and root swaps.

## Read first

- `docs/desktop-local-first.md`
- `apps/desktop/src-tauri/src/vault.rs`
- `apps/desktop/src-tauri/src/storage.rs`
- `apps/desktop/src-tauri/src/lib.rs`, especially startup and `reconcile_index`
- `apps/web/src/core/workspace-backend/tauri-backend.ts`
- `apps/web/src/core/workspace-backend/write-queue.ts`
- `apps/web/src/features/desktop/desktop-index-sync.tsx`
- `apps/web/src/features/notes/hooks/use-debounced-save.ts`
- `apps/web/src/features/notes/store.ts`
- `apps/web/src/features/notes/lib/note-cache.ts`
- sync conflict-copy implementation in `apps/web/src/domain/sync/`

## Locked product behavior

1. Watch the configured vault recursively.
2. Initial scope includes note Markdown, journal Markdown, folder metadata, journal-tag metadata, and trash metadata. Cover assets may emit gallery refresh events but do not trigger note reconciliation.
3. Ignore `.skriuw/trash`, Skriuw staging/rollback directories, and atomic temporary files except when their final rename becomes visible.
4. Internal writes may produce filesystem events, but they must not cause repeated reconciliation or UI churn.
5. Revision checks use content-derived hashes, not modification time alone.
6. Every note body read through the desktop backend records the canonical vault revision known to that editor/cache.
7. Normal save includes `expectedVaultRevision`. Rust rejects the save when the current canonical revision differs.
8. On conflict, preserve external content as canonical and preserve the local draft as a conflict copy by default. Never silently choose last writer.
9. A clean active editor may refresh automatically after an external change, with a small visible notice.
10. A dirty/saving/error editor must not be replaced automatically.
11. External rename/move with stable frontmatter `id` preserves identity and open tabs.
12. Frontmatter-less files retain current derived-id behavior; document that external rename may be interpreted as remove+add until an id is written.
13. Watcher failure is visible and recoverable; ordinary editing remains available.
14. Restore, vault-root change, and app shutdown stop/restart watchers cleanly.

## Proposed event and revision interfaces

### Rust revision

Use SHA-256 of the canonical serialized file bytes or another stable cryptographic content hash already available in the crate. The revision must change for frontmatter or body changes and remain stable across repeated reads.

Change the normal save result to include the newly committed revision:

```rust
pub struct SaveNoteResult {
    pub version_id: Option<String>,
    pub version_changed: bool,
    pub vault_revision: String,
}
```

Add `expected_vault_revision: Option<String>` to the save request. `None` is allowed only for new/imported notes or an explicit force/conflict-resolution path.

### TypeScript revision cache

Keep desktop revisions private to `tauri-backend.ts` rather than adding a server concept to shared `NoteFile`:

```ts
const vaultRevisions = new Map<string, string>();
```

Every desktop `getNote/getNotes` response must include revision metadata and update this map. `updateNote` sends the last known value and replaces it with the save result's value.

### Change event

Emit one coalesced event such as:

```ts
type VaultChangeEvent = {
	generation: number;
	changedNoteIds: string[];
	deletedNoteIds: string[];
	addedNoteIds: string[];
	foldersChanged: boolean;
	journalsChanged: boolean;
	tagsChanged: boolean;
	coversChanged: boolean;
};
```

Do not send note bodies over events. Consumers refetch through the backend.

## Implementation phases

### Phase 1: Revision-aware Rust reads and saves

1. Add a helper that reads canonical bytes and returns parsed note plus revision in one filesystem read where practical.
2. Add revision to Tauri read wire types without changing cloud/server types.
3. Add expected revision to the DH-01 save request.
4. While holding the vault write lock, compare expected revision with the current file revision immediately before atomic replacement.
5. Return a typed conflict error containing note id, expected revision, and actual revision—but no note body.
6. Return the new revision after successful write.
7. Imports/creates use explicit semantics:
    - Create fails or resolves naming/id collision safely.
    - Import may use force only because its higher-level flow already stages/backs up and defines conflict policy.
8. Add an explicit force-save command or request flag used only after user conflict resolution. Do not let normal autosave set it.

### Phase 2: Targeted vault reconciliation

Refactor full `reconcile_index` so watcher events can reuse per-entity operations:

- Reconcile one changed/added note by stable id and path.
- Remove one missing note from derived index only after confirming it is absent from the canonical vault.
- Reconcile folders and journal metadata as small batches.
- Return a summary used to build the frontend event.

Do not scan and parse the entire vault for every single event. A bounded full rescan remains the fallback for overflow/ambiguous rename events.

### Phase 3: Watcher module

Add `apps/desktop/src-tauri/src/vault_watcher.rs` using a maintained cross-platform watcher adapter.

Responsibilities:

1. Own watcher thread/task and shutdown channel.
2. Normalize create/modify/remove/rename events into paths under the canonical root.
3. Debounce event bursts, initially around 200–400 ms, then tune with tests.
4. Wait for file stability when an external tool writes through truncate+append.
5. Coalesce rename pairs where the platform reports them; otherwise reconcile old and new paths safely.
6. Filter ignored paths and Skriuw temporary markers.
7. Perform targeted reconciliation off the UI/command thread.
8. Emit one summary event per coalesced batch.
9. On queue overflow or watcher error, emit degraded status and schedule a full rescan.

Manage it as application state with methods:

- `start(root)`
- `pause()`
- `rebind(root)`
- `shutdown()`
- `status()`

### Phase 4: Suppress internal event loops

Do not rely only on a fixed time window. Use revision-aware suppression:

1. After an internal atomic write, record final path plus new revision in a bounded recent-write registry.
2. When a watcher event arrives, compute/read the resulting revision.
3. If path+revision matches a recent internal commit, consume the registry entry and skip UI invalidation.
4. Expire entries after a short bounded interval and cap registry size.
5. Atomic temporary paths are ignored by marker/name; final rename is matched by revision.
6. Internal moves/deletes record equivalent operation markers so they do not appear as external changes.

Even suppressed events may be used to confirm watcher health; they must not trigger another write.

### Phase 5: Frontend listener and clean refresh

Create `DesktopVaultSync` near `DesktopIndexSync`:

1. Subscribe before polling watcher status to close startup races, following the pattern already documented in `DesktopIndexSync`.
2. For added/deleted/changed inactive notes, update or invalidate metadata/detail/backlink/graph/tag/people caches narrowly.
3. For an active note with no dirty, saving, or error state, refetch detail and reconcile editor state while preserving selection when possible.
4. Show “Updated from disk” with undo/history guidance; do not use an alarming modal.
5. For folder/journal/tag changes, invalidate only their query families.
6. If a full rescan event occurs, invalidate all desktop workspace query families once.

### Phase 6: Dirty-state and conflict workflow

1. Extend note save state to distinguish `dirty`, `saving`, `saved`, `error`, and `conflict`.
2. Mark dirty synchronously when editor content diverges, before debounce.
3. If an external event targets a dirty note, keep the draft mounted and mark conflict pending. Do not refetch into the editor.
4. The next autosave revision check must fail as conflict rather than overwrite disk.
5. Open a non-blocking but persistent conflict surface with:
    - **Compare versions**
    - **Keep disk version; save my draft as conflict copy**
    - **Keep my version; save disk version as conflict copy, then force save**
6. Default action and window-close behavior preserve both versions.
7. Reuse the existing cloud-sync conflict-copy naming/domain logic where possible. Do not duplicate incompatible title/date rules.
8. Conflict copies must receive new ids and clearly identify source/time without overwriting an existing note.
9. Version history should record explicit `external-change` and `conflict-resolution` reasons if the current model can safely add them; otherwise document the chosen existing reason.

### Phase 7: External create/delete/rename behavior

- **Create:** parse, index, emit added id, show in list without selecting automatically.
- **Edit:** update canonical row and derived links/titles; clean open note refreshes.
- **Delete clean note:** remove derived rows, close or mark missing tab, select safe fallback, retain recoverability only if external tool did not use Skriuw trash.
- **Delete dirty note:** preserve local draft as conflict/recovered copy before removing the missing canonical note from UI.
- **Rename/move with id:** update name/parent/path while preserving open tab and recent-note identity.
- **Invalid Markdown/frontmatter:** leave file untouched, exclude unsafe partial update from index, emit an actionable warning with reveal-file action.

### Phase 8: Lifecycle and status UI

1. Start watcher after initial reconciliation and managed state setup.
2. Pause before DH-02 restore commit and reset operations.
3. Rebind after successful vault-root change/restore and reconciliation.
4. Shut down before process exit.
5. Expose watcher status in desktop Data settings: active, rescanning, degraded, stopped.
6. Provide **Rescan now** and **Restart watcher** actions.
7. Watcher failure never disables normal in-app saves.

### Phase 9: Performance safeguards

Test with 10,000 Markdown files:

- Initial watcher start does not parse the entire vault beyond existing reconciliation.
- One external edit performs targeted work.
- A 500-file Git checkout is coalesced and bounded.
- Event queue memory is bounded.
- Full rescan runs off the UI thread and emits one completion event.

Document median event-to-UI latency and CPU usage methodology. Target ordinary single-file visibility within one second on local storage.

## Required tests

### Revision tests

- Read returns stable revision.
- Content/frontmatter change changes revision.
- Matching expected revision saves.
- Stale expected revision returns conflict and leaves disk unchanged.
- Force path works only when explicitly requested.

### Watcher normalization tests

- Create/modify/delete/rename sequences coalesce correctly.
- Internal atomic write is suppressed exactly once.
- Same-path external edit after internal write is not incorrectly suppressed when revision differs.
- Ignored temp/trash/staging paths produce no workspace change.
- Overflow schedules one full rescan.

### Reconciliation tests

- External add/edit/delete/rename/move updates SQLite notes, FTS, links, titles, and folders.
- Invalid file leaves previous valid index row or marks it safely without deleting canonical bytes.
- Full rescan converges to the same result as launch reconciliation.

### Frontend conflict tests

- Clean active note refreshes and says updated from disk.
- Dirty active note is not replaced.
- Stale autosave becomes `conflict`.
- Each resolution option preserves both bodies exactly.
- Window close during conflict preserves the draft.
- Deleted dirty note becomes a recovered/conflict copy.

### Lifecycle tests

- Restore pauses watcher and restarts at final root.
- Root rebind watches only the new root.
- Shutdown joins/stops worker without hanging.
- Degraded watcher status and manual rescan recover.

## Acceptance criteria

- [ ] External note add/edit/delete/rename/move appears without restart. **PENDING (watcher).**
- [ ] Ordinary single-file changes appear within one second on local storage. **PENDING (watcher).**
- [ ] Internal saves do not cause event loops or redundant UI refresh. **PENDING (suppression registry, with the watcher).**
- [x] Normal autosave cannot overwrite a newer external revision. (`expectedVaultRevision` check in `save_note`.)
- [ ] Every conflict resolution preserves both external and local content. **PARTIAL — data is preserved (the save is rejected, external content untouched); the resolution UI (keep-both conflict copy) is pending.**
- [ ] Targeted changes avoid full-vault scans; overflow has a bounded fallback. **PENDING (targeted reconcile, with the watcher).**
- [ ] Watcher pauses/rebinds across restore, reset, root change, and shutdown. **PENDING (watcher lifecycle).**
- [ ] Invalid external files remain untouched and produce actionable warnings. **PENDING (watcher).**
- [ ] 10,000-file and burst tests remain responsive and memory-bounded. **PENDING (watcher).**
- [x] `docs/desktop-local-first.md` documents live-edit and conflict semantics. (Conflict-safe save section added; watcher semantics to follow.)

## Verification commands

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml vault_watcher
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
bun test apps/web/__tests__/core/workspace-backend apps/web/__tests__/features/notes
bun run --cwd packages/web-spa build
bun run desktop:check
git diff --check
```

Manual verification must use a disposable vault and at least two external editors that write differently: one atomic-rename editor and one truncate/write editor.

## Rollback

Watcher behavior must be feature-gated internally for one release so it can be disabled if a platform adapter is unstable. Keep revision checks enabled even if passive watching is disabled; they protect against external overwrites whenever a save occurs. Disabling the watcher falls back to launch reconciliation, not data deletion or last-write-wins.

## Out of scope

- Multi-process simultaneous Skriuw instances; single-instance protection remains.
- Network filesystem guarantees beyond best-effort documented support.
- Full collaborative merging of Markdown text.
- Git integration UI.
- Rich-content sidecar synchronization.

## Agent handoff template

Report:

- Watcher library and platform behavior.
- Revision and internal-write suppression design.
- Exact conflict preservation workflow.
- Event-to-UI latency and large-vault results.
- Lifecycle integration with restore/reset/root changes.
- Platform verification matrix and any feature-gated limitation.
