# Import / Export Plan

## Current State

- Workspace export already exists at `src/app/api/data/export/route.ts`.
- Settings UI already triggers export from `src/features/settings/sections/data-section.tsx`.
- Journal-only export also exists in `src/features/journal/components/journal-stats.tsx`.
- Import is currently only a disabled placeholder in the settings UI.

## UI Cleanup

- Remove the visible `Sync over cellular` title if that row is meant to stay as a placeholder.
- Keep the description and disabled switch, or remove the entire row if the feature is not being surfaced yet.

## Import Recommendation

- Start with a merge-only import.
- Treat the export ZIP as a backup/share format, not a destructive restore format.
- Avoid overwrite/replace behavior in the first version.
- Add a preview or conflict summary before any write happens.

## Import Contract

Use the existing export shape as the source of truth:

- ZIP root folder format
- `skriuw-export.json` manifest
- note file naming rules
- journal file naming rules
- folder path reconstruction
- tag representation

## Implementation Steps

1. Add an import UI in `src/features/settings/sections/data-section.tsx`.
2. Add file selection and upload handling.
3. Add loading, error, and success states.
4. Add a server import route that accepts a ZIP archive.
5. Validate the archive before any database writes.
6. Parse and rebuild:
   - folders
   - notes
   - journal entries
   - tags
7. Define conflict handling:
   - duplicate folder names
   - duplicate note names
   - duplicate journal dates
   - deterministic skip or rename behavior
8. Update the README to document the import/export workflow.

## Test Coverage

- Valid export archive round-trip
- Invalid ZIP rejection
- Malformed manifest rejection
- Missing file handling
- Duplicate handling
- Auth failure handling

## Suggested Order

1. Clean up the settings row copy.
2. Add the import picker and UI states.
3. Implement the import route and validation.
4. Add merge logic for folders, notes, journal entries, and tags.
5. Add tests.
6. Document the workflow in the README.

