# ADR-0013: Versioned settings and note metadata

- Status: accepted
- Date: 2026-07-20

## Context

Settings were untyped `SetSetting` key/value rows in `app_state`. Nothing defined which settings exist, their defaults, their compatibility across versions, or which UI state deserves durability at all. The reduced right sidebar also needed an explicit metadata contract so the renderer never invents durable fields the backend does not own.

## Decision

### Versioned settings document

One portable `WorkspaceSettings` document replaces per-key setting rows. It carries `settingsVersion` (currently 1), explicit defaults for every field, and no dependency on React, Tauri, SQLite, filesystem, or operating-system types. `UpdateSettings` replaces `SetSetting` and writes the whole normalized document in the same transactional path as every other operation. SQLite stores it under one `app_state` key; migration 0002 folds pre-release `setting:` rows into that document without data loss.

### Selected MVP settings and defaults

| Field | Default | Evidence |
| --- | --- | --- |
| `theme` | `midnight` | original appearance preferences |
| `compactSidebar` | `false` | original appearance preferences |
| `showPageIcons` | `true` | original appearance preferences |
| `reduceMotion` | `false` | original appearance preferences |
| `rememberLastNote` | `true` | original continuity default was `rememberLastTab: true`; tabs are out of MVP, so last-note restore is the continuity mechanism |
| `editorFont` | `inter` | original editor preferences |
| `editorLineHeight` | `comfortable` | original editor preferences (`cozy`, `comfortable`, `relaxed`) |
| `showLineNumbers` | `true` | original appearance preferences |
| `editorPlaceholder` | `Start writing...` | original editor preferences |

Theme, font, and line height are bounded identifier strings, not enums. The renderer resolves an unrecognized identifier to its default at render time, so adding a theme or font never invalidates stored settings or archives.

### Excluded original settings

- Journal, moods, and diary mode: journal is out of MVP.
- AI model, providers, keys, and translate language: AI and secrets are excluded; secrets never enter `app_state` or archives.
- Profile avatar color: no accounts exist.
- Analytics toggle: the standalone app has no analytics.
- Tabs (`openNotesInTabs`, `rememberLastTab`): tabs are out of MVP.
- Tag and mark detection, note property layouts and templates: tags, people, and properties are out of MVP.
- Quick-access goto configuration: the feature is not in the MVP surface.
- Raw/vim editor modes and number animation: the editor is not selected (ADR-0004); these return, if ever, with the editor ADR.
- `amountOfNotes` and activity log: derivable projections, not settings.

### State ownership

- Durable workspace state: the settings document, the active note ID, and canonical nodes/documents. Sidebar folder expansion is decided durable-but-native (`app_state`, excluded from archives, rebuildable as collapsed); its operation ships with the UI slice.
- Session-only state: process-lifetime values such as the current search query, palette input, and unacknowledged optimistic revisions. Never persisted.
- Renderer-only transient state: hover, focus, drag, open menus, scroll positions, and editor view internals. Never serialized, never crossing the storage port.

### Note metadata

No new durable note metadata is required. The reduced right sidebar renders entirely from already-owned canonical fields: `title`, `icon`, `created_at`, `updated_at` on nodes; `word_count`, `markdown`, `revision` on documents; version headers from the history cache. Characters, size, and read time are renderer-derived from the hydrated document. Original per-note fields (tags, properties, covers, annotation scenes, sharing roles, preferred editor mode) are excluded with their parent features.

### Compatibility

- Version 1 is the only supported settings version; `settingsVersion` above 1 is rejected explicitly everywhere the document is validated.
- Fields missing from a version-1 document deserialize to their defaults.
- Unknown fields are preserved losslessly as extension data through load, save, export, and import; extension keys may not collide with schema field names.
- Archive validation validates the typed settings document, so import remains all-or-nothing and round trips preserve extensions byte-for-value.
- A malformed stored document fails bootstrap explicitly instead of silently resetting user preferences.

## Consequences

- Desktop and future web adapters share one typed transport record and one generated JSON Schema for settings.
- The fully hydrated startup contract is unchanged: settings arrive in the bootstrap snapshot and reads never occur during navigation.
- Writers must send whole documents; there is no partial-key update, which keeps normalization and validation in one place.
- Adding a v1 field requires a default and archive fixtures; changing semantics requires `settingsVersion` 2 with explicit compatibility code.
- Pre-release databases converge through migration 0002; legacy values that collide with typed fields surface as explicit validation errors rather than silent drops.
