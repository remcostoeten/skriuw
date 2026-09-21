use crate::state::AppState;
use serde::{Deserialize, Serialize};
use skriuw_images::ImageStore;
use std::{
    collections::BTreeSet,
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownExportEntry {
    relative_path: String,
    kind: String,
    markdown: Option<String>,
    #[serde(default)]
    content_hash: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownFilePayload {
    relative_path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownTreePayload {
    directories: Vec<String>,
    files: Vec<MarkdownFilePayload>,
    assets: Vec<String>,
    unsupported: Vec<String>,
    skipped: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedImportSource {
    root_path: String,
    temporary: bool,
    tree: MarkdownTreePayload,
}

const IMPORT_MAX_ENTRIES: usize = 20_000;
const IMPORT_MAX_FILE_BYTES: u64 = 128 * 1024 * 1024;
const IMPORT_MAX_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const IMPORT_MAX_DEPTH: usize = 64;

fn create_import_temp_dir() -> Result<PathBuf, String> {
    let base = env::temp_dir();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    for suffix in 0..16 {
        let path = base.join(format!(
            "skriuw-import-{}-{timestamp}-{suffix}",
            std::process::id()
        ));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("create {}: {error}", path.display())),
        }
    }
    Err("could not allocate import temporary directory".to_string())
}

fn remove_import_temp_dir(path: &Path) -> Result<(), String> {
    let valid_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("skriuw-import-"));
    if path.parent() != Some(env::temp_dir().as_path()) || !valid_name {
        return Err("refused to remove non-import temporary directory".to_string());
    }
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| format!("remove {}: {error}", path.display()))?;
    }
    Ok(())
}

fn extract_import_archive(source: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(source)
        .map_err(|error| format!("open import archive {}: {error}", source.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("read import archive: {error}"))?;
    if archive.len() > IMPORT_MAX_ENTRIES {
        return Err(format!(
            "import archive has {} entries; limit is {IMPORT_MAX_ENTRIES}",
            archive.len()
        ));
    }
    let mut total_bytes = 0_u64;
    let mut normalized_paths = BTreeSet::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("read import archive entry {index}: {error}"))?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| format!("unsafe import archive path: {}", entry.name()))?;
        if relative.components().count() > IMPORT_MAX_DEPTH {
            return Err(format!("import archive path is too deep: {}", entry.name()));
        }
        if entry.is_symlink() {
            return Err(format!("import archive contains symlink: {}", entry.name()));
        }
        let normalized = relative.to_string_lossy().replace('\\', "/").to_lowercase();
        if !normalized_paths.insert(normalized) {
            return Err(format!("duplicate import archive path: {}", entry.name()));
        }
        if entry.is_dir() {
            fs::create_dir_all(target.join(relative))
                .map_err(|error| format!("create import directory: {error}"))?;
            continue;
        }
        if !entry.is_file() {
            return Err(format!(
                "unsupported import archive entry: {}",
                entry.name()
            ));
        }
        if entry.size() > IMPORT_MAX_FILE_BYTES {
            return Err(format!(
                "import archive file is too large: {}",
                entry.name()
            ));
        }
        total_bytes = total_bytes
            .checked_add(entry.size())
            .ok_or_else(|| "import archive expanded size overflow".to_string())?;
        if total_bytes > IMPORT_MAX_TOTAL_BYTES {
            return Err(format!(
                "import archive expands beyond {} bytes",
                IMPORT_MAX_TOTAL_BYTES
            ));
        }
        let output = target.join(relative);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("create import directory: {error}"))?;
        }
        let mut destination = fs::File::create(&output)
            .map_err(|error| format!("create import file {}: {error}", output.display()))?;
        let copied = io::copy(
            &mut entry.by_ref().take(IMPORT_MAX_FILE_BYTES + 1),
            &mut destination,
        )
        .map_err(|error| format!("extract import file {}: {error}", output.display()))?;
        if copied > IMPORT_MAX_FILE_BYTES {
            return Err(format!(
                "import archive file is too large: {}",
                entry.name()
            ));
        }
    }
    Ok(())
}

fn prepare_import_source_path(source: &Path) -> Result<PreparedImportSource, String> {
    if source.is_dir() {
        return Ok(PreparedImportSource {
            root_path: source.display().to_string(),
            temporary: false,
            tree: collect_markdown_tree(source)?,
        });
    }
    if !source.is_file() {
        return Err(format!(
            "import source does not exist: {}",
            source.display()
        ));
    }
    let temporary = create_import_temp_dir()?;
    let result = (|| {
        let lowered = source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if lowered.ends_with(".zip") || lowered.ends_with(".bear2bk") {
            extract_import_archive(source, &temporary)?;
        } else if has_importable_extension(&lowered) {
            let file_name = source
                .file_name()
                .ok_or_else(|| "import file has no name".to_string())?;
            fs::copy(source, temporary.join(file_name))
                .map_err(|error| format!("copy import file {}: {error}", source.display()))?;
        } else {
            return Err("unsupported import source; choose a folder, ZIP, Bear backup, Markdown, text, JSON, CSV, or Evernote ENEX file".to_string());
        }
        Ok(PreparedImportSource {
            root_path: temporary.display().to_string(),
            temporary: true,
            tree: collect_markdown_tree(&temporary)?,
        })
    })();
    if result.is_err() {
        let _ = remove_import_temp_dir(&temporary);
    }
    result
}

fn unique_import_file_name(taken: &mut BTreeSet<String>, name: &str) -> String {
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, format!(".{extension}")),
        _ => (name, String::new()),
    };
    let mut candidate = name.to_string();
    let mut suffix = 2;
    while !taken.insert(candidate.to_lowercase()) {
        candidate = format!("{stem} ({suffix}){extension}");
        suffix += 1;
    }
    candidate
}

fn prepare_import_source_paths(sources: &[PathBuf]) -> Result<PreparedImportSource, String> {
    match sources {
        [] => Err("no import source selected".to_string()),
        [single] => prepare_import_source_path(single),
        many => {
            let temporary = create_import_temp_dir()?;
            let result = (|| {
                let mut taken = BTreeSet::new();
                for source in many {
                    if !source.is_file() {
                        return Err(format!(
                            "select files only when importing several sources: {}",
                            source.display()
                        ));
                    }
                    let file_name = source
                        .file_name()
                        .and_then(|name| name.to_str())
                        .ok_or_else(|| "import file has no name".to_string())?;
                    if !has_importable_extension(&file_name.to_lowercase()) {
                        return Err(format!(
                            "unsupported import file; choose Markdown, text, JSON, CSV, or ENEX files: {}",
                            source.display()
                        ));
                    }
                    let target = temporary.join(unique_import_file_name(&mut taken, file_name));
                    fs::copy(source, &target).map_err(|error| {
                        format!("copy import file {}: {error}", source.display())
                    })?;
                }
                Ok(PreparedImportSource {
                    root_path: temporary.display().to_string(),
                    temporary: true,
                    tree: collect_markdown_tree(&temporary)?,
                })
            })();
            if result.is_err() {
                let _ = remove_import_temp_dir(&temporary);
            }
            result
        }
    }
}

pub(crate) fn resolve_relative_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() {
        return Err("empty export path".to_string());
    }
    let mut resolved = root.to_path_buf();
    for component in relative.split('/') {
        if component.is_empty() || component == "." || component == ".." || component.contains('\\')
        {
            return Err(format!("invalid export path: {relative}"));
        }
        resolved.push(component);
    }
    Ok(resolved)
}

fn write_markdown_entries(
    target: &Path,
    entries: &[MarkdownExportEntry],
    image_store: &ImageStore,
) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| format!("create {}: {error}", target.display()))?;
    for entry in entries {
        let path = resolve_relative_path(target, &entry.relative_path)?;
        match entry.kind.as_str() {
            "folder" => {
                fs::create_dir_all(&path)
                    .map_err(|error| format!("create {}: {error}", path.display()))?;
            }
            "note" => {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("create {}: {error}", parent.display()))?;
                }
                fs::write(&path, entry.markdown.as_deref().unwrap_or(""))
                    .map_err(|error| format!("write {}: {error}", path.display()))?;
            }
            "image" => {
                let (Some(content_hash), Some(mime_type)) =
                    (entry.content_hash.as_deref(), entry.mime_type.as_deref())
                else {
                    return Err(format!(
                        "image export entry {} is missing blob metadata",
                        entry.relative_path
                    ));
                };
                let source = image_store
                    .blob_path(content_hash, mime_type)
                    .map_err(|error| error.to_string())?;
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("create {}: {error}", parent.display()))?;
                }
                fs::copy(&source, &path).map_err(|error| {
                    format!("copy blob {content_hash} to {}: {error}", path.display())
                })?;
            }
            other => return Err(format!("unknown export entry kind: {other}")),
        }
    }
    Ok(())
}

fn has_importable_extension(name: &str) -> bool {
    let lowered = name.to_lowercase();
    ["md", "markdown", "txt", "json", "csv", "enex"]
        .iter()
        .any(|extension| lowered.ends_with(&format!(".{extension}")))
}

/// Must stay in sync with `sniff_mime` in `crates/skriuw-images/src/lib.rs`.
fn has_asset_extension(name: &str) -> bool {
    let lowered = name.to_lowercase();
    ["png", "jpg", "jpeg", "gif", "webp"]
        .iter()
        .any(|extension| lowered.ends_with(&format!(".{extension}")))
}

fn walk_markdown_dir(
    dir: &Path,
    prefix: &str,
    payload: &mut MarkdownTreePayload,
) -> Result<(), String> {
    let mut entries: Vec<fs::DirEntry> = fs::read_dir(dir)
        .map_err(|error| format!("read {}: {error}", dir.display()))?
        .collect::<Result<_, _>>()
        .map_err(|error| format!("read {}: {error}", dir.display()))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let file_type = entry
            .file_type()
            .map_err(|error| format!("stat {}: {error}", entry.path().display()))?;
        if file_type.is_dir() {
            if name.starts_with('.') {
                continue;
            }
            payload.directories.push(relative.clone());
            walk_markdown_dir(&entry.path(), &relative, payload)?;
        } else if name.starts_with('.') {
            continue;
        } else if has_importable_extension(&name) {
            match fs::read_to_string(entry.path()) {
                Ok(content) => payload.files.push(MarkdownFilePayload {
                    relative_path: relative,
                    content,
                }),
                Err(_) => payload.skipped += 1,
            }
        } else if has_asset_extension(&name) {
            payload.assets.push(relative);
        } else {
            payload.unsupported.push(relative);
        }
    }
    Ok(())
}

fn collect_markdown_tree(root: &Path) -> Result<MarkdownTreePayload, String> {
    let mut payload = MarkdownTreePayload {
        directories: Vec::new(),
        files: Vec::new(),
        assets: Vec::new(),
        unsupported: Vec::new(),
        skipped: 0,
    };
    walk_markdown_dir(root, "", &mut payload)?;
    Ok(payload)
}

#[tauri::command]
pub async fn export_markdown_tree(
    entries: Vec<MarkdownExportEntry>,
    target_dir: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let image_store = Arc::clone(&state.image_store);
    tauri::async_runtime::spawn_blocking(move || {
        write_markdown_entries(Path::new(&target_dir), &entries, &image_store)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_markdown_tree(source_dir: String) -> Result<MarkdownTreePayload, String> {
    tauri::async_runtime::spawn_blocking(move || collect_markdown_tree(Path::new(&source_dir)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn prepare_import_source(source_path: String) -> Result<PreparedImportSource, String> {
    tauri::async_runtime::spawn_blocking(move || {
        prepare_import_source_path(Path::new(&source_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn prepare_import_sources(
    source_paths: Vec<String>,
) -> Result<PreparedImportSource, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let paths = source_paths
            .iter()
            .map(PathBuf::from)
            .collect::<Vec<PathBuf>>();
        prepare_import_source_paths(&paths)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn cleanup_import_source(root_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_import_temp_dir(Path::new(&root_path)))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod markdown_tree_tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn entry(relative_path: &str, kind: &str, markdown: Option<&str>) -> MarkdownExportEntry {
        MarkdownExportEntry {
            relative_path: relative_path.to_string(),
            kind: kind.to_string(),
            markdown: markdown.map(str::to_string),
            content_hash: None,
            mime_type: None,
        }
    }

    fn empty_image_store() -> (tempfile::TempDir, ImageStore) {
        let dir = tempdir().expect("blob tempdir");
        let store = ImageStore::open(dir.path().join("blobs")).expect("open blob store");
        (dir, store)
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = fs::File::create(path).expect("create zip");
        let mut writer = zip::ZipWriter::new(file);
        for (name, content) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .expect("start zip file");
            writer.write_all(content).expect("write zip file");
        }
        writer.finish().expect("finish zip");
    }

    #[test]
    fn writes_and_reads_back_a_markdown_tree() {
        let dir = tempdir().expect("tempdir");
        let (_blob_dir, image_store) = empty_image_store();
        let entries = [
            entry("Projects", "folder", None),
            entry("Projects/Skriuw", "folder", None),
            entry("Projects/Skriuw/Roadmap.md", "note", Some("# Roadmap")),
            entry("Inbox.md", "note", Some("hello")),
        ];
        write_markdown_entries(dir.path(), &entries, &image_store).expect("write tree");

        let tree = collect_markdown_tree(dir.path()).expect("collect tree");
        assert_eq!(tree.directories, ["Projects", "Projects/Skriuw"]);
        assert_eq!(tree.skipped, 0);
        let paths: Vec<&str> = tree
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["Inbox.md", "Projects/Skriuw/Roadmap.md"]);
        assert_eq!(tree.files[1].content, "# Roadmap");
    }

    #[test]
    fn prepares_several_markdown_files_into_one_source() {
        let dir = tempdir().expect("tempdir");
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).expect("create nested");
        fs::write(dir.path().join("Note.md"), "# One").expect("write first");
        fs::write(nested.join("Note.md"), "# Two").expect("write second");
        let sources = [dir.path().join("Note.md"), nested.join("Note.md")];

        let prepared = prepare_import_source_paths(&sources).expect("prepare sources");
        assert!(prepared.temporary);
        let paths: Vec<&str> = prepared
            .tree
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["Note (2).md", "Note.md"]);
        remove_import_temp_dir(Path::new(&prepared.root_path)).expect("cleanup");
    }

    #[test]
    fn rejects_unsupported_files_in_a_multi_file_selection() {
        let dir = tempdir().expect("tempdir");
        fs::write(dir.path().join("Note.md"), "# One").expect("write note");
        fs::write(dir.path().join("photo.png"), [0x89]).expect("write asset");
        let sources = [dir.path().join("Note.md"), dir.path().join("photo.png")];

        let error = prepare_import_source_paths(&sources)
            .err()
            .expect("reject asset");
        assert!(error.contains("unsupported import file"), "{error}");
    }

    #[test]
    fn rejects_escaping_and_absolute_paths() {
        let dir = tempdir().expect("tempdir");
        let (_blob_dir, image_store) = empty_image_store();
        for relative_path in ["../escape.md", "/absolute.md", "a/../b.md", "", "a//b.md"] {
            let result = write_markdown_entries(
                dir.path(),
                &[entry(relative_path, "note", Some(""))],
                &image_store,
            );
            assert!(result.is_err(), "accepted {relative_path:?}");
        }
    }

    #[test]
    fn copies_image_blobs_into_export_tree() {
        let dir = tempdir().expect("tempdir");
        let (_blob_dir, image_store) = empty_image_store();
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
        let stored = image_store.put(&png).expect("store blob");
        let entries = [
            entry("Note.md", "note", Some("![](images/image-1.png)")),
            MarkdownExportEntry {
                relative_path: "images/image-1.png".into(),
                kind: "image".into(),
                markdown: None,
                content_hash: Some(stored.content_hash.clone()),
                mime_type: Some(stored.mime_type.into()),
            },
        ];
        write_markdown_entries(dir.path(), &entries, &image_store).expect("write tree");

        let copied = fs::read(dir.path().join("images/image-1.png")).expect("read copy");
        assert_eq!(copied, png);
    }

    #[test]
    fn reads_supported_text_files_and_counts_invalid_utf8_as_skipped() {
        let dir = tempdir().expect("tempdir");
        fs::write(dir.path().join("valid.md"), "ok").expect("write valid");
        fs::write(dir.path().join("broken.md"), [0xff, 0xfe, 0xfd]).expect("write broken");
        fs::write(dir.path().join("notes.txt"), "plain text").expect("write text");
        fs::write(dir.path().join("database.csv"), "Name\nTask").expect("write csv");
        fs::write(dir.path().join("export.enex"), "<en-export/>").expect("write enex");
        fs::write(dir.path().join("attachment.pdf"), b"%PDF").expect("write pdf");
        fs::write(dir.path().join(".DS_Store"), "hidden").expect("write hidden");

        let tree = collect_markdown_tree(dir.path()).expect("collect tree");
        let paths: Vec<&str> = tree
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(
            paths,
            ["database.csv", "export.enex", "notes.txt", "valid.md"]
        );
        assert_eq!(tree.unsupported, ["attachment.pdf"]);
        assert_eq!(tree.skipped, 1);
    }

    #[test]
    fn prepares_and_cleans_archive_import_sources() {
        let dir = tempdir().expect("tempdir");
        let archive = dir.path().join("export.zip");
        write_zip(
            &archive,
            &[
                ("Vault/Note.md", b"# Note"),
                ("Vault/Database.csv", b"Name\nTask"),
                ("Vault/image.png", b"\x89PNG\r\n\x1a\n"),
            ],
        );

        let prepared = prepare_import_source_path(&archive).expect("prepare archive");
        assert!(prepared.temporary);
        assert_eq!(prepared.tree.files.len(), 2);
        assert_eq!(prepared.tree.assets, ["Vault/image.png"]);
        let root = PathBuf::from(&prepared.root_path);
        assert!(root.exists());
        remove_import_temp_dir(&root).expect("clean import");
        assert!(!root.exists());
    }

    #[test]
    fn rejects_archive_parent_traversal() {
        let dir = tempdir().expect("tempdir");
        let archive = dir.path().join("unsafe.zip");
        write_zip(&archive, &[("../escape.md", b"escape")]);

        let error = prepare_import_source_path(&archive)
            .err()
            .expect("unsafe archive accepted");
        assert!(error.contains("unsafe import archive path"));
        assert!(!dir.path().join("escape.md").exists());
    }

    #[test]
    fn refuses_cleanup_outside_owned_import_temp_directories() {
        let dir = tempdir().expect("tempdir");
        let error = remove_import_temp_dir(dir.path()).expect_err("removed arbitrary directory");
        assert!(error.contains("refused"));
        assert!(dir.path().exists());
    }
}
