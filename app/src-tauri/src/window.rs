use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";
pub const SPLASH_LABEL: &str = "splash";
/// The main window ships hidden and is revealed by the renderer after its
/// first paint. A renderer that never boots would otherwise leave an
/// invisible process, so the window is revealed unconditionally after this
/// delay. Worst case the user sees the empty shell the reveal exists to hide.
const WINDOW_REVEAL_FAILSAFE: Duration = Duration::from_secs(2);

/// Opens the frameless splash shown while the main webview boots. It is a
/// static page with no IPC, so it paints well before the application bundle.
pub fn open_splash_window(app: &AppHandle) {
    let built = WebviewWindowBuilder::new(app, SPLASH_LABEL, WebviewUrl::App("splash.html".into()))
        .title("Skriuw")
        .inner_size(320.0, 200.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .center()
        .build();
    if let Err(error) = built {
        eprintln!("splash window could not be opened: {error}");
    }
}

/// Shows and focuses the main window, then closes the splash. Ordered this way
/// so there is never a moment with no window on screen.
pub fn reveal_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_LABEL)
        .ok_or_else(|| "main window is not open".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    if let Some(splash) = app.get_webview_window(SPLASH_LABEL) {
        splash.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn spawn_reveal_failsafe(app: &AppHandle) {
    let handle = app.clone();
    let _ = std::thread::Builder::new()
        .name("skriuw-window-reveal-failsafe".into())
        .spawn(move || {
            std::thread::sleep(WINDOW_REVEAL_FAILSAFE);
            let Some(window) = handle.get_webview_window(MAIN_LABEL) else {
                return;
            };
            if window.is_visible().unwrap_or(false) {
                return;
            }
            eprintln!("renderer did not reveal the main window; revealing it directly");
            if let Err(error) = reveal_main_window(&handle) {
                eprintln!("window reveal failsafe failed: {error}");
            }
        });
}

#[tauri::command]
pub fn reveal_main_window_command(app: AppHandle) -> Result<(), String> {
    reveal_main_window(&app)
}
