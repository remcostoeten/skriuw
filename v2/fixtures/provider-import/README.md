# Provider import fixtures

These fixtures preserve provider-owned directory names, filenames, metadata
keys, and record shapes while using synthetic note content. They are safe to
commit and exercise the same parser paths as local exports.

- `obsidian/` models a vault with `.obsidian`, YAML frontmatter, wikilinks, and
  an attachment reference.
- `notion/` models a Markdown & CSV export with UUID-suffixed page names and a
  database CSV.
- `bear/` models an unencrypted TextBundle export with `info.json`.
- `simplenote/` models the `notes.json` bulk export.
- `apple-notes/` models Markdown files produced by Notes on macOS.

Binary archive wrapping is tested separately by native ZIP and `.bear2bk`
intake tests.
