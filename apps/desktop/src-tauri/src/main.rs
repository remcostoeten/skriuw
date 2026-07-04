#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK's dmabuf renderer cannot allocate GBM buffers on X11 with
        // the NVIDIA proprietary driver ("Failed to create GBM buffer:
        // Invalid argument" -> black window), so X11 must fall back to the
        // slower shared-memory path. On Wayland the dmabuf renderer works,
        // but NVIDIA's explicit-sync EGL path crashes GTK with Wayland
        // protocol Error 71, hence __NV_DISABLE_EXPLICIT_SYNC. Explicit env
        // overrides always win.
        let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
        if wayland {
            if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
                std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
            }
        } else if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    skriuw_desktop_lib::run();
}
