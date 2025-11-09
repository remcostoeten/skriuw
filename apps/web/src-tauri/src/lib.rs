#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![update_recent_notes_menu])
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Tauri command to update the recent notes menu
#[tauri::command]
fn update_recent_notes_menu(_window: tauri::Window, _notes: Vec<(String, String)>) -> Result<(), String> {
    // TODO: Implement menu functionality when Tauri 2.0 menu API is properly understood
    // For now, just return success to avoid breaking the frontend
    Ok(())
}