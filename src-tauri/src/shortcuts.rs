use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_store::StoreExt;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShortcutConfig {
    pub id: String,
    pub key: String,
    pub action: String,
    pub enabled: bool,
}

const SHORTCUTS_KEY: &str = "shortcuts";

#[tauri::command]
pub fn get_shortcuts<R: Runtime>(app: AppHandle<R>) -> Result<Vec<ShortcutConfig>, String> {
    let store = app.store("shortcuts.json")
        .map_err(|e| e.to_string())?;
    
    let shortcuts: Vec<ShortcutConfig> = store
        .get(SHORTCUTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    
    Ok(shortcuts)
}

#[tauri::command]
pub fn create_shortcut<R: Runtime>(
    app: AppHandle<R>,
    config: ShortcutConfig
) -> Result<(), String> {
    let store = app.store("shortcuts.json")
        .map_err(|e| e.to_string())?;
    
    let mut shortcuts = get_shortcuts(app.clone())?;
    shortcuts.push(config.clone());
    
    store.set(SHORTCUTS_KEY, serde_json::to_value(&shortcuts)
        .map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    
    if config.enabled {
        register_shortcut(app, config)?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn update_shortcut<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    config: ShortcutConfig
) -> Result<(), String> {
    let store = app.store("shortcuts.json")
        .map_err(|e| e.to_string())?;
    
    let mut shortcuts = get_shortcuts(app.clone())?;
    
    if let Some(idx) = shortcuts.iter().position(|s| s.id == id) {
        if shortcuts[idx].key != config.key {
            let old_shortcut: Shortcut = shortcuts[idx].key.parse()
                .map_err(|_| "Invalid shortcut")?;
            app.global_shortcut().unregister(old_shortcut)
                .map_err(|e| e.to_string())?;
        }
        
        shortcuts[idx] = config.clone();
        
        store.set(SHORTCUTS_KEY, serde_json::to_value(&shortcuts)
            .map_err(|e| e.to_string())?);
        store.save().map_err(|e| e.to_string())?;
        
        if config.enabled {
            register_shortcut(app, config)?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn delete_shortcut<R: Runtime>(
    app: AppHandle<R>,
    id: String
) -> Result<(), String> {
    let store = app.store("shortcuts.json")
        .map_err(|e| e.to_string())?;
    
    let mut shortcuts = get_shortcuts(app.clone())?;
    
    if let Some(idx) = shortcuts.iter().position(|s| s.id == id) {
        let shortcut: Shortcut = shortcuts[idx].key.parse()
            .map_err(|_| "Invalid shortcut")?;
        app.global_shortcut().unregister(shortcut)
            .map_err(|e| e.to_string())?;
        
        shortcuts.remove(idx);
        
        store.set(SHORTCUTS_KEY, serde_json::to_value(&shortcuts)
            .map_err(|e| e.to_string())?);
        store.save().map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

fn register_shortcut<R: Runtime>(
    app: AppHandle<R>,
    config: ShortcutConfig
) -> Result<(), String> {
    let shortcut: Shortcut = config.key.parse()
        .map_err(|_| "Invalid shortcut")?;
    
    let action = config.action.clone();
    
    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, _event| {
        app.emit("shortcut-triggered", action.clone()).ok();
    }).map_err(|e| e.to_string())?;
    
    Ok(())
}

pub fn init_shortcuts<R: Runtime>(app: &tauri::App<R>) {
    let shortcuts = get_shortcuts(app.handle().clone()).unwrap_or_default();
    
    for config in shortcuts {
        if config.enabled {
            register_shortcut(app.handle().clone(), config).ok();
        }
    }
}
