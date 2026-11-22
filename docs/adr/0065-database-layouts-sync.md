# ADR-0065: Database layouts sync through one operation per scope

- Status: accepted
- Date: 2026-11-22
- Supersedes: "Layouts are device-local settings" in
  [ADR-0057](0057-database-views.md)

## Context

ADR-0057 stored database layouts (table or board, column order and visibility,
sorts, filters, grouping, and the subfolder toggle) in the `databaseViews`
settings extension and wrote them with `update_settings`, which never leaves
the device. The folder, its notes, and every card's lane value synced, but the
choice to show a folder as a board did not. A board set up on the desktop,
by hand or by an agent, opened as a table on the phone and the laptop.

Settings already have one extension that replicates: `mathMacros`, written by
`set_math_macros` and preserved by `update_settings`. Layouts differ in one
way that matters: they are a map of independent scopes, and people change one
scope at a time on different devices.

## Decision

A new replicated operation, `set_database_view`, carries one scope's layout:
`{folderId, view}`, where a `null` folder ID is the all-notes view and a
`null` view clears the scope.

- **Same storage.** The layout still lives in the `databaseViews` settings
  extension, so snapshots, archives, the renderer's reader, and the 256 KiB
  cap on the stored document are unchanged.
- **One scope per operation.** Two devices that change different folders both
  keep their change. Two changes to one folder resolve by server order, whole
  layout against whole layout.
- **One merge rule.** Applying the operation replaces the scope, drops scopes
  whose folder no longer exists, and keeps the rest newest `updatedAt` first,
  ties by key, up to 100 scopes and a 240 KiB budget. The rule lives in
  `crates/skriuw-domain/src/database_view.rs` and is mirrored in
  `packages/renderer-core/src/database/config.ts`, so canonical storage and the
  renderer's optimistic state keep the same scopes. A stored document from a
  newer version is left alone.
- **The domain bounds, the renderer shapes.** The domain checks that a layout
  is a JSON object of at most 64 KiB. Its fields stay a renderer concern, as in
  ADR-0057.
- **`update_settings` keeps the stored layouts**, as it keeps `mathMacros`, so
  changing a device preference never overwrites a layout that arrived from
  another device.
- **Existing layouts replicate once.** A first sync connection replays every
  stored layout with the rest of the workspace. A device that was already
  connected when it upgraded queues its stored layouts once when the database
  opens, and a disconnected device does so when it reconnects. The
  `database_views_replicated` app state key records that this happened.

## Consequences

- A board set up on one device opens as a board on every device, including
  boards an agent creates.
- Layout changes enter the sync log. Each is one small operation, but every
  sort, filter, or column change on one device now reaches the others.
- If two devices each had a layout for the same folder before upgrading, the
  one whose replay reaches the server last wins.
- Builds older than this one do not know `set_database_view`. As with every
  operation added before it, devices need this build or later to exchange
  layouts.
