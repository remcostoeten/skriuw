#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK's dmabuf renderer fails to allocate GBM buffers on a range of
        // Linux GPU/driver stacks (seen on both Wayland and X11 + NVIDIA), which
        // leaves the window painted grey because nothing ever composites. The
        // documented workaround is to disable the dmabuf renderer.
        //
        // We previously left it enabled on X11 + NVIDIA to avoid a "first-paint
        // stall" on the splash, but that stall was actually the Better Auth
        // client crashing on the tauri:// origin (fixed in fbbfd6e2), not dmabuf.
        // With that gone, disabling the renderer everywhere is safe and fixes the
        // grey-screen GBM failures. An explicit env override still wins.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    skriuw_desktop_lib::run();
}
