#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK's dmabuf renderer cannot allocate GBM buffers with the
        // NVIDIA proprietary driver on either X11 or Wayland ("Failed to
        // create GBM buffer: Invalid argument" -> black window), so it must
        // fall back to the slower shared-memory path everywhere. On Wayland,
        // NVIDIA's explicit-sync EGL path additionally crashes GTK with
        // Wayland protocol Error 71, hence __NV_DISABLE_EXPLICIT_SYNC.
        // Explicit env overrides always win.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("WAYLAND_DISPLAY").is_some()
            && std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none()
        {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
    }

    skriuw_desktop_lib::run();
}
