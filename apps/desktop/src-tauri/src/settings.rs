use std::collections::BTreeMap;
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::atomic_file;

pub const CURRENT_SETTINGS_VERSION: u32 = 1;
pub const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ollama_endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ollama_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub groq_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gemini_model: Option<String>,
    /// Explicit opt-in required before note text may be sent to any cloud AI.
    #[serde(default)]
    pub cloud_consent: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    #[serde(default)]
    pub settings_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vault_root: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_assets_root: Option<PathBuf>,
    #[serde(default)]
    pub ai: AiSettings,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            settings_version: CURRENT_SETTINGS_VERSION,
            vault_root: None,
            cover_assets_root: None,
            ai: AiSettings::default(),
            extra: Map::new(),
        }
    }
}

impl DesktopSettings {
    pub fn vault_root_or(&self, default: PathBuf) -> PathBuf {
        self.vault_root.clone().unwrap_or(default)
    }
}

#[derive(Debug)]
pub enum SettingsError {
    Read(std::io::Error),
    Parse {
        line: usize,
        column: usize,
        recovery_path: Option<PathBuf>,
    },
    UnsupportedVersion(u32),
    Serialize(serde_json::Error),
    Write(std::io::Error),
    Validation(String),
    RecoveryMode(String),
    LockPoisoned,
}

impl fmt::Display for SettingsError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read(error) => write!(formatter, "read settings: {error}"),
            Self::Parse {
                line,
                column,
                recovery_path,
            } => {
                write!(formatter, "settings JSON is malformed at line {line}, column {column}")?;
                if let Some(path) = recovery_path {
                    write!(formatter, "; original bytes copied to {}", path.display())?;
                }
                Ok(())
            }
            Self::UnsupportedVersion(version) => write!(
                formatter,
                "settings version {version} is newer than supported version {CURRENT_SETTINGS_VERSION}; use a newer Skriuw build"
            ),
            Self::Serialize(error) => write!(formatter, "serialize settings: {error}"),
            Self::Write(error) => write!(formatter, "atomically write settings: {error}"),
            Self::Validation(message) => write!(formatter, "invalid settings: {message}"),
            Self::RecoveryMode(message) => write!(
                formatter,
                "settings are read-only until settings.json is repaired: {message}"
            ),
            Self::LockPoisoned => write!(formatter, "settings lock poisoned"),
        }
    }
}

impl std::error::Error for SettingsError {}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDiagnostics {
    pub path: PathBuf,
    pub settings_version: u32,
    pub vault_root: Option<PathBuf>,
    pub cover_assets_root: Option<PathBuf>,
    pub ai_provider: Option<String>,
    pub ai_models: BTreeMap<String, String>,
    pub recovery_error: Option<String>,
}

#[derive(Debug, Clone)]
struct StoreState {
    settings: DesktopSettings,
    recovery_error: Option<String>,
}

pub struct SettingsStore {
    path: PathBuf,
    state: RwLock<StoreState>,
    #[cfg(test)]
    fail_next_write: std::sync::Mutex<Option<atomic_file::AtomicWriteStage>>,
}

impl SettingsStore {
    pub fn load_in(app_data_dir: &Path) -> Result<Self, SettingsError> {
        Self::load(app_data_dir.join(SETTINGS_FILE))
    }

    pub fn load(path: PathBuf) -> Result<Self, SettingsError> {
        let state = load_state(&path)?;
        Ok(Self {
            path,
            state: RwLock::new(state),
            #[cfg(test)]
            fail_next_write: std::sync::Mutex::new(None),
        })
    }

    pub fn snapshot(&self) -> Result<DesktopSettings, SettingsError> {
        self.state
            .read()
            .map(|state| state.settings.clone())
            .map_err(|_| SettingsError::LockPoisoned)
    }

    pub fn update<F>(&self, patch: F) -> Result<DesktopSettings, SettingsError>
    where
        F: FnOnce(&mut DesktopSettings) -> Result<(), SettingsError>,
    {
        let mut state = self
            .state
            .write()
            .map_err(|_| SettingsError::LockPoisoned)?;
        if let Some(error) = &state.recovery_error {
            return Err(SettingsError::RecoveryMode(error.clone()));
        }
        let mut next = state.settings.clone();
        patch(&mut next)?;
        next.settings_version = CURRENT_SETTINGS_VERSION;
        validate(&next)?;
        write_settings(&self.path, &next, self.take_failure())?;
        state.settings = next.clone();
        Ok(next)
    }

    pub fn reload(&self) -> Result<DesktopSettings, SettingsError> {
        let mut state = self
            .state
            .write()
            .map_err(|_| SettingsError::LockPoisoned)?;
        *state = load_state(&self.path)?;
        Ok(state.settings.clone())
    }

    pub fn set_vault_root(&self, root: PathBuf) -> Result<DesktopSettings, SettingsError> {
        self.update(|settings| {
            settings.vault_root = Some(root);
            Ok(())
        })
    }

    pub fn set_cover_assets_root(
        &self,
        root: Option<PathBuf>,
    ) -> Result<DesktopSettings, SettingsError> {
        self.update(|settings| {
            settings.cover_assets_root = root;
            Ok(())
        })
    }

    /// Transitional DH-03 seam: reads a legacy plaintext key without adding it
    /// to the typed schema or diagnostics.
    pub fn legacy_ai_secret(&self, field: &str) -> Result<Option<String>, SettingsError> {
        let snapshot = self.snapshot()?;
        Ok(snapshot
            .ai
            .extra
            .get(field)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned))
    }

    /// Transitional compatibility for the existing UI until DH-03 moves keys
    /// to the OS credential store.
    pub fn set_legacy_ai_secret(
        &self,
        field: &str,
        value: Option<String>,
    ) -> Result<DesktopSettings, SettingsError> {
        self.update(|settings| {
            match value {
                Some(value) => {
                    settings
                        .ai
                        .extra
                        .insert(field.to_string(), Value::String(value));
                }
                None => {
                    settings.ai.extra.remove(field);
                }
            }
            Ok(())
        })
    }

    pub fn diagnostics(&self) -> Result<SettingsDiagnostics, SettingsError> {
        let state = self.state.read().map_err(|_| SettingsError::LockPoisoned)?;
        let mut ai_models = BTreeMap::new();
        for (name, value) in [
            ("ollama", state.settings.ai.ollama_model.as_ref()),
            ("groq", state.settings.ai.groq_model.as_ref()),
            ("gemini", state.settings.ai.gemini_model.as_ref()),
        ] {
            if let Some(value) = value {
                ai_models.insert(name.to_string(), value.clone());
            }
        }
        Ok(SettingsDiagnostics {
            path: self.path.clone(),
            settings_version: state.settings.settings_version,
            vault_root: state.settings.vault_root.clone(),
            cover_assets_root: state.settings.cover_assets_root.clone(),
            ai_provider: state.settings.ai.provider.clone(),
            ai_models,
            recovery_error: state.recovery_error.clone(),
        })
    }

    #[cfg(test)]
    fn inject_write_failure(&self, stage: atomic_file::AtomicWriteStage) {
        *self.fail_next_write.lock().unwrap() = Some(stage);
    }

    #[cfg(test)]
    fn take_failure(&self) -> Option<atomic_file::AtomicWriteStage> {
        self.fail_next_write.lock().unwrap().take()
    }

    #[cfg(not(test))]
    fn take_failure(&self) -> Option<()> {
        None
    }
}

fn load_state(path: &Path) -> Result<StoreState, SettingsError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(StoreState {
                settings: DesktopSettings::default(),
                recovery_error: None,
            });
        }
        Err(error) => return Err(SettingsError::Read(error)),
    };

    let mut settings: DesktopSettings = match serde_json::from_slice(&bytes) {
        Ok(settings) => settings,
        Err(error) => {
            let recovery_path = preserve_corrupt_bytes(path, &bytes).ok();
            let parse_error = SettingsError::Parse {
                line: error.line(),
                column: error.column(),
                recovery_path,
            };
            return Ok(StoreState {
                settings: DesktopSettings::default(),
                recovery_error: Some(parse_error.to_string()),
            });
        }
    };

    if settings.settings_version > CURRENT_SETTINGS_VERSION {
        let error = SettingsError::UnsupportedVersion(settings.settings_version);
        return Ok(StoreState {
            settings: DesktopSettings::default(),
            recovery_error: Some(error.to_string()),
        });
    }
    let migrated = settings.settings_version == 0;
    if migrated {
        settings.settings_version = CURRENT_SETTINGS_VERSION;
    }
    validate(&settings)?;
    if migrated {
        write_settings(path, &settings, None)?;
    }
    Ok(StoreState {
        settings,
        recovery_error: None,
    })
}

fn validate(settings: &DesktopSettings) -> Result<(), SettingsError> {
    for (name, path) in [
        ("vaultRoot", settings.vault_root.as_ref()),
        ("coverAssetsRoot", settings.cover_assets_root.as_ref()),
    ] {
        if path.is_some_and(|path| path.as_os_str().is_empty()) {
            return Err(SettingsError::Validation(format!(
                "{name} must not be empty"
            )));
        }
    }
    validate_string("ai.provider", settings.ai.provider.as_deref(), 32)?;
    validate_string(
        "ai.ollamaEndpoint",
        settings.ai.ollama_endpoint.as_deref(),
        2048,
    )?;
    validate_string("ai.ollamaModel", settings.ai.ollama_model.as_deref(), 256)?;
    validate_string("ai.groqModel", settings.ai.groq_model.as_deref(), 256)?;
    validate_string("ai.geminiModel", settings.ai.gemini_model.as_deref(), 256)?;
    Ok(())
}

fn validate_string(name: &str, value: Option<&str>, max: usize) -> Result<(), SettingsError> {
    if value.is_some_and(|value| value.chars().count() > max) {
        return Err(SettingsError::Validation(format!(
            "{name} exceeds {max} characters"
        )));
    }
    Ok(())
}

#[cfg(test)]
fn write_settings(
    path: &Path,
    settings: &DesktopSettings,
    fail_at: Option<atomic_file::AtomicWriteStage>,
) -> Result<(), SettingsError> {
    let body = serde_json::to_vec_pretty(settings).map_err(SettingsError::Serialize)?;
    let mut bytes = body;
    bytes.push(b'\n');
    match fail_at {
        Some(stage) => atomic_file::atomic_write_failing(path, &bytes, stage),
        None => atomic_file::atomic_write(path, &bytes),
    }
    .map_err(SettingsError::Write)
}

#[cfg(not(test))]
fn write_settings(
    path: &Path,
    settings: &DesktopSettings,
    _fail_at: Option<()>,
) -> Result<(), SettingsError> {
    let body = serde_json::to_vec_pretty(settings).map_err(SettingsError::Serialize)?;
    let mut bytes = body;
    bytes.push(b'\n');
    atomic_file::atomic_write(path, &bytes).map_err(SettingsError::Write)
}

fn preserve_corrupt_bytes(path: &Path, bytes: &[u8]) -> Result<PathBuf, SettingsError> {
    let parent = path
        .parent()
        .ok_or_else(|| SettingsError::Validation("settings path has no parent".to_string()))?;
    fs::create_dir_all(parent).map_err(SettingsError::Write)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    for _ in 0..16 {
        let recovery = parent.join(format!(
            "settings.corrupt-{timestamp}-{}.json",
            uuid::Uuid::new_v4()
        ));
        match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&recovery)
        {
            Ok(mut file) => {
                file.write_all(bytes).map_err(SettingsError::Write)?;
                file.sync_all().map_err(SettingsError::Write)?;
                return Ok(recovery);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(SettingsError::Write(error)),
        }
    }
    Err(SettingsError::Write(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "could not allocate corrupt settings recovery copy",
    )))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::atomic_file::AtomicWriteStage;

    fn store(dir: &tempfile::TempDir) -> SettingsStore {
        SettingsStore::load(dir.path().join(SETTINGS_FILE)).unwrap()
    }

    #[test]
    fn missing_file_yields_current_defaults_without_writing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        let settings = SettingsStore::load(path.clone()).unwrap();
        assert_eq!(settings.snapshot().unwrap(), DesktopSettings::default());
        assert!(!path.exists());
    }

    #[test]
    fn loads_current_file_and_migrates_legacy_while_preserving_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        fs::write(
            &path,
            r#"{
                "vaultRoot": "/vault",
                "futureTop": {"enabled": true},
                "ai": {
                    "provider": "ollama",
                    "futureNested": [1, 2, 3]
                }
            }"#,
        )
        .unwrap();
        let settings = SettingsStore::load(path.clone()).unwrap();
        let migrated = settings.snapshot().unwrap();
        assert_eq!(migrated.settings_version, CURRENT_SETTINGS_VERSION);
        assert_eq!(
            migrated.extra["futureTop"],
            serde_json::json!({"enabled": true})
        );
        assert_eq!(
            migrated.ai.extra["futureNested"],
            serde_json::json!([1, 2, 3])
        );

        settings
            .set_cover_assets_root(Some(PathBuf::from("/covers")))
            .unwrap();
        let persisted: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(persisted["futureTop"], serde_json::json!({"enabled": true}));
        assert_eq!(
            persisted["ai"]["futureNested"],
            serde_json::json!([1, 2, 3])
        );
    }

    #[test]
    fn current_valid_file_loads_without_rewrite() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        let original = format!(
            "{{\"settingsVersion\":{CURRENT_SETTINGS_VERSION},\"ai\":{{\"provider\":\"ollama\"}}}}"
        );
        fs::write(&path, &original).unwrap();
        let settings = SettingsStore::load(path.clone()).unwrap();
        assert_eq!(
            settings.snapshot().unwrap().ai.provider.as_deref(),
            Some("ollama")
        );
        assert_eq!(fs::read_to_string(path).unwrap(), original);
    }

    #[test]
    fn malformed_json_is_preserved_and_store_is_read_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        let malformed = b"{\"vaultRoot\": ";
        fs::write(&path, malformed).unwrap();
        let settings = SettingsStore::load(path.clone()).unwrap();
        assert_eq!(fs::read(&path).unwrap(), malformed);
        assert!(matches!(
            settings.set_vault_root(PathBuf::from("/new")),
            Err(SettingsError::RecoveryMode(_))
        ));
        let copies: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|candidate| {
                candidate
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("settings.corrupt-"))
            })
            .collect();
        assert_eq!(copies.len(), 1);
        assert_eq!(fs::read(&copies[0]).unwrap(), malformed);
    }

    #[test]
    fn future_version_is_rejected_without_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        let original = r#"{"settingsVersion":999,"ai":{}}"#;
        fs::write(&path, original).unwrap();
        let settings = SettingsStore::load(path.clone()).unwrap();
        assert!(matches!(
            settings.set_vault_root(PathBuf::from("/new")),
            Err(SettingsError::RecoveryMode(_))
        ));
        assert_eq!(fs::read_to_string(path).unwrap(), original);
    }

    #[test]
    fn failed_write_keeps_file_and_memory_unchanged() {
        for stage in [
            AtomicWriteStage::Write,
            AtomicWriteStage::Flush,
            AtomicWriteStage::Replace,
        ] {
            let dir = tempfile::tempdir().unwrap();
            let settings = store(&dir);
            settings.set_vault_root(PathBuf::from("/old")).unwrap();
            let before_file = fs::read(dir.path().join(SETTINGS_FILE)).unwrap();
            let before_memory = settings.snapshot().unwrap();
            settings.inject_write_failure(stage);
            assert!(settings.set_vault_root(PathBuf::from("/new")).is_err());
            assert_eq!(
                fs::read(dir.path().join(SETTINGS_FILE)).unwrap(),
                before_file
            );
            assert_eq!(settings.snapshot().unwrap(), before_memory);
        }
    }

    #[test]
    fn concurrent_updates_preserve_vault_and_ai_fields() {
        let dir = tempfile::tempdir().unwrap();
        let settings = Arc::new(store(&dir));
        let vault_writer = {
            let settings = Arc::clone(&settings);
            std::thread::spawn(move || {
                for index in 0..50 {
                    settings
                        .set_vault_root(PathBuf::from(format!("/vault-{index}")))
                        .unwrap();
                }
            })
        };
        let ai_writer = {
            let settings = Arc::clone(&settings);
            std::thread::spawn(move || {
                for index in 0..50 {
                    settings
                        .update(|current| {
                            current.ai.ollama_model = Some(format!("model-{index}"));
                            Ok(())
                        })
                        .unwrap();
                }
            })
        };
        vault_writer.join().unwrap();
        ai_writer.join().unwrap();

        let final_settings = settings.snapshot().unwrap();
        assert_eq!(final_settings.vault_root, Some(PathBuf::from("/vault-49")));
        assert_eq!(final_settings.ai.ollama_model.as_deref(), Some("model-49"));
        let persisted: DesktopSettings =
            serde_json::from_slice(&fs::read(dir.path().join(SETTINGS_FILE)).unwrap()).unwrap();
        assert_eq!(persisted, final_settings);
    }

    #[test]
    fn readers_never_observe_half_of_a_multi_field_update() {
        let dir = tempfile::tempdir().unwrap();
        let settings = Arc::new(store(&dir));
        let writer = {
            let settings = Arc::clone(&settings);
            std::thread::spawn(move || {
                for index in 0..100 {
                    settings
                        .update(|current| {
                            current.vault_root = Some(PathBuf::from(format!("/{index}")));
                            current.ai.ollama_model = Some(index.to_string());
                            Ok(())
                        })
                        .unwrap();
                }
            })
        };
        while !writer.is_finished() {
            let snapshot = settings.snapshot().unwrap();
            if let (Some(root), Some(model)) = (snapshot.vault_root, snapshot.ai.ollama_model) {
                assert_eq!(root.file_name().unwrap().to_string_lossy(), model);
            }
        }
        writer.join().unwrap();
    }

    #[test]
    fn empty_paths_are_rejected_and_cover_root_can_reset() {
        let dir = tempfile::tempdir().unwrap();
        let settings = store(&dir);
        assert!(matches!(
            settings.set_vault_root(PathBuf::new()),
            Err(SettingsError::Validation(_))
        ));
        settings
            .set_cover_assets_root(Some(PathBuf::from("/covers")))
            .unwrap();
        settings.set_cover_assets_root(None).unwrap();
        assert_eq!(settings.snapshot().unwrap().cover_assets_root, None);
    }

    #[test]
    fn unset_vault_uses_the_supplied_home_default() {
        let settings = DesktopSettings::default();
        assert_eq!(
            settings.vault_root_or(PathBuf::from("/home/user/.skriuw")),
            PathBuf::from("/home/user/.skriuw")
        );
    }

    #[test]
    fn ai_patch_changes_only_requested_fields() {
        let dir = tempfile::tempdir().unwrap();
        let settings = store(&dir);
        settings
            .update(|current| {
                current.ai.provider = Some("ollama".to_string());
                current.ai.ollama_model = Some("first".to_string());
                Ok(())
            })
            .unwrap();
        settings
            .update(|current| {
                current.ai.ollama_model = Some("second".to_string());
                Ok(())
            })
            .unwrap();
        let snapshot = settings.snapshot().unwrap();
        assert_eq!(snapshot.ai.provider.as_deref(), Some("ollama"));
        assert_eq!(snapshot.ai.ollama_model.as_deref(), Some("second"));
    }

    #[test]
    fn reload_observes_restored_settings_before_callers_rebind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        let settings = SettingsStore::load(path.clone()).unwrap();
        settings.set_vault_root(PathBuf::from("/before")).unwrap();
        fs::write(
            &path,
            format!(
                "{{\"settingsVersion\":{CURRENT_SETTINGS_VERSION},\"vaultRoot\":\"/restored\",\"ai\":{{}}}}"
            ),
        )
        .unwrap();
        settings.reload().unwrap();
        assert_eq!(
            settings.snapshot().unwrap().vault_root,
            Some(PathBuf::from("/restored"))
        );
    }

    #[test]
    fn diagnostics_never_include_legacy_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let settings = store(&dir);
        settings
            .set_legacy_ai_secret("groqApiKey", Some("sentinel-secret".to_string()))
            .unwrap();
        let serialized = serde_json::to_string(&settings.diagnostics().unwrap()).unwrap();
        assert!(!serialized.contains("sentinel-secret"));
        assert!(!serialized.contains("groqApiKey"));
    }
}
