# Provider import

## Product contract

Provider import migrates local exports into the current workspace. It never
connects to provider accounts and never uploads note content.

Supported first-party routes:

- Markdown directories and files
- Plain-text directories and files
- Obsidian vaults
- Notion Markdown and CSV exports
- Bear TextBundles and `.bear2bk` backups
- Simplenote `notes.json` exports
- Apple Notes Markdown exports
- Evernote `.enex` exports
- Joplin RAW exports
- Google Keep Takeout exports
- Standard Notes decrypted backups

## Flow

```text
Local source
  └── bounded read or archive extraction
      └── provider detection and parse
          └── workspace-aware plan
              └── preview
                  ├── cancel: no workspace change
                  └── confirm: one atomic workspace request
                      └── completion report
```

Preview shows:

- detected provider and whether it was selected automatically;
- note, folder, image, tag, and property counts;
- duplicate titles and unresolved or ambiguous references;
- raw-preserved notes, blocked remote images, unreadable files, and unsupported
  records;
- provider diagnostics with affected source paths;
- destination behavior and re-import behavior.

Destination may be workspace root or any existing folder. Imported roots may
additionally be nested in a folder named after the detected provider, and
imported notes may be fanned out into folders named after their creation year.
Grouping reparents planned operations, so relative links and image references
stay intact. Grouping folders reuse an existing same-named folder instead of
creating a second one, and no grouping folder is created when every note was a
duplicate. Notes without a provider creation time fall back to the import year.

Re-import uses a
durable receipt keyed by provider, selected-source location fingerprint, and provider-relative
note path. Users choose to skip previously imported notes, update their content
and imported properties in place, or create another copy. New and updated
receipts commit in the same transaction as note changes.

Reading, planning, and local-image transfer publish progress. Cancellation
before the atomic workspace request leaves workspace records unchanged. The
final commit is non-cancellable once submitted.

Local images are content-addressed and preflighted before preview. Preview counts
only images successfully stored in the blob store, so its image count equals the
completion count. Cancellation can leave unreferenced blobs for later garbage
collection but creates no workspace record.

## Fidelity rules

- Original note text must be imported or retained as lossless raw Markdown.
- Valid local images enter the workspace blob store. Remote images never load.
- Unsupported attachments remain named in diagnostics.
- Exact imported and existing note titles resolve wiki-links only when unique.
- Provider timestamps are used when valid and otherwise fall back to import time.
- Tag matching is trimmed and case-insensitive. Raw-preserved notes store tags
  in a typed `Tags` property without modifying source Markdown.
- Typed properties use the closest lossless Skriuw value. Unsupported structured
  values remain source text or receive a diagnostic.
- Filename, Unicode, case, and stripped-provider-ID collisions receive stable
  numeric suffixes.

## Provider behavior

### Obsidian

Folders map to workspace folders. Wikilinks use the common reference planner.
Frontmatter maps supported scalars and lists to note properties. Tags map to
workspace tags. Image embeds resolve by exact vault path first; basename fallback
is allowed only when unique. Note embeds remain links. Unsupported frontmatter
must remain recoverable.

### Notion

UUID suffixes are removed from page and folder names with deterministic collision
handling. Leading duplicate title headings are removed. Page links become
wiki-links when uniquely mapped. Database CSV rows become notes under a folder
named after the database; columns become typed properties. Relation URLs and
unsupported formula or rollup projections remain text with diagnostics.

### Bear

TextBundle note Markdown and assets import together. Metadata supplies title,
tags, and timestamps when available. `.bear2bk` is treated as a ZIP container.
Encrypted records produce explicit diagnostics.

### Simplenote

Active notes, tags, creation time, modification time, and pin state import.
Pinned entries become pinned workspace notes on creation; re-imported notes that
already exist keep their current workspace pin state. Trashed entries remain
skipped and counted.

### Evernote

`.enex` exports are parsed as ENML without a DOM. Each export file becomes one
folder when several are imported together. Todos, code blocks, tables, and inline
marks map to Markdown. Encrypted and embedded media records become placeholders
with diagnostics.

### Joplin

RAW exports only; the JEX container is a TAR and is not accepted. Items are
discriminated by their trailing metadata block. Folder chains map to nested
workspace folders and `:/id` resource links resolve against exported resources.

### Google Keep

Takeout per-note JSON imports title, text, and checklists. Labels map to tags,
and pin, archive, and color map to typed properties. Attachments resolve against
sibling asset files. Trashed notes remain skipped and counted.

### Standard Notes

Decrypted backups import notes with tag items attached through references.
Encrypted payloads are detected and reported as errors rather than imported as
text.

### Apple Notes

Apple Notes uses its official Markdown export route. Exported Markdown and local
assets use the generic transfer engine. Private database parsing is unsupported.
Apple documents Markdown export for the selected note, not a bulk Markdown
export. Users must export notes individually or use another local export tool;
Skriuw cannot make the official route bulk-capable.

## Safety limits

Archive and directory intake must:

- reject absolute paths, parent traversal, symlinks, and duplicate normalized
  output paths;
- cap extracted entry count, individual text size, total expanded bytes, and
  directory depth;
- ignore hidden provider configuration unless an adapter explicitly needs it;
- clean temporary extraction directories after preview cancellation, success,
  or failure.

## Release gate

- Preview performs no durable workspace write.
- One failed workspace operation leaves zero imported workspace records.
- Preview counts equal completion counts.
- Every skipped or transformed unsupported item appears in diagnostics.
- Provider golden fixtures cover current documented export shapes.
- A 10,000-note fixture completes within the import performance budget without
  blocking navigation after commit.
- TypeScript, Rust, generated-contract, production-build, and end-to-end checks
  pass.
