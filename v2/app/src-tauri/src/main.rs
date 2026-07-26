#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn has_nvidia_driver() -> bool {
    std::path::Path::new("/proc/driver/nvidia/version").exists()
}

#[cfg(target_os = "linux")]
fn in_wayland_session() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
}

/// Whether GTK will end up on the X11 backend, mirroring GDK's own selection:
/// entries in GDK_BACKEND are tried left to right and the first one whose
/// display is reachable wins; an unset value means "Wayland if there is a
/// Wayland session, else X11".
#[cfg(target_os = "linux")]
fn will_use_x11_backend() -> bool {
    let has_x11_display = std::env::var_os("DISPLAY").is_some();

    match std::env::var("GDK_BACKEND") {
        Ok(list) if !list.is_empty() => {
            let selected = list
                .split(',')
                .map(str::trim)
                .find(|backend| match *backend {
                    "wayland" => in_wayland_session(),
                    "x11" => has_x11_display,
                    _ => false,
                });
            selected == Some("x11")
        }
        _ => !in_wayland_session() && has_x11_display,
    }
}

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

        let nvidia = has_nvidia_driver();

        // SAFETY: single-threaded, before GTK/webkit init reads any of these.
        unsafe {
            if let Some(backend) = std::env::var_os("SKRIUW_GDK_BACKEND") {
                std::env::set_var("GDK_BACKEND", backend);
            } else if nvidia
                && in_wayland_session()
                && std::env::var_os("APPIMAGE").is_some()
                && std::env::var("GDK_BACKEND").as_deref() == Ok("x11")
            {
                // linuxdeploy's GTK hook hard-codes GDK_BACKEND=x11 into the
                // AppImage's AppRun (tauri-apps/tauri#8541), which drags us
                // through XWayland. WebKit's dmabuf renderer cannot allocate
                // GBM buffers there on NVIDIA, so the window paints black. The
                // .deb and dev builds already run the Wayland backend natively
                // on this stack; match them. SKRIUW_GDK_BACKEND opts back out.
                std::env::set_var("GDK_BACKEND", "wayland");
            }

            // Same GBM allocation failure ("Failed to create GBM buffer:
            // Invalid argument" -> black window) hits any genuine X11 session
            // on NVIDIA. The shared-memory path is slower but is the only one
            // that renders there; Wayland/NVIDIA and every Mesa driver keep
            // the GPU path.
            if nvidia
                && will_use_x11_backend()
                && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
            {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            }

            // NVIDIA's explicit-sync EGL path crashes GTK with Wayland
            // protocol Error 71. Explicit env overrides always win.
            if in_wayland_session() && std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
                std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
            }
        }
    }

    skriuw_app::run();
}
