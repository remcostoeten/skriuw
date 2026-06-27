//! Managed Ollama runtime: download the official binary, extract it under the
//! app's local data dir, and spawn `ollama serve` against a private models
//! directory. Ported from the dora desktop app. The markdown vault stays the
//! source of truth — this only adds an optional local inference engine.

use std::fs::File;
use std::io::copy;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use flate2::read::GzDecoder;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use zip::ZipArchive;

const MARKER_FILE: &str = ".skriuw-managed";
pub const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:11434";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaInstallStatus {
	pub managed: bool,
	pub install_path: Option<String>,
	pub binary_ready: bool,
	pub running: bool,
	pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum OllamaInstallEvent {
	Status { message: String },
	Progress {
		completed: u64,
		total: Option<u64>,
		percent: f32,
	},
	Done {
		version: Option<String>,
		install_path: String,
	},
	Error { message: String },
}

static MANAGED_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

fn child_slot() -> &'static Mutex<Option<Child>> {
	MANAGED_CHILD.get_or_init(|| Mutex::new(None))
}

fn binary_name() -> &'static str {
	if cfg!(target_os = "windows") {
		"ollama.exe"
	} else {
		"ollama"
	}
}

pub fn models_dir(root: &Path) -> PathBuf {
	root.join("models")
}

pub fn managed_install_exists(root: &Path) -> bool {
	root.join(MARKER_FILE).is_file()
}

pub fn managed_binary_path(root: &Path) -> Option<PathBuf> {
	let candidates = [root.join("bin").join(binary_name()), root.join(binary_name())];
	candidates
		.into_iter()
		.find(|path| path.is_file())
		.or_else(|| find_binary_recursive(root, 4))
}

fn lib_dir(root: &Path) -> Option<PathBuf> {
	let nested = root.join("lib").join("ollama");
	if nested.is_dir() {
		return Some(nested);
	}
	let lib = root.join("lib");
	if lib.is_dir() {
		return Some(lib);
	}
	None
}

fn find_binary_recursive(root: &Path, max_depth: u32) -> Option<PathBuf> {
	if max_depth == 0 {
		return None;
	}
	let entries = std::fs::read_dir(root).ok()?;
	for entry in entries.flatten() {
		let path = entry.path();
		if path.is_file() {
			if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
				if name == binary_name() || name == "ollama" {
					return Some(path);
				}
			}
		} else if path.is_dir() {
			if let Some(found) = find_binary_recursive(&path, max_depth - 1) {
				return Some(found);
			}
		}
	}
	None
}

pub async fn probe_server(endpoint: &str) -> Result<String, String> {
	let url = format!("{}/api/version", endpoint.trim_end_matches('/'));
	let client = reqwest::Client::builder()
		.timeout(std::time::Duration::from_secs(3))
		.build()
		.map_err(|error| format!("client build failed: {error}"))?;
	let response = client
		.get(url)
		.send()
		.await
		.map_err(|error| format!("Ollama unreachable: {error}"))?;
	if !response.status().is_success() {
		return Err(format!("Ollama version check failed ({})", response.status()));
	}
	#[derive(Deserialize)]
	struct VersionResponse {
		version: String,
	}
	let parsed: VersionResponse = response
		.json()
		.await
		.map_err(|error| format!("Failed to parse Ollama version: {error}"))?;
	Ok(parsed.version)
}

async fn wait_for_server(endpoint: &str, timeout_secs: u64) -> Result<String, String> {
	let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
	loop {
		if let Ok(version) = probe_server(endpoint).await {
			return Ok(version);
		}
		if std::time::Instant::now() >= deadline {
			return Err("Timed out waiting for Ollama to start".to_string());
		}
		tokio::time::sleep(std::time::Duration::from_millis(500)).await;
	}
}

pub async fn get_install_status(root: &Path, endpoint: &str) -> OllamaInstallStatus {
	let managed = managed_install_exists(root);
	let install_path = managed.then(|| root.to_string_lossy().into_owned());
	let binary_ready = managed_binary_path(root).is_some();
	let (running, version) = match probe_server(endpoint).await {
		Ok(version) => (true, Some(version)),
		Err(_) => (false, None),
	};
	OllamaInstallStatus {
		managed,
		install_path,
		binary_ready,
		running,
		version,
	}
}

pub fn stop_managed_server() {
	if let Ok(mut slot) = child_slot().lock() {
		if let Some(mut child) = slot.take() {
			let _ = child.kill();
			let _ = child.wait();
		}
	}
}

pub async fn start_managed_server(root: &Path, endpoint: &str) -> Result<(), String> {
	if probe_server(endpoint).await.is_ok() {
		return Ok(());
	}
	let binary = managed_binary_path(root)
		.ok_or_else(|| "Managed Ollama binary not found. Install Ollama first.".to_string())?;

	stop_managed_server();

	let models = models_dir(root);
	std::fs::create_dir_all(&models)
		.map_err(|error| format!("Failed to create models directory: {error}"))?;

	let host = endpoint
		.trim_start_matches("http://")
		.trim_start_matches("https://")
		.trim_end_matches('/');

	let mut command = Command::new(&binary);
	command
		.arg("serve")
		.env("OLLAMA_HOST", host)
		.env("OLLAMA_MODELS", &models)
		.stdin(Stdio::null())
		.stdout(Stdio::null())
		.stderr(Stdio::null());
	apply_platform_env(&mut command, root, &binary);

	let child = command
		.spawn()
		.map_err(|error| format!("Failed to start Ollama: {error}"))?;
	if let Ok(mut slot) = child_slot().lock() {
		*slot = Some(child);
	}
	Ok(())
}

fn apply_platform_env(command: &mut Command, root: &Path, binary: &Path) {
	#[cfg(target_os = "linux")]
	if let Some(lib) = lib_dir(root) {
		let existing = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
		let value = if existing.is_empty() {
			lib.to_string_lossy().into_owned()
		} else {
			format!("{}:{}", lib.to_string_lossy(), existing)
		};
		command.env("LD_LIBRARY_PATH", value);
	}

	#[cfg(target_os = "macos")]
	if let Some(lib) = lib_dir(root) {
		let existing = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();
		let value = if existing.is_empty() {
			lib.to_string_lossy().into_owned()
		} else {
			format!("{}:{}", lib.to_string_lossy(), existing)
		};
		command.env("DYLD_LIBRARY_PATH", value);
	}

	#[cfg(target_os = "windows")]
	if let Some(parent) = binary.parent() {
		let existing = std::env::var("PATH").unwrap_or_default();
		let parent = parent.to_string_lossy();
		let value = if existing.is_empty() {
			parent.into_owned()
		} else {
			format!("{parent};{existing}")
		};
		command.env("PATH", value);
	}

	let _ = (root, binary);
}

fn platform_download() -> Result<(&'static str, &'static str), String> {
	let url = match (std::env::consts::OS, std::env::consts::ARCH) {
		("linux", "x86_64") => "https://ollama.com/download/ollama-linux-amd64.tar.zst",
		("linux", "aarch64") => "https://ollama.com/download/ollama-linux-arm64.tar.zst",
		("macos", _) => "https://ollama.com/download/ollama-darwin.tgz",
		("windows", "x86_64") => "https://ollama.com/download/ollama-windows-amd64.zip",
		("windows", "aarch64") => "https://ollama.com/download/ollama-windows-arm64.zip",
		(os, arch) => {
			return Err(format!(
				"Ollama auto-install is not supported on {os}/{arch} yet"
			))
		}
	};
	let file_name = url.rsplit('/').next().unwrap_or("ollama-archive");
	Ok((url, file_name))
}

pub async fn install_managed(
	root: PathBuf,
	endpoint: String,
	channel: Channel<OllamaInstallEvent>,
	cancel: Arc<AtomicBool>,
) -> Result<(), String> {
	let _ = channel.send(OllamaInstallEvent::Status {
		message: "Preparing Ollama download…".into(),
	});

	std::fs::create_dir_all(&root)
		.map_err(|error| format!("Failed to create install directory: {error}"))?;

	let (url, archive_name) = platform_download()?;
	let archive_path = root.join(archive_name);

	fetch_with_progress(url, &archive_path, &channel, &cancel).await?;
	if cancel.load(Ordering::Relaxed) {
		return Ok(());
	}

	let _ = channel.send(OllamaInstallEvent::Status {
		message: "Extracting Ollama…".into(),
	});
	extract_archive(&archive_path, &root)?;
	let _ = std::fs::remove_file(&archive_path);

	std::fs::write(root.join(MARKER_FILE), b"1")
		.map_err(|error| format!("Failed to write install marker: {error}"))?;

	#[cfg(target_os = "macos")]
	if let Some(binary) = managed_binary_path(&root) {
		let _ = Command::new("xattr")
			.args(["-dr", "com.apple.quarantine", binary.to_string_lossy().as_ref()])
			.status();
	}

	if cancel.load(Ordering::Relaxed) {
		return Ok(());
	}

	let _ = channel.send(OllamaInstallEvent::Status {
		message: "Starting Ollama…".into(),
	});
	start_managed_server(&root, &endpoint).await?;
	let version = wait_for_server(&endpoint, 60).await.ok();

	let _ = channel.send(OllamaInstallEvent::Done {
		version,
		install_path: root.to_string_lossy().into_owned(),
	});
	Ok(())
}

async fn fetch_with_progress(
	url: &str,
	destination: &Path,
	channel: &Channel<OllamaInstallEvent>,
	cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
	let client = reqwest::Client::builder()
		.timeout(std::time::Duration::from_secs(60 * 60))
		.build()
		.map_err(|error| format!("download client failed: {error}"))?;
	let response = client
		.get(url)
		.send()
		.await
		.map_err(|error| format!("Failed to download Ollama: {error}"))?;
	if !response.status().is_success() {
		return Err(format!("Failed to download Ollama ({})", response.status()));
	}

	let total = response.content_length();
	let mut stream = response.bytes_stream();
	let mut file =
		File::create(destination).map_err(|error| format!("Failed to create archive file: {error}"))?;
	let mut completed = 0u64;

	while let Some(chunk) = stream.next().await {
		if cancel.load(Ordering::Relaxed) {
			let _ = std::fs::remove_file(destination);
			return Ok(());
		}
		let chunk = chunk.map_err(|error| format!("Download failed: {error}"))?;
		completed += chunk.len() as u64;
		std::io::Write::write_all(&mut file, &chunk)
			.map_err(|error| format!("Failed to write archive: {error}"))?;

		let percent = total
			.map(|value| {
				if value == 0 {
					0.0
				} else {
					((completed as f64 / value as f64) * 100.0) as f32
				}
			})
			.unwrap_or(0.0);
		let _ = channel.send(OllamaInstallEvent::Progress {
			completed,
			total,
			percent,
		});
	}
	Ok(())
}

fn extract_archive(archive_path: &Path, destination: &Path) -> Result<(), String> {
	let name = archive_path
		.file_name()
		.and_then(|value| value.to_str())
		.unwrap_or_default()
		.to_ascii_lowercase();

	if name.ends_with(".tar.zst") {
		let file = File::open(archive_path).map_err(|error| format!("open archive: {error}"))?;
		let decoder = zstd::stream::read::Decoder::new(file)
			.map_err(|error| format!("decompress archive: {error}"))?;
		tar::Archive::new(decoder)
			.unpack(destination)
			.map_err(|error| format!("extract archive: {error}"))
	} else if name.ends_with(".tgz") || name.ends_with(".tar.gz") {
		let file = File::open(archive_path).map_err(|error| format!("open archive: {error}"))?;
		tar::Archive::new(GzDecoder::new(file))
			.unpack(destination)
			.map_err(|error| format!("extract archive: {error}"))
	} else if name.ends_with(".zip") {
		extract_zip(archive_path, destination)
	} else {
		Err(format!("Unsupported Ollama archive format: {}", archive_path.display()))
	}
}

fn extract_zip(archive_path: &Path, destination: &Path) -> Result<(), String> {
	let file = File::open(archive_path).map_err(|error| format!("open zip: {error}"))?;
	let mut archive = ZipArchive::new(file).map_err(|error| format!("read zip: {error}"))?;
	for index in 0..archive.len() {
		let mut entry = archive
			.by_index(index)
			.map_err(|error| format!("read zip entry: {error}"))?;
		let Some(relative) = sanitize_zip_path(entry.name()) else {
			continue;
		};
		let out_path = destination.join(relative);
		if entry.is_dir() {
			std::fs::create_dir_all(&out_path)
				.map_err(|error| format!("create dir: {error}"))?;
			continue;
		}
		if let Some(parent) = out_path.parent() {
			std::fs::create_dir_all(parent).map_err(|error| format!("create dir: {error}"))?;
		}
		let mut out_file = File::create(&out_path).map_err(|error| format!("create file: {error}"))?;
		copy(&mut entry, &mut out_file).map_err(|error| format!("extract file: {error}"))?;
	}
	Ok(())
}

fn sanitize_zip_path(name: &str) -> Option<PathBuf> {
	let path = PathBuf::from(name);
	if path
		.components()
		.any(|component| matches!(component, std::path::Component::ParentDir))
	{
		return None;
	}
	Some(path)
}
