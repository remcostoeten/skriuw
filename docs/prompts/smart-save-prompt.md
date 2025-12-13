# Smart Save & Revision Layer Prompt

Ship resilient note history so alpha users can recover from crashes or bad saves.

## Objectives
- Add a `note_revisions` table and API to persist revision snapshots.
- Integrate smart-save logic in the editor to create meaningful revisions (not every keystroke).
- Provide a UI to browse, preview, and restore revisions.

## Tasks
1) Schema: add `note_revisions` per SMART_SAVE_PLAN.md (id, noteId FK cascade, content JSON, createdAt, reason, indexes); add Drizzle migration.
2) Core logic: implement `shouldCreateRevision` in `packages/core-logic` (normalize text, structural check); export for web.
3) API: expose revision create/list endpoints scoped to user; enforce auth; ensure content stored as stringified BlockNote JSON.
4) Editor integration: in `use-notes`/editor save flow, track last revision ref; on save, always persist note, then conditionally create a revision using smart-save; debounce as needed.
5) UI: add “History” entry (toolbar/button) to open a modal/sidebar showing timestamps + reasons; allow preview (read-only) and “Restore” to replace current content.
6) Tests: unit test smart-save predicate; API tests ensure user scoping; a regression test that saving same text twice does not create duplicate revisions.

## Definition of Done
- Revisions table and migration exist; API and auth in place.
- Saving creates note + conditional revision; restores work and update editor content.
- UI lets users browse and restore revisions; tests cover predicate and API auth/scope.
