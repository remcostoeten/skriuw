# DH-03: OS-backed AI secret storage

Status: **planned**  
Priority: **P0 — privacy and trust**  
Primary owner: Rust desktop AI/settings  
Estimated size: 2–4 focused implementation days plus platform verification

## Outcome

Groq and Gemini provider keys are no longer stored in `settings.json`, browser storage, logs, error strings, or complete snapshots. Desktop stores them through an operating-system credential adapter and migrates existing plaintext values without losing a valid key. The settings UI can distinguish configured, missing, unavailable, and migration-failed states without ever reading the secret value back into TypeScript.

## Why this is required

`ai_set_key` currently writes `groqApiKey` and `geminiApiKey` directly into the same `settings.json` used for vault configuration. `export_snapshot` includes app data, so the plaintext keys are also copied into snapshots. This contradicts the repository promise that user keys are encrypted at rest.

## Read first

- `docs/desktop-local-first.md`, especially **AI** and **Open gaps**
- `apps/desktop/src-tauri/src/ai/mod.rs`
- `apps/desktop/src-tauri/src/ai/cloud.rs`
- `apps/desktop/src-tauri/src/backup.rs`
- `apps/web/src/features/desktop/ai-settings-section.tsx`
- `apps/web/src/core/workspace-backend/tauri-backend.ts`
- DH-04 plan and its implemented settings module

## Dependency

DH-04 must land first. This plan assumes one typed settings module owns `settings.json`; do not add another read/modify/write implementation inside `ai/mod.rs`.

## Locked design decisions

1. TypeScript receives only secret status, never the secret after submission.
2. Credential identity is stable across application upgrades:
    - Service: `nl.remcostoeten.skriuw` or another single documented production identifier.
    - Accounts: `ai:groq` and `ai:gemini`.
3. Do not use the current `.dev` Tauri identifier as the permanent credential service name. Development credentials need a separate suffix to avoid touching production secrets.
4. Use a Rust credential adapter that maps to macOS Keychain, Windows Credential Manager, and Linux Secret Service. Keep the adapter behind a small internal trait so tests use an in-memory adapter.
5. There is no plaintext fallback. If secure storage is unavailable, cloud AI remains disabled and local Ollama remains usable.
6. Existing plaintext keys are migrated one at a time. Delete a plaintext value only after storing it securely and reading it back successfully.
7. Migration must be idempotent. Re-running after a crash may repeat safe steps without losing the key.
8. Complete snapshots intentionally exclude provider secrets. Restoring a snapshot does not overwrite credentials already stored on the machine.
9. Clearing all desktop data must explicitly ask whether to remove OS-stored credentials, because they live outside app-data directories.
10. Never include secret values in `Debug`, `Serialize`, logs, panic messages, analytics, clipboard actions, or test snapshots.

## Target module shape

Create `apps/desktop/src-tauri/src/credentials.rs` or `ai/credentials.rs`:

```rust
pub enum CredentialProvider {
    Groq,
    Gemini,
}

pub enum CredentialState {
    Missing,
    Present,
    Unavailable { reason: String },
    MigrationFailed { reason: String },
}

pub trait CredentialStore: Send + Sync {
    fn set(&self, provider: CredentialProvider, secret: &str) -> Result<(), CredentialError>;
    fn get(&self, provider: CredentialProvider) -> Result<Option<SecretString>, CredentialError>;
    fn delete(&self, provider: CredentialProvider) -> Result<(), CredentialError>;
}
```

The exact types may change. Required properties:

- Secret types must redact `Debug` output.
- Production uses one OS adapter.
- Tests inject an in-memory adapter and deterministic failures.
- `AiConfig` reports a state or boolean derived from the adapter, not JSON fields.

## Implementation phases

### Phase 1: Credential adapter

1. Evaluate a maintained Rust credential library supporting all three desktop targets. Record the selected library and platform mappings in a code comment and `Cargo.toml`.
2. Disable dependency features not needed by Skriuw.
3. Wrap all library-specific types inside the internal adapter; do not expose them through Tauri commands.
4. Normalize errors into categories: unavailable backend, access denied, locked keychain, not found, invalid secret, and unexpected.
5. Add a redacted secret wrapper or use a well-reviewed secrecy type.
6. Manage the production adapter as Tauri state so commands do not construct credential handles inconsistently.

### Phase 2: Replace AI configuration reads

1. Remove `groqApiKey` and `geminiApiKey` from normal settings reads and writes.
2. Change `load_config` to query credential presence and return status without values.
3. Change `ai_complete`, streaming completion, and ping to request the secret from the adapter immediately before the provider call.
4. Keep the secret in the smallest possible scope and drop it after request construction.
5. If storage is unavailable, return an actionable error that directs the user to local Ollama or OS credential troubleshooting.
6. Do not silently treat “keychain unavailable” as “no key”; the UI must be able to explain the difference.

### Phase 3: Change Tauri commands

1. Keep the current command name `ai_set_key` for frontend compatibility unless changing it materially improves safety.
2. Validate provider before touching storage.
3. An empty submitted value deletes the credential.
4. A non-empty value is trimmed, checked against a conservative maximum length, stored, and verified by a read-back comparison.
5. Return only the updated non-secret configuration/status.
6. Add `ai_delete_credentials` or provider-specific deletion only if reset needs a separate explicit path.

### Phase 4: Idempotent plaintext migration

Run migration after DH-04 loads settings and before cloud AI is considered ready:

1. Inspect legacy `settings.ai.groqApiKey` and `settings.ai.geminiApiKey` without logging them.
2. If no legacy value exists, do nothing.
3. If a secure credential already exists, remove the legacy JSON value atomically; the secure credential wins.
4. Otherwise store the legacy value in the OS adapter.
5. Read it back and compare using a constant-time comparison where practical.
6. Remove only the successfully migrated legacy field via the settings module.
7. Persist a non-secret migration version/status only if needed for diagnostics.
8. If secure storage fails, leave the legacy value intact for recoverability, disable that cloud provider, and show a one-time migration warning. Do not continue using the plaintext key.
9. On the next launch, retry migration.

### Phase 5: Snapshot and reset behavior

1. Add a regression test proving snapshots contain neither legacy field name nor a submitted test key.
2. Document that complete snapshots exclude OS credentials.
3. On reset, add a separate confirmation checkbox such as “Also remove AI provider keys from this computer.” Default it to checked only if product explicitly chooses that behavior; otherwise default unchecked and explain persistence.
4. Call credential deletion before or after directory reset in a way that reports partial failure accurately.
5. Do not remove credentials merely because a snapshot is restored.

### Phase 6: UI states and copy

Update `ai-settings-section.tsx`:

- **Present:** show “Stored securely by your operating system.”
- **Missing:** show the entry control.
- **Unavailable:** disable cloud selection and explain how to unlock/enable the platform credential store.
- **Migration failed:** explain that the old key was not used and remains pending secure migration; provide retry and remove actions.
- Never repopulate the input after save.
- Keep the “text leaves this device” consent visible for cloud providers.

### Phase 7: Public documentation

1. Update `README.md` only after all supported production platforms pass manual verification.
2. Update `docs/desktop-local-first.md` to close the AI-key portion of the OS keychain gap.
3. Update backup documentation to state that OS credentials are excluded.
4. If Linux Secret Service has environment requirements, document them without claiming unsupported headless use.

## Required tests

### Adapter contract tests

Run the same behavior suite against the in-memory adapter:

- Missing → set → present → get → delete → missing.
- Provider keys never collide.
- Development and production service names never collide.
- Access-denied and unavailable errors are categorized.
- Debug output never contains the secret.

### Migration tests

- Plaintext-only key migrates, verifies, then disappears from JSON.
- Existing secure key wins and plaintext is removed.
- Store failure retains plaintext but cloud use is disabled.
- Read-back failure retains plaintext and reports migration failure.
- Crash/retry at each step is idempotent.
- One provider may migrate successfully while the other retries.

### Command and AI tests

- `ai_set_key` returns status without secret.
- Empty key deletes.
- Unknown provider changes nothing.
- Cloud completion receives the secure value through the Rust provider path.
- Logs and returned errors do not contain the value.

### Snapshot tests

- Exported snapshot bytes do not contain a test secret.
- Restore leaves machine credentials unchanged.

## Platform verification matrix

Manual verification is mandatory on production-like installations:

| Platform | Verify                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------- |
| macOS    | Key appears in Keychain under production service; app can use/delete it; locked keychain error is clear. |
| Windows  | Key appears in Credential Manager; standard-user install can use/delete it; denial is clear.             |
| Linux    | Secret Service-backed desktop works; unavailable/locked collection disables cloud AI without crash.      |

Do not print the secret while verifying. Inspect only credential labels and app behavior.

## Acceptance criteria

- [ ] New provider keys never enter `settings.json`.
- [ ] Existing plaintext keys migrate idempotently and are deleted only after verified secure storage.
- [ ] TypeScript never receives stored provider-key values.
- [ ] Snapshots contain no AI provider secrets.
- [ ] Unavailable credential storage disables cloud AI without affecting Ollama.
- [ ] Reset behavior explicitly addresses external OS credentials.
- [ ] Secret values are absent from logs, errors, analytics, serialization, and `Debug` output.
- [ ] macOS, Windows, and Linux verification matrix passes.
- [ ] Public encryption-at-rest copy matches the verified implementation.

## Verification commands

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml credentials
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml ai
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml backup
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
bun run --cwd packages/web-spa build
git diff --check
```

Before committing, search for accidental persistence/logging:

```bash
rg -n 'groqApiKey|geminiApiKey|api[_-]?key|println!|eprintln!|dbg!' apps/desktop/src-tauri/src apps/web/src/features/desktop
```

Review every match; do not mechanically delete legitimate non-secret labels.

## Rollback

Do not roll back by copying secure credentials back into JSON. If the OS adapter has a release-blocking problem, disable cloud providers and retain credentials in the OS store while Ollama remains available. Keep migration code for at least one stable release after the final plaintext-writing version.

## Out of scope

- Desktop sync bearer credential migration; track separately even though the same adapter may later support it.
- Server-side provider-key encryption.
- Snapshot archive encryption.
- Changing AI providers or models.

## Agent handoff template

Report:

- Credential library and feature selection.
- Service/account names for development and production.
- Migration state machine and failure behavior.
- Proof that snapshot bytes exclude a sentinel secret.
- Platform verification results.
- Any plaintext legacy state intentionally retained after failed migration.
