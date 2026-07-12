#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Wayland compositors pick the taskbar icon by matching the window
        // app_id against a desktop-entry file name. GDK derives the app_id
        // from the prgname (the binary, "skriuw"), but the bundle ships
        // "Skriuw.desktop", so KWin/GNOME fall back to a generic icon.
        // Aligning the prgname before GTK initializes fixes the match;
        // StartupWMClass keeps X11 covered either way.
        glib::set_prgname(Some("Skriuw"));

        // NVIDIA's explicit-sync EGL path crashes GTK with Wayland protocol
        // Error 71. Explicit env overrides always win.
        if std::env::var_os("WAYLAND_DISPLAY").is_some()
            && std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none()
        {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
    }

    skriuw_desktop_lib::run();
}
