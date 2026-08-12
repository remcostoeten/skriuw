# Import notes from another app

Skriuw imports local exports. Note content stays on the device.

Open the command palette and choose:

- **Import notes from folder…** for Markdown, text, Obsidian vaults, extracted
  Notion exports, TextBundles, Joplin RAW exports, or Google Keep Takeout
  folders.
- **Import provider export…** for ZIP, `.bear2bk`, `.enex`, Markdown, text,
  Simplenote JSON, Standard Notes backups, or Notion CSV files.

Skriuw scans the source before changing the workspace. Check the detected format,
destination, re-import mode, counts, and warnings in the preview. Change the
format when a generic Markdown folder came from Apple Notes. Cancel during
intake, preview, or image transfer leaves workspace records unchanged.

Under **Organize** the preview can place everything in a folder named after the
detected app and split imported notes into folders by the year they were created.
Both reuse a folder of that name when one already exists, so importing the same
export twice does not stack up folders. Notes the export gives no creation date
land in the current year.

Confirmed note, folder, tag, property, image-record, and document changes commit
together with durable import receipts. Re-import can skip previous matches,
update their content and imported properties, or create copies. Receipts whose
note was deleted are ignored, so a trashed note re-imports instead of silently
being skipped.

## Provider export routes

### Obsidian

Choose the vault folder. Skriuw ignores `.obsidian`, preserves the folder tree,
maps supported frontmatter, resolves unambiguous image embeds, and imports
wikilinks when their target title is unique. Alias (`[[target|label]]`) and
heading (`[[target#heading]]`) wikilinks stay as source text. Complex
frontmatter remains exact raw Markdown.

### Notion

In Notion, export as **Markdown & CSV** and include files. Import the downloaded
ZIP directly. Page UUID suffixes are removed. Database rows become notes under a
database folder; CSV columns become typed properties.

### Bear

Import a `.bear2bk` backup directly, or choose a folder containing TextBundles.
Skriuw reads TextBundle Markdown, images, timestamps, and exported tags. Trashed
and encrypted notes remain skipped and appear in the report.

### Simplenote

Import `notes.json` or its containing folder. Active notes, tags, timestamps, and
pinned notes import. Trashed notes remain skipped and counted.

### Evernote

In Evernote, export a notebook as `.enex` and import the file directly, or place
several `.enex` files in one folder to get a folder per notebook. Checkboxes,
code blocks, tables, and formatting import. Encrypted and embedded attachments
become placeholders listed in the report.

### Joplin

Export as **RAW** (a folder), not JEX, and choose that folder. Notebooks become
nested folders, and resource links resolve to the exported `resources` files.

### Google Keep

In Google Takeout, export Keep and import the extracted `Keep` folder. Checklists
become checkboxes, labels become tags, and pin, archive, and color become
properties. Trashed notes remain skipped and counted.

### Standard Notes

Import a **decrypted** backup file. Tags attach through the backup's references.
An encrypted backup is reported as an error instead of importing as unreadable
text.

### Apple Notes

In Apple Notes, select a note and choose **File > Export as > Markdown**. Apple
documents this as a selected-note operation and does not document bulk Markdown
export. Repeat it for each note, collect the files in one folder, then choose
that folder and select **Apple Notes Markdown** in Skriuw. Skriuw does not read
Apple's private Notes database. See [Apple's Notes export guide](https://support.apple.com/guide/notes/import-export-and-print-notes-not201900c07/mac/26).

## Safety and fidelity

- Remote images stay blocked.
- Ambiguous links and image basenames stay as source text.
- Unsupported Markdown uses lossless raw mode.
- Tags on raw-preserved notes become a typed `Tags` property and workspace
  backlinks without modifying source Markdown.
- Unsupported attachments and unreadable files appear in preview and completion
  reports.
- Archives reject absolute paths, parent traversal, symlinks, duplicate
  case-insensitive paths, excessive depth, excessive entry counts, and expanded
  data beyond safety limits.
