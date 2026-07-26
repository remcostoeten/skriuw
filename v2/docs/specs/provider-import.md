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

Active notes, tags, creation time, and modification time import. Trashed entries
remain skipped and counted.

### Apple Notes

Apple Notes uses its official Markdown export route. Exported Markdown and local
assets use the generic transfer engine. Private database parsing is unsupported.

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
