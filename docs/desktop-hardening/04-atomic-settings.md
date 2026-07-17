# DH-04: One atomic settings module

Status: **implemented**
Priority: **P0 — correctness foundation**  
Primary owner: Rust desktop configuration  
Estimated size: 2–3 focused implementation days

## Outcome

One typed, concurrency-safe Rust module owns desktop `settings.json`. Vault-root, cover-root, AI model/provider, and future non-secret settings updates cannot clobber each other, corrupt the file during a crash, or silently replace malformed configuration with defaults. Callers patch typed fields through one interface.

## Why this is required

`lib.rs` and `ai/mod.rs` independently locate, read, parse, mutate, serialize, and overwrite the same file. Each operation is a read-modify-write without a shared lock. Concurrent commands can lose unrelated changes. Parse errors currently become `{}`, hiding corruption and allowing the next write to erase recoverable configuration.

DH-03 requires a trustworthy settings module for safe removal of legacy plaintext secrets.

## Read first

- `apps/desktop/src-tauri/src/lib.rs`, functions around `SETTINGS_FILE`
- `apps/desktop/src-tauri/src/ai/mod.rs`, functions around `SETTINGS_FILE`
- `apps/desktop/src-tauri/src/backup.rs`
- `apps/desktop/src-tauri/src/vault.rs`, root reload behavior
- `apps/web/src/features/settings/sections/local-data-section.tsx`
- `apps/web/src/features/desktop/ai-settings-section.tsx`
- DH-01 atomic-write plan to avoid duplicate primitives

## Locked design decisions

1. Exactly one module computes the settings path and performs file I/O.
2. The module is managed Tauri state and owns an in-process lock around the complete read/validate/patch/write sequence.
3. Writes use temp-file, flush, and atomic replacement semantics from DH-01 or a shared internal helper.
4. Malformed JSON is an error, not an empty object. Preserve the malformed file and surface recovery instructions.
5. Preserve unknown top-level and nested fields so forward/backward version transitions do not erase settings owned by another release.
6. Add a numeric `settingsVersion`; absence means legacy version 0.
7. Migrations are ordered, idempotent, and tested. They never remove a legacy field until replacement state is durable.
8. Secrets are not part of the typed long-term settings model. DH-03 may read legacy secret fields only through a migration-specific raw accessor.
9. Reads return snapshots; callers cannot mutate internal state without a patch method.
10. Changing vault root continues to take effect on next launch unless a separate product change deliberately adds live rebinding.

## Target file and types

Create `apps/desktop/src-tauri/src/settings.rs`.

Suggested shape:

```rust
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    #[serde(default)]
    pub settings_version: u32,
    #[serde(default)]
    pub vault_root: Option<PathBuf>,
    #[serde(default)]
    pub cover_assets_root: Option<PathBuf>,
    #[serde(default)]
    pub ai: AiSettings,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

pub struct SettingsStore {
    path: PathBuf,
    state: RwLock<DesktopSettings>,
}
```

If flattened preservation for nested AI fields is required, add an `extra` map there too.

Required interface capabilities:

- `load(path) -> Result<SettingsStore, SettingsError>`
- `snapshot() -> DesktopSettings`
- `update(|settings| ...) -> Result<DesktopSettings, SettingsError>`
- Focused convenience methods only when they hide real invariants, such as `set_vault_root`.
- A migration-only method for consuming a named legacy value after a caller proves replacement succeeded.

Do not expose a generic “write arbitrary JSON” Tauri command.

## Error model

Use a typed internal error with at least:

- Resolve path
- Read
- Parse, including line/column when available
- Unsupported future version
- Migration
- Serialize
- Temporary-file creation/write/flush
- Replace
- Lock poisoned

Convert to user-facing strings only at Tauri command seams. Do not leak raw file contents.

## Implementation phases

### Phase 1: Inventory and schema

1. Use `rg` to enumerate every `settings.json`, `vaultRoot`, `coverAssetsRoot`, and desktop `ai` read/write.
2. Document current fields in a test fixture.
3. Define typed settings with defaults matching current behavior.
4. Preserve unknown fields at every object level another release may own.
5. Define `CURRENT_SETTINGS_VERSION = 1` and version-0 migration, even if migration only adds the version field.

### Phase 2: Load and corruption handling

1. Resolve app-data path once during Tauri setup.
2. Missing file produces default settings in memory; do not write until the first mutation unless the product wants an explicit initialization write.
3. Empty or malformed file returns a parse error.
4. Before reporting corruption, optionally copy the exact malformed bytes to a timestamped `settings.corrupt-*.json` sibling using create-new semantics. Never overwrite a previous recovery copy.
5. The app should still be able to start with safe defaults if product chooses recovery mode, but must not overwrite the corrupt file without explicit user confirmation. Record the chosen behavior in `docs/desktop-local-first.md`.
6. Reject a settings version newer than supported and instruct the user to use a newer Skriuw build.

### Phase 3: Atomic update implementation

1. Hold the write lock across clone → patch → validate → serialize → atomic write → in-memory replacement.
2. Validate paths are non-empty and provider/model strings respect length limits before disk I/O.
3. Write the file first; only replace in-memory state after disk success.
4. If disk write fails, return the previous snapshot and leave in-memory state unchanged.
5. Avoid holding the lock across dialogs, network calls, credential-store access, or other long operations. Gather input first, then perform a small settings update.

### Phase 4: Migrate callers

In `lib.rs`:

- Remove `SETTINGS_FILE`, `settings_path`, duplicate JSON parsing, `write_vault_root`, and `write_cover_assets_root`.
- Make `get_vault_root`, `set_vault_root`, `choose_vault_root`, cover-root commands, export, reset, and startup use `SettingsStore`.
- Preserve default `~/.skriuw` resolution in one helper that combines settings snapshot with Tauri home-dir resolution.

In `ai/mod.rs`:

- Remove its `SETTINGS_FILE`, `settings_path`, `read_settings`, and `write_settings`.
- Read/update non-secret AI fields through `SettingsStore`.
- Leave legacy secret extraction only for DH-03 migration.

In backup/restore:

- After a snapshot restore, reload the settings module from the restored file before deriving the vault root.
- Ensure settings reload participates in DH-02 verification/rollback.

### Phase 5: Tauri state wiring

1. Construct `SettingsStore` before opening the vault and storage.
2. Derive the configured/default vault root from the loaded snapshot.
3. `app.manage(settings_store)` exactly once.
4. Pass `State<SettingsStore>` to commands rather than `AppHandle` when only settings are required.
5. Keep `AppHandle` only for dialogs/path resolution/events.

### Phase 6: Diagnostics and documentation

1. Add a non-secret diagnostics representation showing path, settings version, vault/cover roots, and AI provider/model names.
2. Never include legacy secret values.
3. Update `docs/desktop-local-first.md` with schema version and corruption behavior.
4. Add a short settings schema section to developer documentation if future fields are likely.

## Required tests

### Load/parse tests

- Missing file yields current defaults.
- Current valid file loads.
- Legacy version 0 migrates and preserves fields.
- Unknown fields survive load and subsequent update byte-semantically, ignoring formatting/order.
- Future version is rejected.
- Malformed JSON is preserved and not overwritten.

### Concurrency tests

- Two threads repeatedly update vault and AI model fields; final state contains both latest updates and valid JSON.
- A failed write does not alter the in-memory snapshot.
- Readers never observe partially updated state.

### Atomicity tests

- Injected temp write, flush, and replace failures retain the previous file.
- Successful update leaves no temp file.
- Recovery copy uses a unique name and exact original bytes.

### Caller regression tests

- Default vault remains `~/.skriuw` when unset.
- Empty vault path is rejected.
- Cover-root set/reset behaves as before.
- AI config patch changes only provided fields.
- Snapshot restore reloads settings before vault rebinding.

## Acceptance criteria

- [x] Only `settings.rs` performs normal `settings.json` I/O.
- [x] A shared lock covers complete updates.
- [x] Writes are atomic and failed writes retain old file and memory state.
- [x] Malformed JSON is never silently replaced with `{}`.
- [x] Unknown fields survive updates.
- [x] Settings version and migration tests exist.
- [x] Vault, cover, AI, reset, export, and restore callers use the module.
- [x] No secret field exists in the long-term typed schema.
- [x] Rust tests and strict Clippy pass.

## Verification commands

```bash
rg -n 'SETTINGS_FILE|settings_path|read_settings|write_settings|settings\.json' apps/desktop/src-tauri/src
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml settings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
git diff --check
```

The first search should show the centralized module, documentation/comments, and intentionally reviewed migration references only.

## Rollback

The JSON format remains compatible, so the code can be reverted if no migration removes fields. Keep `settingsVersion` and unknown fields harmless to older builds. Never roll back by deleting a settings file. If loading fails after rollout, preserve the file and start in explicit recovery mode rather than reverting to silent `{}` parsing.

## Out of scope

- OS credential storage; DH-03 owns it.
- Live vault-root switching.
- Moving UI preferences from browser storage into Rust settings.
- Cross-device settings sync.

## Agent handoff template

Report:

- Final typed schema and version.
- Unknown-field preservation strategy.
- Corrupt-file recovery behavior.
- All old settings I/O removed.
- Concurrency/failure tests added.
- Any caller that intentionally still uses `AppHandle` and why.
