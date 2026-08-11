use crate::maintenance::{
    ArchiveImportReport, BackupRotationReport, DatabaseSwapReport, RecoveryInventoryReport,
};
use crate::state::{AppState, now_millis, run_maintenance, storage_pointer_file};
use serde::Serialize;
use std::{env, fs, path::Path, sync::Arc};
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
