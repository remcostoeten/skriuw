use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

pub(crate) const CONFIG_FILE: &str = "agent-server.json";
pub(crate) const DEFAULT_PORT: u16 = 41783;
const CONFIG_VERSION: u32 = 1;
const TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentServerConfig {
    pub(crate) version: u32,
    pub(crate) enabled: bool,
    pub(crate) port: u16,
    pub(crate) token: String,
}

impl AgentServerConfig {
    pub(crate) fn fresh() -> Result<Self, String> {
        Ok(Self {
            version: CONFIG_VERSION,
            enabled: false,
            port: DEFAULT_PORT,
            token: generate_token()?,
        })
    }
}

pub(crate) fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(CONFIG_FILE)
}

/// A missing or unreadable file yields a disabled server with a new token, so
/// a damaged config can never leave the endpoint open on an old credential.
pub(crate) fn load(path: &Path) -> Result<AgentServerConfig, String> {
    let stored = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<AgentServerConfig>(&raw).ok())
        .filter(|config| {
            config.version == CONFIG_VERSION && config.port != 0 && valid_token(&config.token)
        });
    match stored {
        Some(config) => Ok(config),
        None => AgentServerConfig::fresh(),
    }
}

pub(crate) fn save(path: &Path, config: &AgentServerConfig) -> Result<(), String> {
    write_private(path, config).map_err(|error| format!("could not save agent access: {error}"))
}

pub(crate) fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; TOKEN_BYTES];
    getrandom::fill(&mut bytes).map_err(|error| format!("no randomness for a token: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn valid_token(token: &str) -> bool {
    token.len() == TOKEN_BYTES * 2 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn write_private(path: &Path, config: &AgentServerConfig) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let serialized = serde_json::to_vec_pretty(config)
        .map_err(|error| std::io::Error::new(ErrorKind::InvalidData, error))?;
    let pending = path.with_extension("json.pending");
    let _ = fs::remove_file(&pending);
    fs::write(&pending, &serialized)?;
    restrict_permissions(&pending)?;
    fs::rename(&pending, path)
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<(), std::io::Error> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<(), std::io::Error> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_yields_a_disabled_server_with_a_token() {
        let directory = tempfile::tempdir().unwrap();
        let config = load(&config_path(directory.path())).unwrap();
        assert!(!config.enabled);
        assert_eq!(config.port, DEFAULT_PORT);
        assert!(valid_token(&config.token));
    }

    #[test]
    fn a_saved_config_round_trips() {
        let directory = tempfile::tempdir().unwrap();
        let path = config_path(directory.path());
        let mut config = AgentServerConfig::fresh().unwrap();
        config.enabled = true;
        config.port = 5000;
        save(&path, &config).unwrap();
        assert_eq!(load(&path).unwrap(), config);
    }

    #[test]
    fn a_damaged_file_is_replaced_by_a_disabled_server() {
        let directory = tempfile::tempdir().unwrap();
        let path = config_path(directory.path());
        fs::write(
            &path,
            r#"{"version":1,"enabled":true,"port":5000,"token":"short"}"#,
        )
        .unwrap();
        let config = load(&path).unwrap();
        assert!(!config.enabled);
        assert_ne!(config.token, "short");
    }

    #[cfg(unix)]
    #[test]
    fn the_file_is_readable_only_by_its_owner() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let path = config_path(directory.path());
        save(&path, &AgentServerConfig::fresh().unwrap()).unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
