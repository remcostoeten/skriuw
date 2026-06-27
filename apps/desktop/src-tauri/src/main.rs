#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
	#[cfg(target_os = "linux")]
	{
		// WebKitGTK on some Wayland/GBM stacks fails to allocate dmabuf-backed
		// render buffers. Keep the safer software-backed path unless the caller
		// explicitly overrides it.
		if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
			std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
		}
	}

	skriuw_desktop_lib::run();
}
