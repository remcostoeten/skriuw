#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK on some Wayland/GBM stacks fails to allocate dmabuf-backed
        // render buffers, so we disable the dmabuf renderer there. On X11
        // (notably X11 + NVIDIA proprietary driver) disabling it instead causes
        // a multi-second-to-indefinite first-paint stall that leaves the window
        // stuck on the splash, so we must leave dmabuf enabled there.
        //
        // That stall was only ever reproduced in the packaged (release) build,
        // so in dev we additionally disable dmabuf everywhere to silence the
        // harmless "Failed to create GBM buffer" fallback noise.
        let should_disable_dmabuf = cfg!(debug_assertions) || is_wayland_session();
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() && should_disable_dmabuf {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    skriuw_desktop_lib::run();
}

#[cfg(target_os = "linux")]
fn is_wayland_session() -> bool {
    if let Some(backend) = std::env::var_os("GDK_BACKEND") {
        let backend = backend.to_string_lossy().to_lowercase();
        if backend.contains("x11") {
            return false;
        }
        if backend.contains("wayland") {
            return true;
        }
    }

    std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE")
            .map(|t| t.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
}
