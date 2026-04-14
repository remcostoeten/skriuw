# Architecture Notes

This repo now runs as a Supabase-backed app with a guest-workspace fallback and a feature-based structure:

1. `src/app/` owns routing and page composition.
2. `src/features/` owns domain code such as notes, journal, settings, and layout.
3. `src/platform/` owns auth and runtime/platform integrations.
4. `src/shared/` owns reusable UI and generic utilities.
5. `src/core/` owns persistence adapters and repository code.
6. `src/providers/` contains app-level providers.

Runtime rules now:

- Guests can open the app immediately without an auth gate.
- Guest mode mounts the same shell against local persistence and seeds a small demo workspace on first run.
- Authenticated users read and write notes, folders, journal entries, and tags in their own cloud workspace.
- Preferences are still local browser state.
- Guest/local persistence uses IndexedDB.
- Authenticated data is stored in the user-scoped cloud database.

## Rules Of Thumb

- Keep route files in `src/app/` thin.
- Prefer colocating feature UI, state, and helpers under the owning feature.
- Put auth and runtime adapters in `src/platform/`.
- Keep reusable primitives in `src/shared/`.
- Keep persistence adapters out of feature components.
- Avoid introducing new top-level folders unless they clearly fit the structure above.
- Do not let lower-level persistence code depend upward on feature modules.
- Keep Supabase row mapping and user scoping inside persistence adapters, not feature stores.

## Cleanup Focus

- Decide whether guest-workspace data should remain seeded-only or gain an explicit reset/import flow.
- Move synced preferences into the repository layer if cross-device settings are required.
- Keep documentation aligned with the actual runtime, not outdated cloud-only assumptions.
- Keep web persistence simple; do not reintroduce a second local database engine unless there is a concrete product need.
