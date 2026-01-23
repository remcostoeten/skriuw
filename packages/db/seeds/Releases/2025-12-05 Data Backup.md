# Release — 2025-12-05

## Data & Backup Feature

The Archive page has been completely rebuilt into a useful **Data & Backup** center. You can now export and import your notes with ease.

## Export Notes

Two export formats are available:

### Skriuw Backup (.json)

- Full backup with all metadata, folder structure, and note content
- Best for restoring your notes later or moving to another device
- Preserves pinned/favorite status, timestamps, and folder hierarchy

### Markdown Export (.md)

- Portable markdown files with YAML frontmatter
- Compatible with Obsidian, Notion, and other markdown-based apps
- Each note includes metadata like title, creation date, and folder path

## Import Notes

Drag and drop files or click to browse. Supported formats:

### From Skriuw Backup

- Restore from a `.json` file previously exported from Skriuw
- Validates the backup format before importing
- Shows a preview of how many notes and folders will be imported

### From Markdown Files

- Import `.md` files from Obsidian, Notion, or any markdown source
- Parses YAML frontmatter for metadata (title, dates, folder)
- Converts markdown content to BlockNote blocks

## Trash (Coming Soon)

A placeholder for soft-delete functionality:

- Deleted notes will be kept for 30 days before permanent removal
- Restore accidentally deleted notes
- Empty trash manually when needed

## How to Access

Click the folder icon in the left toolbar, or navigate to `/archive`.

## Technical Details

- Export utilities: `features/backup/utils/export-notes.ts`
- Import utilities: `features/backup/utils/import-notes.ts`
- UI components: `features/backup/components/`
- Uses the shared NotesContext for consistent data access
