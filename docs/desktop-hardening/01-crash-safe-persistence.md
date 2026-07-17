# DH-01: Crash-safe workspace persistence

Status: **implemented**  
Priority: **P0 — data safety**  
Primary owner: Rust desktop persistence  
Estimated size: 2–4 focused implementation days

## Outcome

Every note, folder metadata, journal entry, journal-tag file, trash index, and settings-like vault metadata write leaves a complete old file or a complete new file after an application crash, process kill, full disk, or write error. A logical note save also leaves vault content and the derived SQLite rows in a state that startup reconciliation can deterministically repair.

## Why this is required

`VaultStore::upsert_note` currently removes the previous path before writing a renamed note, then uses `fs::write`, which truncates the target in place. `save_note` subsequently updates SQLite, links, and version history through separate calls. Failures can therefore produce:

- A missing note after a rename followed by write failure.
- A truncated Markdown file after a crash during `fs::write`.
- New vault content with stale SQLite links or history.
- New SQLite content with incomplete derived rows when a later step fails.

The vault is canonical, so the design should optimize for never losing or corrupting the canonical file. SQLite may temporarily lag, but the lag must be detectable and repairable.

## Read first

- `docs/desktop-local-first.md`
- `apps/desktop/src-tauri/src/vault.rs`
- `apps/desktop/src-tauri/src/storage.rs`
- `apps/desktop/src-tauri/src/lib.rs`, especially `save_note`, `upsert_note`, and `reconcile_index`
- `apps/desktop/src-tauri/src/versioning.rs`
- `apps/web/src/core/workspace-backend/tauri-backend.ts`, especially `updateNote` and `createNote`

## Locked design decisions

1. The final Markdown path remains human-readable and based on the sanitized note name.
2. Canonical file replacement uses a temporary sibling file followed by rename. A temporary file must be on the same filesystem as its final path.
3. The new file is flushed before rename. On platforms where directory flushing is supported, flush the parent after rename.
4. For a rename or move, do not delete the previous path until the new path is durably installed.
5. If the old and new paths differ, install the new file first, then remove the old file. If old-path removal fails, return an error and retain both complete files; duplicate cleanup is safer than data loss.
6. SQLite remains derived. Do not attempt a false cross-filesystem/SQLite distributed transaction.
7. Group all derived SQLite updates for one save—note row, title/link rows, and version decision—inside one SQLite transaction.
8. A SQLite failure after the vault commit returns an error and schedules or marks reconciliation. It must never roll the canonical Markdown backward using a potentially stale SQLite snapshot.
9. Do not change version coalescing or retention rules.
10. Do not change the TypeScript `WorkspaceBackend` interface in this packet.

## Target module shape

Add a small internal atomic-file implementation in `vault.rs` or a new `atomic_file.rs` private to the Rust crate:

```rust
fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()>;
```

Its interface contract must state:

- Creates the parent directory if required.
- Writes a uniquely named sibling temporary file with create-new semantics.
- Writes all bytes and calls `sync_all` on the file.
- Renames the temporary file over the destination using a platform-correct replacement path.
- Removes the temporary file on any pre-rename error.
- Never follows a caller-controlled temporary path.
- Returns only after the replacement is complete.

Add a transactional storage method whose input contains everything derived from one note save. Prefer a request struct over adding more positional arguments:

```rust
pub struct SaveNoteIndex<'a> {
    pub note: &'a Note,
    pub links: &'a [NoteLinkInput],
    pub title_keys: &'a [String],
    pub reason: &'a str,
    pub now_ms: i64,
}

pub fn save_note_index(&self, input: SaveNoteIndex<'_>) -> rusqlite::Result<Option<String>>;
```

The exact name may change, but the interface must represent one derived-index commit rather than four independent operations.

## Implementation phases

### Phase 1: Atomic file primitive

1. Add the internal helper and focused tests using `tempfile`.
2. Generate temporary names in the same parent directory. Include process id plus UUID or use a securely unique create-new loop.
3. Ensure cleanup runs on serialization, write, flush, and rename failures.
4. Handle Windows replacement semantics explicitly. If `std::fs::rename` cannot replace an existing file on Windows, use a safe two-step approach that keeps a recoverable old file until the new file is installed. Document the platform behavior in code.
5. Do not use `/tmp`, `$HOME`, or the application cache for temporary canonical files.

### Phase 2: Convert canonical and metadata writes

Replace direct `fs::write` calls in `VaultStore` for:

- `folders.json`
- Note Markdown
- `trash.json`
- Cover bytes, if overwriting an existing asset is possible
- Journal Markdown
- Journal tags metadata

For note rename/move:

1. Resolve the previous path.
2. Atomically install the new target.
3. Update the path cache to the new target.
4. Remove the previous path only after successful installation.
5. If removal fails, invalidate the path cache and return an actionable error mentioning both paths.

### Phase 3: One SQLite transaction per logical save

1. Introduce the request struct.
2. Refactor existing `upsert_note_with`, `replace_note_links_with`, and version helpers so they accept a transaction/connection reference without opening nested locks.
3. In one transaction:
    - Upsert the note.
    - Replace title keys and link rows.
    - Apply the existing version insertion/coalescing decision.
    - Commit.
4. Return the version id from the transaction.
5. Change Tauri `save_note` to perform exactly two top-level operations: canonical vault commit, then derived-index transaction.
6. Keep the old narrow commands temporarily if other callers still use them. Mark them as compatibility paths and do not route normal saves through them.

### Phase 4: Detect and repair derived-index lag

1. On a derived transaction failure after a vault commit, invalidate the relevant cached index state or emit a new event such as `index://dirty`.
2. Add a focused reconciliation entry point for one note if practical. Otherwise, schedule the existing full `reconcile_index` off the command thread.
3. Ensure the returned error says the note file was saved but the search/index refresh failed. The UI must not tell the user that content was lost.
4. Confirm a restart repairs note content, metadata, and missing link rows through reconciliation/backfill.

### Phase 5: Documentation and cleanup

1. Update `docs/desktop-local-first.md` to describe atomic canonical writes and transactional derived updates.
2. Correct any stale `vault.rs` header statement discovered during implementation.
3. Remove newly unused storage methods only after `rg` proves they have no callers.

## Required tests

### Atomic file tests

- New file is written exactly.
- Existing file is replaced exactly.
- No temporary files remain after success.
- Serialization/write failure leaves the old file unchanged.
- Rename failure leaves the old file and removes the temporary file.
- Unicode and long-but-valid filenames work.

Use an injectable internal operation or test-only failure hook rather than relying on filesystem permissions, which behave differently under root and CI.

### Rename/move tests

- Successful rename installs new content and removes old path.
- Failed new-target write leaves old path untouched.
- Failed old-path cleanup leaves two complete copies and reports an error.
- Moving between folders follows the same rules.

### SQLite transaction tests

- Successful save updates note, links, titles, and version together.
- Injected failure after note upsert rolls back note, links, titles, and version.
- Version coalescing behavior remains identical to current tests.
- A vault-success/SQLite-failure scenario is repaired by reconciliation.

### Regression tests

- Existing 77 Rust tests continue to pass.
- Create, autosave, rename, move, restore version, and sync import continue to work.

## Acceptance criteria

- [x] No canonical vault or metadata update uses truncating in-place writes.
- [x] A note rename never deletes the previous file before the new file is durable.
- [x] Normal note saves use one SQLite transaction for note, links/titles, and version history.
- [x] Every injected failure leaves at least one complete canonical Markdown file.
- [x] Derived-index failure is distinguishable from canonical-save failure.
- [x] Restart/reconciliation repairs an intentionally stale derived index.
- [x] `cargo test` passes (103 tests).
- [x] Strict Clippy passes after DH-05 baseline fixes.
- [x] `docs/desktop-local-first.md` reflects the implemented durability model.

## Verification commands

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml vault
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml storage
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml versioning
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
git diff --check
```

Also manually test a packaged debug build:

1. Create a note and confirm its `.md` file.
2. Edit, rename, and move it.
3. Kill the app repeatedly during rapid autosave.
4. Relaunch and confirm the file parses, the latest complete edit is present, search works, and no temporary files remain.

## Rollback

The implementation must be revertible without a data migration. Atomic writing changes how files are replaced, not their format. If the transactional index method causes regressions, callers may temporarily return to the old derived calls while retaining atomic vault writes. Never roll back by rewriting user vault contents.

## Out of scope

- Live external file watching; DH-08 owns it.
- Staged backup restore; DH-02 owns it.
- Changing Markdown/frontmatter format.
- Persisting `richContent` sidecars.
- Cloud sync conflict-policy changes.

## Agent handoff template

Report:

- Atomic replacement strategy per OS.
- Every direct vault `fs::write` removed or intentionally retained, with reason.
- SQLite statements included in the new transaction.
- Failure cases tested.
- Verification command output.
- Any duplicate-file recovery behavior left for DH-08.
