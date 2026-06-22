use serde::Serialize;

#[derive(Serialize)]
pub struct AppInfo {
	pub app: String,
	pub shell: String,
	pub status: String,
	pub version: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
	let who = if name.trim().is_empty() { "world" } else { name };
	format!("Hello, {who} — the Skriuw desktop shell is alive.")
}

#[tauri::command]
fn app_info() -> AppInfo {
	AppInfo {
		app: "skriuw-desktop".to_string(),
		shell: "tauri".to_string(),
		status: "scaffold".to_string(),
		version: env!("CARGO_PKG_VERSION").to_string(),
	}
}

pub fn run() {
	tauri::Builder::default()
		.invoke_handler(tauri::generate_handler![greet, app_info])
		.run(tauri::generate_context!())
		.expect("error while running the Skriuw desktop shell");
}
