# Import notes from another app

Skriuw imports local exports. Note content stays on the device.

Open the command palette and choose:

- **Import notes from folder…** for Markdown, text, Obsidian vaults, extracted
  Notion exports, or TextBundles.
- **Import provider export…** for ZIP, `.bear2bk`, Markdown, text, Simplenote
  JSON, or Notion CSV files.

Skriuw scans the source before changing the workspace. Check the detected format,
counts, and warnings in the preview. Change the format when a generic Markdown
folder came from Apple Notes. Cancel closes the preview without importing.

Confirmed note, folder, tag, property, image-record, and document changes commit
together. Re-importing creates another copy.

## Provider export routes

### Obsidian

Choose the vault folder. Skriuw ignores `.obsidian`, preserves the folder tree,
maps supported frontmatter, resolves unambiguous image embeds, and imports
wikilinks when their target title is unique. Complex frontmatter remains exact
raw Markdown.

### Notion

In Notion, export as **Markdown & CSV** and include files. Import the downloaded
ZIP directly. Page UUID suffixes are removed. Database rows become notes under a
database folder; CSV columns become typed properties.

### Bear

Import a `.bear2bk` backup directly, or choose a folder containing TextBundles.
Skriuw reads TextBundle Markdown, images, timestamps, and exported tags. Trashed
and encrypted notes remain skipped and appear in the report.

### Simplenote

Import `notes.json` or its containing folder. Active notes, tags, and timestamps
import. Trashed notes remain skipped and counted.

### Apple Notes

In Apple Notes, export notes as Markdown. Choose their folder, then select
**Apple Notes Markdown** in the preview format menu. Skriuw does not read Apple's
private Notes database.

## Safety and fidelity

- Remote images stay blocked.
- Ambiguous links and image basenames stay as source text.
- Unsupported Markdown uses lossless raw mode.
- Tags on raw-preserved notes become a typed `Tags` property without modifying
  source Markdown.
- Unsupported attachments and unreadable files appear in preview and completion
  reports.
- Archives reject absolute paths, parent traversal, symlinks, duplicate
  case-insensitive paths, excessive depth, excessive entry counts, and expanded
  data beyond safety limits.
