# DH-02: Staged, non-destructive restore

Status: **implemented**  
Priority: **P0 — data safety**  
Primary owner: Rust backup and restore  
Estimated size: 3–5 focused implementation days

## Outcome

Restoring a vault backup or complete desktop snapshot validates and extracts all replacement data before touching live user data. A corrupt, incompatible, interrupted, or disk-full restore leaves the current workspace usable. A successful restore switches to the replacement and retains a recoverable previous copy until the app has rebound and verified the new state.

## Why this is required

`import_vault` calls `clear_dir_contents` before `unzip_into`. `restore_snapshot` reads only the manifest, clears app data, local AI data, and the vault, and then extracts entries directly into those live roots. A malformed entry or I/O failure after clearing can destroy the current workspace.

The UI currently describes restore as replacing data but cannot compensate for an implementation that destroys the old state before proving the new state is valid.

## Read first

- `docs/desktop-local-first.md`
- `docs/docs_for_docs.skriuw.app/reference/backup-and-import.mdx`
- `apps/desktop/src-tauri/src/backup.rs`
- `apps/desktop/src-tauri/src/lib.rs`, especially `import_vault` and `import_snapshot`
- `apps/desktop/src-tauri/src/vault.rs`, especially `reload_root`
- `apps/desktop/src-tauri/src/storage.rs`, especially `reload`
- `apps/web/src/features/settings/sections/local-data-section.tsx`

## Dependencies

Prefer landing after DH-01 so this plan can reuse a reviewed atomic filesystem helper. It may proceed independently if it implements restore-specific staging without duplicating canonical note-write logic. Coordinate before creating a second generic atomic-file module.

## Locked design decisions

1. Never clear a live root before the replacement has been fully extracted and validated.
2. Stage on the same filesystem as the live root whenever a final directory rename is required.
3. A vault-only restore must not import arbitrary files outside the selected archive's enclosed paths.
4. A complete snapshot restores into the current application's managed app-data and local-data roots. Treat the manifest's old `appDataDir` and `appLocalDataDir` as informational only.
5. The manifest's `vaultRoot` may point to a user-selected external location. The UI must show that target and require confirmation before replacement.
6. Snapshot version must be explicitly validated. Reject versions newer than the implementation supports.
7. Validation is structural and semantic: archive readability, path confinement, required manifest, supported version, no duplicate conflicting targets, adequate disk-space estimate when available, and a parseable staged vault.
8. Restores need a recoverable previous-state directory. Delete it only after the new `Storage` and `VaultStore` handles reload and a post-restore smoke read succeeds.
9. Canceling the file picker remains a no-op and must not show success.
10. No restore path may include plaintext secret migration logic; DH-03 owns secret handling.

## Proposed restore interfaces

Create explicit plan/stage/commit types in `backup.rs` rather than one function that both deletes and extracts:

```rust
pub struct RestorePlan {
    pub kind: RestoreKind,
    pub manifest: Option<SnapshotManifest>,
    pub entry_count: u64,
    pub uncompressed_bytes: u64,
    pub target_vault_root: PathBuf,
}

pub struct StagedRestore {
    // private staging paths and validated plan
}

pub fn inspect_restore(zip_path: &Path, current_vault: &Path) -> io::Result<RestorePlan>;
pub fn stage_restore(/* archive, plan, staging roots, progress */) -> io::Result<StagedRestore>;
pub fn commit_restore(/* staged restore, managed live roots */) -> io::Result<RestoreReceipt>;
```

Names may change. The required separation is inspect → stage → commit → verify → cleanup.

`RestoreReceipt` must retain enough path information to roll back if rebinding or verification fails.

## Implementation phases

### Phase 1: Archive inspection

1. Iterate the central directory without extracting.
2. Reject unreadable ZIPs and encrypted entries unless encryption is deliberately supported later.
3. Use `enclosed_name` for every entry and reject, rather than silently skip, unsafe paths. A backup that contains unsafe paths should fail visibly.
4. Reject duplicate file paths in the archive.
5. Count entries and sum declared uncompressed sizes with checked arithmetic.
6. Apply conservative limits to defend against ZIP bombs. Document chosen limits and allow legitimate large Ollama model snapshots if complete snapshots are expected to contain them.
7. For full snapshots, parse exactly one `manifest.json` and validate `version == 1` until migrations exist.
8. For vault backups, require at least one recognizable vault artifact or allow an explicitly empty valid vault. Define this precisely in tests.

### Phase 2: Staging extraction

1. Create staging directories adjacent to their corresponding live root or in an application-controlled staging parent on the same filesystem.
2. Give staging directories unique names and create them with restrictive permissions where supported.
3. Extract only into staging directories.
4. Flush extracted files that will become canonical user data.
5. Open the staged vault through `VaultStore::open` or a read-only validation helper.
6. Parse all Markdown/frontmatter and metadata files sufficiently to ensure reconciliation will not immediately fail.
7. For a full snapshot, open the staged SQLite index if present. If invalid, discard it and plan a rebuild from the staged vault instead of failing a valid content restore.
8. On failure, delete only staging directories. Leave live roots untouched.

### Phase 3: Commit with rollback directories

For each live root:

1. Rename the live directory to a uniquely named sibling rollback directory.
2. Rename the staged directory into the live path.
3. If the second rename fails, rename the rollback directory back immediately.
4. For roots on filesystems where directory replacement cannot be atomic, use a documented lock/maintenance mode and an ordered copy that still retains rollback data.
5. Never recursively clear a root as the first commit step.

For complete snapshots with three roots, treat the sequence as a recoverable transaction:

- Record each completed swap in `RestoreReceipt`.
- If any later swap fails, roll back completed swaps in reverse order.
- Surface both primary and rollback errors.

### Phase 4: Rebind and verify

1. Stop managed Ollama before app-local-data replacement.
2. Reload `Storage`; if the restored index is missing or invalid, create/rebuild it.
3. Reload `VaultStore` to the committed vault target.
4. Run `reconcile_index` synchronously for the restore completion path.
5. Read folders, note metadata, and one note body if a note exists.
6. Re-read non-secret settings through the DH-04 settings module when available.
7. Restart managed Ollama only after verification.
8. Emit a completion event only after all verification succeeds.
9. Delete rollback directories only after successful verification, or retain them with a bounded cleanup policy such as “previous restore” until the next clean launch. Pick one policy and document it in the UI.

### Phase 5: UI confirmation and progress

Update `local-data-section.tsx`:

1. After inspection, show restore type, archive size, entry count, target vault path, and whether the operation replaces AI data/settings.
2. Require a second explicit confirmation for full snapshot restore.
3. Display phases: inspecting, staging, validating, swapping, rebuilding index, verifying, complete.
4. Keep controls disabled during commit and rebind.
5. On a pre-commit failure, say: “Restore failed; your current workspace was not changed.”
6. On a rolled-back commit failure, say: “Restore failed and the previous workspace was restored.”
7. On rollback failure, show exact recovery paths and a “Reveal recovery folder” action. Do not reload automatically.
8. Reload the webview only after Rust reports verified success.

### Phase 6: Cleanup policy

1. On startup, detect abandoned staging directories and delete only those carrying a Skriuw staging marker.
2. Detect rollback directories and either offer recovery or clean them only after verifying the live workspace.
3. Never delete a directory merely because its name resembles a staging name; require a marker owned by this implementation.

## Required tests

### Inspection tests

- Valid vault archive is accepted.
- Valid snapshot version 1 is accepted.
- Missing, duplicate, malformed, and future-version manifests are rejected.
- Absolute paths, `..`, symlink-like entries, and duplicate target paths are rejected.
- Declared-size overflow and configured archive limits are rejected.

### Staging tests

- Corrupt entry midway through extraction leaves live roots byte-for-byte unchanged.
- Disk/write failure leaves live roots unchanged and removes staging.
- Invalid staged Markdown metadata fails before commit.
- Invalid staged SQLite falls back to rebuild when vault data is valid.

### Commit and rollback tests

- Successful vault swap produces the restored workspace.
- Failure before first swap leaves all roots unchanged.
- Failure after first and second snapshot-root swaps rolls all roots back.
- Rebind failure rolls roots back and restores old handles or returns explicit recovery instructions.
- Old workspace is retained until verification completes.

### UI tests

- Cancel is a no-op.
- Confirmation describes the exact destructive scope.
- Pre-commit and rollback-success error messages differ.
- Reload occurs only after verified success.

## Acceptance criteria

- [x] No restore implementation calls `clear_dir_contents` or `clear_root` on live data before staging succeeds. (`clear_root` deleted; `import_vault`/`import_snapshot` never clear live roots.)
- [x] Unsafe archive entries cause rejection, not silent skipping. (`inspect_restore` rejects path escapes, duplicates, encrypted entries.)
- [x] A corrupt archive leaves the live workspace unchanged.
- [x] Partial multi-root commits roll back in reverse order.
- [x] The restored workspace is reconciled and smoke-read before success. (`verify_restored_workspace`.)
- [x] UI progress reports the current restore phase.
- [x] Error messages state whether the original workspace is untouched, restored, or needs manual recovery. (`recovery_error`.)
- [x] Recovery/staging directories have a safe startup cleanup policy. (`cleanup_restore_artifacts`, marker-gated, post-reconcile.)
- [x] Rust and relevant UI tests pass. (110 Rust tests; SPA build green.)

## Verification commands

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml backup
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
bun test apps/web/__tests__/features/settings
bun run --cwd packages/web-spa build
git diff --check
```

Manual verification must use disposable test vaults, never a real personal vault:

1. Restore a valid vault backup.
2. Restore a valid complete snapshot.
3. Try a truncated ZIP.
4. Try a ZIP with a valid first file and corrupt later file.
5. Kill the app during staging, then during commit if a deterministic test hook exists.
6. Relaunch and verify either the old or new complete workspace plus clear recovery messaging.

## Rollback

This change does not alter backup formats, so code can be reverted. Do not delete rollback directories during code rollback. If staged restore must be disabled, hide/disable restore controls while keeping export available; never fall back to the current clear-before-extract behavior.

## Out of scope

- Changing export archive layout.
- Adding archive encryption.
- Secret migration; DH-03 owns it.
- Automatic scheduled backups.
- Cloud import conflict policy.

## Agent handoff template

Report:

- Restore state machine and paths used for staging/rollback.
- Archive limits and why they allow legitimate snapshots.
- Platform-specific directory swap behavior.
- Every injected failure point tested.
- Recovery behavior when rollback itself fails.
- Verification command output.
