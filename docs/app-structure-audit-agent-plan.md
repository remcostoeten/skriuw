# App Structure Audit Agent Plan

Purpose: audit the actual web app structure and decide how to keep future code tight. Ignore mobile for this pass.

## Target Structure Hypothesis

Use this as the starting model. Agents should validate it against the code, not against architecture docs.

```txt
src/app       routes, pages, layouts, route handlers
src/features  UI, hooks, stores, feature workflows, feature-private server code
src/domain    reusable product entities, database APIs, mappers, product types
src/core      infrastructure only: Supabase clients, shortcuts, primitive runtime helpers
src/platform  auth/session/runtime integration
src/shared    generic UI, icons, and reusable helpers
src/providers app-level providers
src/types     legacy/global product types; candidate for gradual removal
```

## Agent 1: Boundary Mapper

Scope:

```txt
src/domain
src/core
src/platform
src/shared
src/types
src/providers
```

Questions:

- What does each folder actually own today?
- Which imports point upward or sideways in a confusing way?
- Does `src/core` behave like infrastructure, or does it know too much about product entities?
- Is `src/types` still useful, or is it just a global dumping ground?

Output:

```txt
Findings:
- file:line references for each boundary issue
- current dependency direction
- recommended ownership for ambiguous files

Recommendation:
- folders to keep as-is
- folders to gradually change
- folders to stop adding to
```

## Agent 2: Feature Structure Auditor

Scope:

```txt
src/features/ai
src/features/editor
src/features/journal
src/features/layout
src/features/notes
src/features/project-planning
src/features/settings
```

Questions:

- Which features are internally consistent?
- Which features reach too deeply into other features?
- Which features contain database/server logic directly?
- Are feature-private server folders used consistently?
- Should AI stay under `src/features/ai`, or become `src/domain/ai` because it owns persistent data?

Output:

```txt
Feature report:
- tight features
- loose features
- cross-feature imports worth keeping
- cross-feature imports worth removing
- server/data code that should move or stay
```

## Agent 3: Migration Auditor

Scope:

```txt
supabase/migrations
scripts
```

Questions:

- Which migrations are pure schema?
- Which migrations are true data migrations?
- Which migrations are seed/demo/content migrations?
- Are migration names specific enough?
- Are there migrations that should have been seed scripts instead?

Classification:

```txt
schema migration:
  tables, indexes, constraints, RLS, functions, triggers, enums

data migration:
  required transformation of production data

seed/content migration:
  demo rows, planning content, placeholder rows, sample app data
```

Output:

```txt
Migration report:
- filename
- classification
- risk
- recommended future convention
```

Desired convention:

```txt
supabase/migrations/*        schema and true production data migrations only
supabase/seed.sql            local/dev seed data
scripts/*.sql                explicit one-off admin scripts
```

## Agent 4: Test Layout Consistency Auditor

Scope:

```txt
__tests__
tests
tested source imports
package.json test scripts
```

Questions:

- Do test paths mirror current code ownership?
- Which tests still refer to old folder concepts?
- Are there boundary rules that should have tests or lint checks?
- Does the current test script hide structure drift?

Output:

```txt
Test report:
- tests matching current ownership
- tests with stale folder naming
- proposed test folder layout
- low-cost guardrails
```

## Integration Rules

After the agents report, resolve structure using these rules:

1. Prefer the actual import graph over old documentation.
2. Keep `src/app` thin.
3. Keep shared product data access in `src/domain`.
4. Keep feature-private backend logic in `src/features/<feature>/server`.
5. Keep `src/core` infrastructure-only.
6. Stop adding new global product types to `src/types`.
7. Move product types into `src/domain/<entity>/types.ts` gradually.
8. Keep migrations agnostic unless the migration is a true production data transformation.

## Final Deliverable

Produce one cleanup roadmap with:

```txt
1. Current actual structure
2. Confirmed boundary issues
3. Files or folders to leave alone
4. Files or folders to gradually move
5. New rules for future code
6. Migration convention
7. Test layout convention
8. Suggested guardrails
```

## Suggested Guardrails

Potential low-cost checks after the audit:

```txt
- no imports from src/features into src/domain
- no product-specific imports from src/core
- no new files in src/types without explicit reason
- no seed/demo rows in schema migrations
- route files under src/app should compose, not own business logic
```
