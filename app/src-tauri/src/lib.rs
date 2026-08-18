mod ai;
mod ai_credentials;
mod ai_history;
mod auth;
mod commands;
mod maintenance;
mod ollama;
mod remote_media;
#[cfg(test)]
mod smoke_tests;
mod state;
mod sync;

use std::{sync::Arc, time::Duration};

use maintenance::{MaintenanceCoordinator, spawn_backup_rotation};
use skriuw_ai_ollama::OllamaRuntime;
use skriuw_domain::HistoryHeader;
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_images::ImageStore;
use state::{AppState, database_path, history_repository_path, image_blob_path, now_millis};
use tauri::{Emitter, Manager, RunEvent};

const ROTATION_RETRY_DELAY: Duration = Duration::from_secs(60);
/// The main window ships hidden and is revealed by the renderer after its
/// first paint. A renderer that never boots would otherwise leave an
/// invisible process, so the window is revealed unconditionally after this
/// delay. Worst case the user sees the empty shell the reveal exists to hide.
const WINDOW_REVEAL_FAILSAFE: Duration = Duration::from_secs(2);
const HISTORY_HEADER_PUBLISHED_EVENT: &str = "history-header-published";
const SYNC_WORKSPACE_CHANGED_EVENT: &str = "sync-workspace-changed";
/// Excludes StateFlags::VISIBLE: the main window ships hidden and is revealed
/// by the renderer/failsafe above, so the plugin must never show it early.
const WINDOW_STATE_FLAGS: tauri_plugin_window_state::StateFlags =
    tauri_plugin_window_state::StateFlags::SIZE
        .union(tauri_plugin_window_state::StateFlags::POSITION)
        .union(tauri_plugin_window_state::StateFlags::MAXIMIZED);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(WINDOW_STATE_FLAGS)
                .build(),
        )
        .setup(|app| {
            let path = database_path(app.handle())?;
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let ollama_runtime = Arc::new(OllamaRuntime::with_endpoint_override(
                app_data_dir.join("ollama"),
                std::env::var("SKRIUW_OLLAMA_ENDPOINT").ok().as_deref(),
            )?);
            let ollama = Arc::new(ollama::OllamaManager::new(Arc::clone(&ollama_runtime)));
            let ai_credentials = Arc::new(ai_credentials::AiCredentialStore::new(&app_data_dir));
            let repository_path = history_repository_path(&path);
            let history_reader = Arc::new(
                GitHistoryMaterializer::open(&repository_path)
                    .map_err(|error| format!("open {}: {error}", repository_path.display()))?,
            );
            let maintenance = Arc::new(MaintenanceCoordinator::start(
                path.clone(),
                repository_path,
                now_millis,
                {
                    let app_handle = app.handle().clone();
                    Arc::new(move |header: HistoryHeader| {
                        if let Err(error) = app_handle.emit(HISTORY_HEADER_PUBLISHED_EVENT, header)
                        {
                            eprintln!("history header publication failed: {error}");
                        }
                    })
                },
            )?);
            let rotation = spawn_backup_rotation(Arc::clone(&maintenance), ROTATION_RETRY_DELAY)?;
            let image_store = Arc::new(
                ImageStore::open(image_blob_path(&path)).map_err(|error| error.to_string())?,
            );
            // The blobs directory is only known at runtime (SKRIUW_DB override,
            // storage pointer), so the asset-protocol scope is extended here
            // instead of in the static config.
            if let Err(error) = app
                .asset_protocol_scope()
                .allow_directory(image_store.root(), false)
            {
                eprintln!("asset scope extension failed: {error}");
            }
            let reveal_handle = app.handle().clone();
            let _ = std::thread::Builder::new()
                .name("skriuw-window-reveal-failsafe".into())
                .spawn(move || {
                    std::thread::sleep(WINDOW_REVEAL_FAILSAFE);
                    let Some(window) = reveal_handle.get_webview_window("main") else {
                        return;
                    };
                    if window.is_visible().unwrap_or(false) {
                        return;
                    }
                    eprintln!("renderer did not reveal the main window; revealing it directly");
                    if let Err(error) = window.show() {
                        eprintln!("window reveal failsafe failed: {error}");
                    }
                });
            let sync = Arc::new(sync::SyncRuntime::with_workspace_observer(path.clone(), {
                let app_handle = app.handle().clone();
                Arc::new(move || {
                    if let Err(error) = app_handle.emit(SYNC_WORKSPACE_CHANGED_EVENT, ()) {
                        eprintln!("sync workspace publication failed: {error}");
                    }
                })
            }));
            app.manage(AppState {
                ai: ai::LazyAiCompletion::new(
                    ollama_runtime,
                    Arc::clone(&ai_credentials),
                    Arc::new(ai_history::AiHistoryRecorder::new(&path, now_millis)),
                ),
                ai_credentials,
                ollama,
                maintenance,
                rotation,
                storage_path: path.clone(),
                history_reader,
                image_store,
                sync: Arc::clone(&sync),
            });
            let _ = std::thread::Builder::new()
                .name("skriuw-sync-resume".into())
                .spawn(move || match auth::load_auth_token_blocking() {
                    Ok(Some(token)) => {
                        if let Err(error) = sync.connect(token) {
                            eprintln!("background sync resume failed: {error}");
                        }
                    }
                    Ok(None) => {}
                    Err(error) => eprintln!("cloud session credential load failed: {error}"),
                });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::start_ai_completion,
            commands::ai::cancel_ai_completion,
            commands::ai::ollama_runtime_status,
            commands::ai::start_ollama_runtime,
            commands::ai::stop_ollama_runtime,
            commands::ai::install_ollama_runtime,
            commands::ai::list_ollama_models,
            commands::ai::pull_ollama_model,
            commands::ai::cancel_ollama_operation,
            commands::ai::delete_ollama_model,
            commands::ai::remote_ai_providers,
            commands::ai::credential_vault_state,
            commands::ai::remote_ai_catalogue,
            commands::ai::save_remote_ai_key,
            commands::ai::remove_remote_ai_key,
            commands::ai::accept_remote_ai_disclosure,
            commands::ai::revoke_remote_ai_provider,
            commands::ai::verify_remote_ai_key,
            commands::ai::ai_run_history,
            commands::ai::ai_history_settings,
            commands::ai::set_ai_history_settings,
            commands::ai::clear_ai_run_history,
            auth::load_auth_token,
            auth::store_auth_token,
            auth::clear_auth_token,
            commands::workspace::bootstrap_workspace,
            commands::workspace::load_sidebar_expansion,
            commands::workspace::save_sidebar_expansion,
            commands::workspace::load_pane_layout,
            commands::workspace::save_pane_layout,
            commands::workspace::apply_workspace_operations,
            commands::workspace::close_workspace_window,
            commands::workspace::search_workspace,
            commands::history::read_history_version,
            commands::maintenance::export_workspace_archive,
            commands::maintenance::import_workspace_archive,
            commands::maintenance::create_workspace_backup,
            commands::maintenance::list_workspace_recovery,
            commands::maintenance::restore_workspace_backup,
            commands::maintenance::cancel_workspace_maintenance,
            commands::maintenance::workspace_maintenance_status,
            commands::maintenance::workspace_storage_path,
            commands::maintenance::reveal_workspace_storage,
            commands::maintenance::reveal_workspace_images,
            commands::maintenance::relocate_workspace_storage,
            commands::maintenance::clear_all_data,
            commands::transfer::export_markdown_tree,
            commands::transfer::read_markdown_tree,
            commands::transfer::prepare_import_source,
            commands::transfer::prepare_import_sources,
            commands::transfer::cleanup_import_source,
            commands::pickers::pick_directory,
            commands::pickers::pick_import_file,
            commands::pickers::pick_import_files,
            commands::media::store_note_image,
            commands::media::note_media_path,
            commands::media::read_note_image_blob,
            commands::media::import_markdown_image,
            commands::media::download_remote_media,
            commands::media::list_media_blobs,
            commands::media::delete_media_blob,
            commands::media::sweep_unused_media_blobs,
            commands::sync::workspace_sync_status,
            commands::sync::connect_workspace_sync,
            commands::sync::disconnect_workspace_sync,
            commands::sync::retry_workspace_sync,
            commands::sync::refresh_workspace_sync,
            commands::sync::list_blocked_sync_operations,
            commands::sync::retry_blocked_sync_operation,
            commands::sync::discard_blocked_sync_operation
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(true) = event
                && let Some(state) = window.app_handle().try_state::<AppState>()
            {
                state.sync.notify_focus();
            }
        })
        .build(tauri::generate_context!())
        .expect("skriuw app must build")
        .run(|app, event| {
            if let RunEvent::Exit = event
                && let Some(state) = app.try_state::<AppState>()
            {
                state.ai.shutdown();
                state.ollama.shutdown();
                state.sync.shutdown();
                state.rotation.shutdown();
                state.maintenance.shutdown();
            }
        });
}
