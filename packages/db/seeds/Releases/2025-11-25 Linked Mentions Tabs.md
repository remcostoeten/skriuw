# Release — 2025-11-25

## Linked mentions inside the editor
- Typing `@` now opens a searchable list of existing notes.
- The list is 100% keyboard navigable and supports fuzzy matching, so you can jump straight to the note you need.
- Selecting a result inserts the note title linked to its route, keeping navigation consistent on web and desktop builds.

## Optional multi-note tabs
- A new "Multi-note tabs" setting keeps the notes you open pinned across sessions.
- Tabs persist through localStorage (and future adapters) so switching between notes is instant, even after a reload.
- Closing a tab falls back to the next available one, so you never land on an empty editor.

## Storage considerations
- Mention data is saved inside the BlockNote document, so all adapters (localStorage, libsql, future SQLite) behave the same.
- Tab state only stores ids/titles and clears itself when the underlying note is removed.
