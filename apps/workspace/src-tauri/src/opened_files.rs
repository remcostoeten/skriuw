use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Emitter, Manager};

pub const OPENED_FILES_EVENT: &str = "opened-files";
/// Every extension Skriuw opens from the file manager. The renderer maps each
/// one to a format in `file-formats.ts`, and `tauri.conf.json` registers the
/// same list as file associations; tests keep all three in step.
pub const OPENABLE_EXTENSIONS: [&str; 4] = ["md", "markdown", "mdx", "txt"];

/// Files the operating system asked Skriuw to open, held until the renderer
/// drains them. A launch by double-click delivers its paths before any webview
/// can listen, so the renderer pulls instead of relying on the event alone.
#[derive(Default)]
pub struct OpenedFiles(Mutex<Vec<String>>);

impl OpenedFiles {
    fn push(&self, paths: Vec<String>) {
        let mut queue = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for path in paths {
            if !queue.contains(&path) {
                queue.push(path);
            }
        }
    }

    fn take(&self) -> Vec<String> {
        let mut queue = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::mem::take(&mut *queue)
    }
}

fn is_openable(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            OPENABLE_EXTENSIONS
                .iter()
                .any(|openable| extension.eq_ignore_ascii_case(openable))
        })
}

fn path_from_argument(argument: &str, cwd: &Path) -> Option<PathBuf> {
    if argument.starts_with('-') {
        return None;
    }
    let path = match argument.strip_prefix("file://") {
        Some(_) => tauri::Url::parse(argument).ok()?.to_file_path().ok()?,
        None => PathBuf::from(argument),
    };
    Some(if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    })
}

/// Keeps the openable files among a process's arguments, skipping the binary
/// itself, flags, and anything that is not an existing file with an
/// extension in `OPENABLE_EXTENSIONS`.
pub fn openable_paths_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter_map(|argument| path_from_argument(argument, cwd))
        .filter(|path| is_openable(path) && path.is_file())
        .map(|path| path.display().to_string())
        .collect()
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
pub fn openable_paths_from_urls(urls: &[tauri::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter(|path| is_openable(path) && path.is_file())
        .map(|path| path.display().to_string())
        .collect()
}

pub fn enqueue(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let Some(opened) = app.try_state::<OpenedFiles>() else {
        return;
    };
    opened.push(paths);
    if let Err(error) = app.emit(OPENED_FILES_EVENT, ()) {
        eprintln!("opened files publication failed: {error}");
    }
}

#[tauri::command]
pub fn take_opened_files(opened: tauri::State<'_, OpenedFiles>) -> Vec<String> {
    opened.take()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn keeps_existing_markdown_files_and_drops_everything_else() {
        let dir = tempdir().expect("tempdir");
        for name in [
            "note.md",
            "doc.MDX",
            "long.markdown",
            "plain.txt",
            "sheet.xlsx",
        ] {
            fs::write(dir.path().join(name), "# hi").expect("write");
        }
        let paths = openable_paths_from_args(
            &args(&[
                "/usr/bin/skriuw",
                "--flag",
                "note.md",
                "doc.MDX",
                "long.markdown",
                "plain.txt",
                "sheet.xlsx",
                "missing.md",
            ]),
            dir.path(),
        );
        assert_eq!(
            paths,
            ["note.md", "doc.MDX", "long.markdown", "plain.txt"].map(|name| dir
                .path()
                .join(name)
                .display()
                .to_string())
        );
    }

    #[test]
    fn resolves_file_urls_and_ignores_the_binary_argument() {
        let dir = tempdir().expect("tempdir");
        let note = dir.path().join("note.md");
        fs::write(&note, "# hi").expect("write");
        let url = tauri::Url::from_file_path(&note).expect("file url");
        let paths = openable_paths_from_args(
            &args(&[note.to_str().expect("utf8"), url.as_str()]),
            Path::new("/"),
        );
        assert_eq!(paths, [note.display().to_string()]);
    }

    #[test]
    fn file_associations_register_every_openable_extension() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        let mut registered: Vec<String> = config["bundle"]["fileAssociations"]
            .as_array()
            .expect("file associations")
            .iter()
            .flat_map(|association| association["ext"].as_array().expect("ext").clone())
            .map(|extension| extension.as_str().expect("extension").to_string())
            .collect();
        registered.sort();
        let mut openable = OPENABLE_EXTENSIONS.map(String::from).to_vec();
        openable.sort();
        assert_eq!(registered, openable);
    }

    #[test]
    fn queue_deduplicates_and_drains() {
        let opened = OpenedFiles::default();
        opened.push(args(&["/a.md", "/b.md"]));
        opened.push(args(&["/a.md"]));
        assert_eq!(opened.take(), args(&["/a.md", "/b.md"]));
        assert!(opened.take().is_empty());
    }
}
