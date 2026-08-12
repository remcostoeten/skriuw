# Import samples

Ready-to-import sample exports, one per supported provider, for manually
exercising the import flow. Unlike the parser golden fixtures in
[`../provider-import/`](../provider-import/README.md), these include the
packaged archive forms and richer content: nested folders, frontmatter
properties, wikilinks, tags, image assets, tables, and checklists.

All content is synthetic and safe to import into any workspace. Every import
is previewed and atomic, so cancelling leaves the workspace unchanged.

## How to import each sample

| Sample | Command palette action | Pick |
| --- | --- | --- |
| `obsidian-vault/` | Import notes from folder… | the folder |
| `notion-export.zip` | Import provider export… | the ZIP |
| `Bear Backup.bear2bk` | Import provider export… | the file |
| `simplenote/notes.json` | Import provider export… | the file |
| `apple-notes/` | Import notes from folder… | the folder, then select **Apple Notes Markdown** |

Apple Notes Markdown is indistinguishable from generic Markdown, so detection
proposes generic Markdown first; switching the format in the preview is the
documented route.

For generic Markdown folder import, use [`../demo-vault/`](../demo-vault).

## What each sample exercises

- `obsidian-vault/` - `.obsidian` ignored, YAML frontmatter to typed
  properties, one deliberately complex frontmatter field (lossless raw
  fallback warning), wikilinks with alias and heading targets, an
  `![[diagram.png]]` embed resolved from `Attachments/`, table, checklist.
- `notion-export.zip` - UUID-suffixed page names, page-to-page links,
  a page asset folder with an image, and a database CSV (`Backlog`) whose
  rows become notes with typed properties.
- `Bear Backup.bear2bk` - two TextBundles with `info.json` timestamps,
  in-text `#tags` (including nested `#home/kitchen`), and an `assets/` image.
- `simplenote/notes.json` - active notes with tags and timestamps plus one
  trashed note that must be skipped and reported.
- `apple-notes/` - plain selected-note Markdown exports.

## Regenerating the archives

`notion-export.zip` and `Bear Backup.bear2bk` are zipped copies of their
sibling source directories. After editing the sources, rebuild them:

```bash
cd fixtures/import-samples
python3 - <<'PY'
import zipfile, pathlib

def pack(src, dest):
    src = pathlib.Path(src)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(src.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(src).as_posix())

pack("notion-export", "notion-export.zip")
pack("bear-backup", "Bear Backup.bear2bk")
PY
```
