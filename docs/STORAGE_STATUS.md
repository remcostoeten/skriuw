# Storage integration status

## What is wired today
- **App gating via onboarding:** The root providers render the storage onboarding flow until a `StorageConfig` is picked and successfully initialized, and allow re-picking on failure. This ensures all screens load only after storage is ready.
- **CRUD/queries use the generic adapter:** Shared CRUD utilities and storage-status queries resolve the active adapter through `getGenericStorage`, so the same paths are used regardless of the selected backend.
- **Schema resets are allowed:** Local storage is wiped when the app detects an unexpected schema version, because we are not keeping backward compatibility. This guarantees a clean slate when rolling forward to new storage shapes.

## Current limitation
- **Adapters still point to local storage:** The registered `drizzleLibsql` and `drizzleLocalSqlite` adapters are placeholders that reuse the namespaced local-storage adapter. No Drizzle/libsql client is hooked up yet, so cloud sync/local SQLite behavior is not implemented beyond the selection UI.
- **No auto-fallback to legacy storage:** Calls into the storage layer now throw if an adapter is not initialized, so code must complete onboarding/initialization before performing CRUD. This prevents silent reuse of legacy localStorage data.

## Implication
Until a real libsql/SQLite adapter is implemented, all queries and mutations continue to operate against browser localStorage, even if the user chooses cloud/local SQLite during onboarding. Any previous localStorage content is discarded once a schema bump is detected, reflecting the "no backward compatibility" stance.
