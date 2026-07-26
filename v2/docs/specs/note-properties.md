# Typed note properties and templates

Status: active.

## Goal

Give notes ordered, typed metadata matching the useful v1 property surface while preserving local-first startup, narrow renderer subscriptions, portable archives, and explicit compatibility.

Properties are workspace content. Templates are reusable workspace-owned property sets. Neither is embedded in editor JSON or stored as an unvalidated settings extension.

## Value contract

Every value carries `valueVersion: 1`, a type discriminator, and a payload valid for that type:

- `text`, `date`, `url`, `location`, `email`, and `phone`: string;
- `number`: finite number or null;
- `select`: option ID or null;
- `multi_select`: ordered option IDs;
- `person`: ordered person IDs;
- `checkbox`: boolean;
- `rating`: integer from zero through five or null.

Changing a property's type resets it to that type's empty value. Values with unsupported versions, mismatched payloads, dangling option IDs, dangling person IDs, duplicate IDs, or invalid ratings are rejected rather than coerced silently.

Select and multi-select properties own ordered options. An option has a stable ID, label, and one of the restrained `gray`, `stone`, `amber`, `green`, `blue`, `teal`, `rose`, or `red` colors.

## Records

A note property contains:

- note ID;
- stable property ID;
- name;
- versioned typed value;
- ordered options where applicable;
- position.

A template contains:

- stable template ID;
- name;
- position;
- ordered fields using the same value and option contracts without a note ID.

Instantiating a template creates fresh property and option IDs so later edits do not mutate the template or another note.

## Domain operations

The workspace protocol provides narrow use cases:

- set, remove, and reorder note properties;
- set, delete, and reorder property templates.

Setting a property is an upsert by note and property ID. Reordering accepts the complete ordered ID set for one owner and fails atomically when IDs are missing, duplicated, or foreign. Properties may belong only to existing notes. Soft trash preserves them; permanent purge cascades them.

All renderer actions apply synchronously to the normalized store before durable submission. Acknowledgement, SQLite, archive work, and history never enter the interaction path.

## Storage

SQLite stores property and template ownership/order in relational columns and the versioned value and options as validated JSON. Durable writes remain serialized and each operation is atomic.

Bootstrap hydrates properties and templates with the workspace snapshot. The renderer indexes properties by note ID and templates by template ID. The metadata surface subscribes only to the active note's ordered property projection; editor typing, sidebar rows, and unrelated metadata sections do not subscribe.

## Archive compatibility

Workspace archive version 3 includes properties and templates. Versions 1 and 2 remain accepted and import with empty property and template collections. Export always writes version 3.

Golden fixtures cover:

- legacy archives without properties;
- all twelve value types;
- property options and ordering;
- reusable templates;
- invalid versions, payloads, references, and duplicate IDs;
- two complete SQLite import/export round trips.

## UI

The metadata panel provides:

- an empty state and add-property action;
- type selection;
- inline name and value editing;
- add, rename, recolor, reorder, and remove option actions;
- keyboard-accessible property reorder and deletion;
- built-in and custom template application;
- complete active, disabled, error, and confirmation states.

The dense metadata information architecture remains intact. Property editing does not add cards, large radii, broad context state, or action animation.

## Non-goals

- database/table views over properties;
- formulas and computed properties;
- network-backed person lookup;
- sharing or collaborative property state;
- storing secrets in properties;
- using a property mutation to create a workspace task implicitly.

## Acceptance

- All value kinds round-trip through domain operation, SQLite, bootstrap, store, archive, and UI.
- Template instantiation produces independent IDs and values.
- Older archives import with empty property state.
- Invalid typed values and references fail explicitly without partial writes.
- Trashing preserves properties and purging removes them.
- The metadata panel observes only the active note's property projection.
- Adding and editing a property paints synchronously and performs no navigation-time read.
- `./scripts/generate.sh` and `./scripts/check.sh` pass.
