use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";
pub const SPLASH_LABEL: &str = "splash";
pub fn splash_preview_enabled() -> bool {
    cfg!(debug_assertions)
        && std::env::var_os("SKRIUW_SPLASH_PREVIEW").is_some_and(|value| value == "1")
}
/// The main window ships hidden and is revealed by the renderer after its
/// first paint. A renderer that never boots would otherwise leave an
/// invisible process, so the window is revealed unconditionally after this
/// delay. Worst case the user sees the empty shell the reveal exists to hide.
const WINDOW_REVEAL_FAILSAFE: Duration = Duration::from_secs(2);

/// Opens the frameless splash shown while the main webview boots. It is a
/// static page with no IPC, so it paints well before the application bundle.
pub fn open_splash_window(app: &AppHandle) {
    let page = if splash_preview_enabled() {
        "splash.html?preview=1"
    } else {
        "splash.html"
    };
    let built = WebviewWindowBuilder::new(app, SPLASH_LABEL, WebviewUrl::App(page.into()))
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
    fit_to_monitor(&window);
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    if let Some(splash) = app.get_webview_window(SPLASH_LABEL) {
        splash.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Pulls a restored window back inside the monitor's work area. The window
/// state plugin restores whatever size was saved, and a size recorded under a
/// different scale factor or monitor can leave most of the shell off screen.
fn fit_to_monitor(window: &tauri::WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size), Ok(position)) =
        (monitor, window.outer_size(), window.outer_position())
    else {
        return;
    };
    let area = monitor.work_area();
    let fitted = fit_rect(
        (position.x, position.y, size.width, size.height),
        (
            area.position.x,
            area.position.y,
            area.size.width,
            area.size.height,
        ),
    );
    if fitted == (position.x, position.y, size.width, size.height) {
        return;
    }
    let (x, y, width, height) = fitted;
    if let Err(error) = window.set_size(tauri::PhysicalSize::new(width, height)) {
        eprintln!("main window could not be resized to the monitor: {error}");
    }
    if let Err(error) = window.set_position(tauri::PhysicalPosition::new(x, y)) {
        eprintln!("main window could not be moved onto the monitor: {error}");
    }
}

fn fit_rect(window: (i32, i32, u32, u32), area: (i32, i32, u32, u32)) -> (i32, i32, u32, u32) {
    let (x, y, width, height) = window;
    let (area_x, area_y, area_width, area_height) = area;
    let width = width.min(area_width);
    let height = height.min(area_height);
    let max_x = area_x + (area_width - width) as i32;
    let max_y = area_y + (area_height - height) as i32;
    (
        x.clamp(area_x, max_x),
        y.clamp(area_y, max_y),
        width,
        height,
    )
}

pub fn spawn_reveal_failsafe(app: &AppHandle) {
    if splash_preview_enabled() {
        return;
    }
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
    if splash_preview_enabled() {
        return Ok(());
    }
    reveal_main_window(&app)
}

#[cfg(test)]
mod tests {
    use super::fit_rect;

    const AREA: (i32, i32, u32, u32) = (0, 0, 3840, 2160);

    #[test]
    fn keeps_a_window_that_already_fits() {
        assert_eq!(fit_rect((100, 50, 1200, 800), AREA), (100, 50, 1200, 800));
    }

    #[test]
    fn shrinks_an_oversized_window_to_the_work_area() {
        assert_eq!(fit_rect((0, 32, 10240, 5760), AREA), (0, 0, 3840, 2160));
    }

    #[test]
    fn moves_an_off_screen_window_back_inside() {
        assert_eq!(
            fit_rect((5000, -400, 1200, 800), AREA),
            (2640, 0, 1200, 800)
        );
    }

    #[test]
    fn respects_a_work_area_offset_by_a_panel() {
        assert_eq!(
            fit_rect((0, 0, 1200, 800), (0, 32, 3840, 2128)),
            (0, 32, 1200, 800)
        );
    }
}
