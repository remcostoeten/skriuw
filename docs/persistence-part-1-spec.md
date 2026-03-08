# Persistence Part 1 Spec

## Goal

Define the persistence contract for the app before implementing storage.

This part does **not** implement IndexedDB, hydration, migrations, or store wiring.
It only defines:

- persisted entities
- shared persistence metadata
- store names
- schema version
- serialization rules
- what is intentionally not persisted

## Scope

Part 1 covers one source of truth for persisted shapes in:

- `src/core/shared/persistence-types.ts`

Optional support files may be added if needed, but the contract should stay centralized.

## Non-Goals

Part 1 must **not** include:

- IndexedDB open/init logic
- object store implementation
- read/write helpers
- Zustand persistence
- component `useEffect` persistence
- import/export
- migrations implementation
- save-status UX

## Requirements

### 1. Persisted Domain Entities

Define explicit persisted types for:

- `PersistedNote`
- `PersistedFolder`
- `PersistedJournalEntry`
- `PersistedTag`
- `PersistedPreferences`

These are storage-facing records, not UI-facing view models.

### 2. Shared Persistence Metadata

Every persisted record must be compatible with a shared metadata shape.

Minimum metadata:

- `id: string`
- `createdAt: string`
- `updatedAt: string`

Dates must be stored as ISO strings, not `Date` objects.

If an entity needs extra metadata later, that can be added in later parts.

### 3. Store Names

Define explicit store/object-store names as string literals or a frozen constant.

Required stores:

- `notes`
- `folders`
- `journalEntries`
- `tags`
- `preferences`

The contract should export a typed union for valid store names.

### 4. Schema Version

Define an exported schema version constant.

Initial value:

- `1`

This version exists now so later migration work has a stable anchor.

### 5. Serialization Rules

The contract must make these rules explicit:

- no `Date` instances in persisted records
- no functions
- no `Map` or `Set`
- no transient UI flags
- records must be JSON-serializable

### 6. Explicitly Non-Persisted State

Document and exclude ephemeral UI state such as:

- open modals
- hover/focus state
- drag/drop state
- current search query
- sidebar temporary visibility
- command palette state
- in-progress editor selection/cursor state

If a value is not required after reload, it should not be in this contract.

## Proposed Entity Shapes

These are the baseline shapes for part 1.

### Persisted Record Base

```ts
type PersistedRecordBase = {
  id: string;
  createdAt: string;
  updatedAt: string;
};
```

### Persisted Note

```ts
type PersistedNote = PersistedRecordBase & {
  name: string;
  content: string;
  parentId: string | null;
  isFavorite?: boolean;
};
```

Notes:

- `content` is the durable source of truth.
- `parentId` must be nullable for root notes.
- do not persist derived lookup/index fields.

### Persisted Folder

```ts
type PersistedFolder = PersistedRecordBase & {
  name: string;
  parentId: string | null;
  isOpen?: boolean;
};
```

Notes:

- `isOpen` is optional and should only remain if the team decides it is intentionally durable.
- if folder-open state is considered ephemeral, remove it before implementation starts.

### Persisted Journal Entry

```ts
type PersistedJournalEntry = PersistedRecordBase & {
  dateKey: string;
  title?: string;
  content: string;
  mood?: string | null;
  tags: string[];
};
```

Notes:

- `dateKey` must remain stable and sortable.
- `tags` should store names or IDs consistently. Part 1 must choose one and document it.

### Persisted Tag

```ts
type PersistedTag = PersistedRecordBase & {
  name: string;
  color: string;
};
```

### Persisted Preferences

```ts
type PersistedPreferences = {
  id: "preferences";
  createdAt: string;
  updatedAt: string;
  editorDefaultModeMarkdown: boolean;
  templateStyle: string;
  diaryModeEnabled: boolean;
};
```

Notes:

- preferences should include only durable user choices
- analytics/debug activity logs are not part of persisted preferences

## Output Contract

Part 1 is complete when the repo contains:

- `src/core/shared/persistence-types.ts`

And that file exports:

- `PERSISTENCE_SCHEMA_VERSION`
- `PERSISTED_STORE_NAMES`
- `PersistedStoreName`
- `PersistedRecordBase`
- `PersistedNote`
- `PersistedFolder`
- `PersistedJournalEntry`
- `PersistedTag`
- `PersistedPreferences`

## Open Decisions

These must be resolved while writing the contract, not deferred into implementation:

1. Should folder open state be durable or ephemeral?
2. Should journal tags store tag names or tag IDs?
3. Should note favorite state live on the note record or in a separate user-configuration layer?

Default decisions for Part 1 if no one objects:

- folder open state: `ephemeral`, do not persist
- journal tags: store `tag names` for now
- favorites: keep out of note persistence unless already part of the current domain model

## Acceptance Criteria

Part 1 is accepted if:

- all persisted entity shapes are explicitly typed
- store names are centralized and typed
- schema version is exported
- serialization rules are documented in code comments or adjacent doc comments
- ephemeral UI state is clearly excluded
- the contract is small, explicit, and storage-agnostic

## Agent Notes

This is safe to assign as a standalone task.

The implementing agent should:

- create the contract file only
- avoid touching feature components
- avoid adding storage logic
- avoid adding hooks or effects
- keep naming domain-specific and explicit
