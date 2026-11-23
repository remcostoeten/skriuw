#[cfg(debug_assertions)]
use std::env;

use tauri_plugin_dialog::DialogExt;

// Native GTK pickers cannot be driven by WebDriver automation, so debug
// builds honor SKRIUW_E2E_PICK_PATHS (newline-separated absolute paths)
// instead of opening a dialog. Release builds compile the override out.
#[cfg(debug_assertions)]
fn picker_override() -> Option<Vec<String>> {
    let raw = env::var("SKRIUW_E2E_PICK_PATHS").ok()?;
    let paths = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<String>>();
    if paths.is_empty() { None } else { Some(paths) }
}

#[tauri::command]
pub async fn pick_directory(
    app: tauri::AppHandle,
    title: String,
) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    if let Some(paths) = picker_override() {
        return Ok(paths.into_iter().next());
    }
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(&title)
            .blocking_pick_folder()
            .map(|path| {
                path.into_path()
                    .map(|resolved| resolved.display().to_string())
                    .map_err(|error| error.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn pick_import_file(
    app: tauri::AppHandle,
    title: String,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    if let Some(paths) = picker_override() {
        return Ok(paths.into_iter().next());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title(&title);
        if let Some(extensions) = extensions.as_ref().filter(|list| !list.is_empty()) {
            let refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter("Markdown", &refs);
        }
        dialog
            .blocking_pick_file()
            .map(|path| {
                path.into_path()
                    .map(|resolved| resolved.display().to_string())
                    .map_err(|error| error.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn pick_import_files(
    app: tauri::AppHandle,
    title: String,
) -> Result<Vec<String>, String> {
    #[cfg(debug_assertions)]
    if let Some(paths) = picker_override() {
        return Ok(paths);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title(&title)
            .blocking_pick_files()
            .unwrap_or_default();
        picked
            .into_iter()
            .map(|path| {
                path.into_path()
                    .map(|resolved| resolved.display().to_string())
                    .map_err(|error| error.to_string())
            })
            .collect::<Result<Vec<String>, String>>()
    })
    .await
    .map_err(|error| error.to_string())?
}

const MAX_SAVED_TEXT_FILE_BYTES: usize = 64 * 1024 * 1024;

#[tauri::command]
pub async fn save_text_file(
    app: tauri::AppHandle,
    title: String,
    file_name: String,
    extension: String,
    contents: String,
) -> Result<Option<String>, String> {
    if contents.len() > MAX_SAVED_TEXT_FILE_BYTES {
        return Err("The file is larger than 64 MB.".into());
    }
    if extension.is_empty() || !extension.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("The file extension is invalid.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(debug_assertions)]
        let picked = match picker_override() {
            Some(paths) => paths.into_iter().next().map(std::path::PathBuf::from),
            None => pick_save_path(&app, &title, &file_name, &extension)?,
        };
        #[cfg(not(debug_assertions))]
        let picked = pick_save_path(&app, &title, &file_name, &extension)?;
        let Some(path) = picked else {
            return Ok(None);
        };
        std::fs::write(&path, contents).map_err(|error| error.to_string())?;
        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn pick_save_path(
    app: &tauri::AppHandle,
    title: &str,
    file_name: &str,
    extension: &str,
) -> Result<Option<std::path::PathBuf>, String> {
    app.dialog()
        .file()
        .set_title(title)
        .set_file_name(file_name)
        .add_filter(extension, &[extension])
        .blocking_save_file()
        .map(|path| path.into_path().map_err(|error| error.to_string()))
        .transpose()
}
