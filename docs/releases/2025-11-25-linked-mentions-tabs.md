# Release — 2025-11-25

## Linked mentions inside the editor
- Typing `@` in the BlockNote editor now opens a fuzzy-searchable list of existing notes.
- The list is fully keyboard accessible and matches on partial titles, so jumping between notes stays fast.
- Selecting an item inserts the note title as a link back to that note, keeping navigation consistent on web and future desktop builds.

## Optional multi-note tabs
- A new “Multi-note tabs” setting keeps a tab bar of recently opened notes.
- Tabs persist across reloads (stored next to other preferences) and closing one falls back to the next available note instead of leaving an empty editor.
- The toggle lives with the other editor preferences, so you can turn tabs on only when you need them.

## Storage considerations
- Mention metadata is saved in the same BlockNote JSON used everywhere else, so localStorage, libsql, and future SQLite adapters behave the same.
- Tab state only records ids and titles and cleans itself up when notes are removed, so it stays lightweight even with larger vaults.
