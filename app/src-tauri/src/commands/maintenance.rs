use crate::maintenance::{
    ArchiveImportReport, BackupRotationReport, DatabaseSwapReport, RecoveryInventoryReport,
};
use crate::state::{AppState, now_millis, run_maintenance, storage_pointer_file};
use serde::Serialize;
use std::{env, fs, io::ErrorKind, path::Path, sync::Arc};
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveExportPayload {
    nodes: usize,
    documents: usize,
    images: usize,
    exported_at: i64,
    file_name: String,
}

#[tauri::command]
pub async fn export_workspace_archive(
    state: State<'_, AppState>,
) -> Result<ArchiveExportPayload, String> {
    let exports_directory = state
        .storage_path
        .parent()
        .unwrap_or(Path::new("."))
        .join("exports");
    fs::create_dir_all(&exports_directory)
        .map_err(|_| "export directory could not be created".to_string())?;
    let file_name = format!("skriuw-archive-{}.json", now_millis());
    let target = exports_directory.join(&file_name);
    let coordinator = Arc::clone(&state.maintenance);
    let report = run_maintenance(coordinator, move |maintenance| {
        maintenance.export_archive(&target)
    })
    .await?;
    Ok(ArchiveExportPayload {
        nodes: report.nodes,
        documents: report.documents,
        images: report.images,
        exported_at: report.exported_at,
        file_name,
    })
}

#[tauri::command]
pub async fn import_workspace_archive(
    archive_path: String,
    state: State<'_, AppState>,
) -> Result<ArchiveImportReport, String> {
    state.sync.shutdown();
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.import_archive(Path::new(&archive_path))
    })
    .await
}

#[tauri::command]
pub async fn create_workspace_backup(
    force: bool,
    state: State<'_, AppState>,
) -> Result<BackupRotationReport, String> {
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.rotate_backups(force)
    })
    .await
}

#[tauri::command]
pub async fn list_workspace_recovery(
    state: State<'_, AppState>,
) -> Result<RecoveryInventoryReport, String> {
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.recovery_inventory()
    })
    .await
}

#[tauri::command]
pub async fn restore_workspace_backup(
    artifact_file_name: String,
    state: State<'_, AppState>,
) -> Result<DatabaseSwapReport, String> {
    state.sync.shutdown();
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.restore_backup(&artifact_file_name)
    })
    .await
}

#[tauri::command]
pub fn cancel_workspace_maintenance(state: State<'_, AppState>) -> bool {
    state.maintenance.cancel_active_operation()
}

#[tauri::command]
pub fn workspace_maintenance_status(state: State<'_, AppState>) -> Option<&'static str> {
    state.maintenance.status()
}

#[tauri::command]
pub fn workspace_storage_path(state: State<'_, AppState>) -> String {
    state.storage_path.display().to_string()
}

fn open_in_file_manager(target: &Path) -> Result<(), String> {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(opener)
        .arg(target)
        .spawn()
        .map_err(|error| format!("open {}: {error}", target.display()))?;
    Ok(())
}

#[tauri::command]
pub fn reveal_workspace_storage(state: State<'_, AppState>) -> Result<(), String> {
    open_in_file_manager(state.storage_path.parent().unwrap_or(&state.storage_path))
}

#[tauri::command]
pub fn reveal_workspace_images(state: State<'_, AppState>) -> Result<(), String> {
    fs::create_dir_all(state.image_store.root()).map_err(|error| error.to_string())?;
    open_in_file_manager(state.image_store.root())
}

#[tauri::command]
pub async fn relocate_workspace_storage(
    target_dir: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if env::var_os("SKRIUW_DB").is_some() {
        return Err("storage location is fixed by SKRIUW_DB".into());
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let pointer = storage_pointer_file(&data_dir);
    state.sync.shutdown();
    let coordinator = Arc::clone(&state.maintenance);
    let target = target_dir.clone();
    run_maintenance(coordinator, move |maintenance| {
        maintenance.relocate_to(Path::new(&target), || {
            fs::write(&pointer, format!("{target}\n")).map_err(|error| error.to_string())
        })
    })
    .await?;
    app.restart()
}

#[tauri::command]
pub async fn clear_all_data(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::auth::clear_auth_token_blocking)
        .await
        .map_err(|error| error.to_string())??;
    state.rotation.shutdown();
    state.sync.shutdown();
    let coordinator = Arc::clone(&state.maintenance);
    let storage_path = state.storage_path.clone();
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        coordinator.shutdown();
        remove_workspace_data(&storage_path)?;
        remove_owned_path(&storage_pointer_file(&data_dir))
    })
    .await
    .map_err(|error| error.to_string())??;
    app.restart()
}

fn remove_workspace_data(database_path: &Path) -> Result<(), String> {
    let directory = database_path.parent().unwrap_or(Path::new("."));
    let database_name = database_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "workspace database has no valid file name".to_string())?;
    for suffix in ["", "-wal", "-shm", "-journal"] {
        remove_owned_path(&directory.join(format!("{database_name}{suffix}")))?;
    }
    for name in ["blobs", "history", "recovery", "exports"] {
        remove_owned_path(&directory.join(name))?;
    }
    let owned_prefixes = [
        format!("{database_name}.pre-import-"),
        format!("{database_name}.rollback-"),
        format!("{database_name}.restore-candidate-"),
    ];
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("read {}: {error}", directory.display())),
    };
    for entry in entries {
        let entry = entry.map_err(|error| format!("read {}: {error}", directory.display()))?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if owned_prefixes.iter().any(|prefix| name.starts_with(prefix)) {
            remove_owned_path(&entry.path())?;
        }
    }
    Ok(())
}

fn remove_owned_path(path: &Path) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("inspect {}: {error}", path.display())),
    };
    let result = if metadata.file_type().is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    result.map_err(|error| format!("delete {}: {error}", path.display()))
}

#[cfg(test)]
mod clear_data_tests {
    use super::remove_workspace_data;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn removes_only_workspace_owned_files_from_shared_storage_directory() {
        let directory = tempdir().expect("tempdir");
        let database = directory.path().join("skriuw.db");
        for name in [
            "skriuw.db",
            "skriuw.db-wal",
            "skriuw.db-shm",
            "skriuw.db-journal",
            "skriuw.db.pre-import-42.sqlite",
            "skriuw.db.rollback-43",
            "skriuw.db.restore-candidate-44",
        ] {
            fs::write(directory.path().join(name), b"owned").expect("write owned file");
        }
        for name in ["blobs", "history", "recovery", "exports"] {
            let child = directory.path().join(name);
            fs::create_dir(&child).expect("create owned directory");
            fs::write(child.join("stored-file"), b"owned").expect("write stored file");
        }
        fs::write(directory.path().join("my-notes.md"), b"keep").expect("write user file");

        remove_workspace_data(&database).expect("clear workspace data");

        assert!(directory.path().join("my-notes.md").exists());
        assert_eq!(
            fs::read_dir(directory.path())
                .expect("read directory")
                .count(),
            1
        );
    }
}
