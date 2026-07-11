#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
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
