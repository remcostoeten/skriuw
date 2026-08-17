//! Native ownership of remote AI provider keys and privacy consent.
//!
//! Key bytes live in the operating-system vault or, when the user explicitly
//! chooses it, in Rust-side memory for the process lifetime. They never enter
//! SQLite, the workspace settings document, archives, exports, backups, sync
//! payloads, generated contracts, completion events, or an error message. The
//! renderer can learn that a key exists, which tier holds it, and the consent
//! state; it can never read a key back.

use std::{
    collections::BTreeMap,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Mutex,
};

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use skriuw_ai_remote::RemoteProviderKind;
use skriuw_domain::{
    AiCredential, AiCredentialError, AiCredentialSource, AiProviderError, AiProviderErrorCategory,
    AiRecoveryAction, CredentialVaultDetection, CredentialVaultState, REMOTE_AI_DISCLOSURE_VERSION,
    RemoteAiKeyTier, RemoteAiProviderState,
};

const VAULT_SERVICE: &str = "dev.skriuw.app";
const CONSENT_FILE: &str = "ai-consent.json";
const CONSENT_DOCUMENT_VERSION: u32 = 1;

pub(crate) const REMOTE_PROVIDERS: [RemoteProviderKind; 2] =
    [RemoteProviderKind::Gemini, RemoteProviderKind::Groq];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsentDocument {
    version: u32,
    #[serde(default)]
    accepted: BTreeMap<String, u32>,
}

impl Default for ConsentDocument {
    fn default() -> Self {
        Self {
            version: CONSENT_DOCUMENT_VERSION,
            accepted: BTreeMap::new(),
        }
    }
}

pub(crate) struct AiCredentialStore {
    consent_path: PathBuf,
    consent: Mutex<Option<ConsentDocument>>,
    session_keys: Mutex<BTreeMap<String, Vec<u8>>>,
}

impl AiCredentialStore {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            consent_path: app_data_dir.join(CONSENT_FILE),
            consent: Mutex::new(None),
            session_keys: Mutex::new(BTreeMap::new()),
        }
    }

    /// Resolves the vault state for this device. Linux asks the session bus
    /// directly because the keyring crate's persistent store only succeeds when
    /// Secret Service accepts the write, so a locked or absent collection has
    /// to be a visible, actionable state instead of a failed save.
    pub(crate) fn detect_vault(&self) -> CredentialVaultDetection {
        detect_vault_state()
    }

    pub(crate) fn provider_states(&self) -> Vec<RemoteAiProviderState> {
        let accepted = self.accepted_versions();
        REMOTE_PROVIDERS
            .iter()
            .map(|kind| RemoteAiProviderState {
                provider_id: kind.id().to_owned(),
                label: kind.label().to_owned(),
                destination: kind.destination().to_owned(),
                key_tier: self.key_tier(kind.id()),
                accepted_disclosure_version: accepted.get(kind.id()).copied(),
                current_disclosure_version: REMOTE_AI_DISCLOSURE_VERSION,
            })
            .collect()
    }

    pub(crate) fn save_key(
        &self,
        kind: RemoteProviderKind,
        key: &str,
        tier: RemoteAiKeyTier,
    ) -> Result<(), AiProviderError> {
        let credential = AiCredential::new(key).map_err(|error| credential_error(kind, error))?;
        match tier {
            RemoteAiKeyTier::Vault => {
                let detection = self.detect_vault();
                if !detection.state.accepts_new_keys() {
                    return Err(vault_error(kind, detection.state));
                }
                entry(kind.id())
                    .and_then(|entry| entry.set_password(credential.expose()))
                    .map_err(|error| keyring_error(kind, &error))?;
                self.forget_session_key(kind.id());
            }
            RemoteAiKeyTier::SessionOnly => {
                self.forget_session_key(kind.id());
                lock(&self.session_keys).insert(
                    kind.id().to_owned(),
                    credential.expose().as_bytes().to_vec(),
                );
            }
        }
        Ok(())
    }

    /// Removal succeeds once no key material remains for the provider. A vault
    /// that refuses the delete only fails the operation when it could be
    /// holding a key: on a device with no reachable vault, dropping the session
    /// key already satisfies that, and failing there would strand a
    /// session-only key the user explicitly asked to revoke.
    pub(crate) fn remove_key(&self, kind: RemoteProviderKind) -> Result<(), AiProviderError> {
        self.forget_session_key(kind.id());
        match entry(kind.id()).and_then(|entry| entry.delete_credential()) {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) if detect_vault_state().state.may_hold_keys() => {
                Err(keyring_error(kind, &error))
            }
            Err(_) => Ok(()),
        }
    }

    pub(crate) fn grant_consent(&self, kind: RemoteProviderKind) -> Result<(), AiProviderError> {
        self.update_consent(kind, |accepted| {
            accepted.insert(kind.id().to_owned(), REMOTE_AI_DISCLOSURE_VERSION);
        })
    }

    /// Revocation removes the credential as well as the consent record, so a
    /// revoked provider cannot start a new request and holds no key material.
    pub(crate) fn revoke_consent(&self, kind: RemoteProviderKind) -> Result<(), AiProviderError> {
        self.remove_key(kind)?;
        self.update_consent(kind, |accepted| {
            accepted.remove(kind.id());
        })
    }

    pub(crate) fn take_key_for_verification(
        &self,
        kind: RemoteProviderKind,
        submitted: Option<String>,
    ) -> Result<AiCredential, AiProviderError> {
        if !self.consent_is_current(kind.id()) {
            return Err(credential_error(kind, AiCredentialError::ConsentRequired));
        }
        match submitted {
            Some(key) => AiCredential::new(key).map_err(|error| credential_error(kind, error)),
            None => self
                .resolve(kind.id())
                .map_err(|error| credential_error(kind, error)),
        }
    }

    fn key_tier(&self, provider_id: &str) -> Option<RemoteAiKeyTier> {
        if lock(&self.session_keys).contains_key(provider_id) {
            return Some(RemoteAiKeyTier::SessionOnly);
        }
        match entry(provider_id).and_then(|entry| entry.get_password()) {
            Ok(_) => Some(RemoteAiKeyTier::Vault),
            Err(_) => None,
        }
    }

    fn forget_session_key(&self, provider_id: &str) {
        if let Some(mut previous) = lock(&self.session_keys).remove(provider_id) {
            previous.fill(0);
        }
    }

    fn consent_is_current(&self, provider_id: &str) -> bool {
        self.accepted_versions().get(provider_id).copied() == Some(REMOTE_AI_DISCLOSURE_VERSION)
    }

    fn accepted_versions(&self) -> BTreeMap<String, u32> {
        let mut consent = lock(&self.consent);
        if consent.is_none() {
            *consent = Some(read_consent(&self.consent_path));
        }
        consent
            .as_ref()
            .map(|document| document.accepted.clone())
            .unwrap_or_default()
    }

    fn update_consent(
        &self,
        kind: RemoteProviderKind,
        change: impl FnOnce(&mut BTreeMap<String, u32>),
    ) -> Result<(), AiProviderError> {
        let mut guard = lock(&self.consent);
        let mut document = guard
            .take()
            .unwrap_or_else(|| read_consent(&self.consent_path));
        change(&mut document.accepted);
        document.version = CONSENT_DOCUMENT_VERSION;
        let result = write_consent(&self.consent_path, &document);
        *guard = Some(document);
        result.map_err(|_| {
            AiProviderError::new(
                kind.id(),
                AiProviderErrorCategory::InternalFailure,
                "Skriuw could not record this provider's consent on this device",
                AiRecoveryAction::Retry,
            )
        })
    }
}

impl AiCredentialSource for AiCredentialStore {
    fn resolve(&self, provider_id: &str) -> Result<AiCredential, AiCredentialError> {
        let accepted = self.accepted_versions().get(provider_id).copied();
        match accepted {
            Some(version) if version == REMOTE_AI_DISCLOSURE_VERSION => {}
            Some(_) => return Err(AiCredentialError::ConsentStale),
            None => return Err(AiCredentialError::ConsentRequired),
        }
        if let Some(session) = lock(&self.session_keys).get(provider_id) {
            return AiCredential::new(String::from_utf8_lossy(session).as_ref());
        }
        match entry(provider_id).and_then(|entry| entry.get_password()) {
            Ok(key) => AiCredential::new(key),
            Err(KeyringError::NoEntry) => Err(AiCredentialError::Missing),
            Err(error) => Err(match detect_vault_state().state {
                CredentialVaultState::VaultLocked => AiCredentialError::VaultLocked,
                CredentialVaultState::VaultAbsent | CredentialVaultState::VaultBlocked => {
                    AiCredentialError::VaultUnavailable
                }
                _ => {
                    let _ = error;
                    AiCredentialError::Missing
                }
            }),
        }
    }
}

fn entry(provider_id: &str) -> Result<Entry, KeyringError> {
    Entry::new(VAULT_SERVICE, &format!("ai-provider:{provider_id}"))
}

fn read_consent(path: &Path) -> ConsentDocument {
    let Ok(raw) = fs::read_to_string(path) else {
        return ConsentDocument::default();
    };
    // A consent record that cannot be read is treated as absent: the user is
    // asked to accept the disclosure again rather than silently authorised.
    serde_json::from_str::<ConsentDocument>(&raw)
        .ok()
        .filter(|document| document.version == CONSENT_DOCUMENT_VERSION)
        .unwrap_or_default()
}

fn write_consent(path: &Path, document: &ConsentDocument) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let serialized = serde_json::to_vec_pretty(document)
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

#[cfg(target_os = "linux")]
fn detect_vault_state() -> CredentialVaultDetection {
    use dbus_secret_service::{EncryptionType, Error as SecretServiceError, SecretService};

    let snap_confined = std::env::var_os("SNAP").is_some();
    let service = match SecretService::connect(EncryptionType::Plain) {
        Ok(service) => service,
        Err(SecretServiceError::Unavailable) if snap_confined => {
            return CredentialVaultDetection {
                state: CredentialVaultState::VaultBlocked,
                detail: Some(
                    "This Snap build cannot reach your keyring. Run: snap connect skriuw:password-manager-service"
                        .to_owned(),
                ),
            };
        }
        Err(_) => {
            return CredentialVaultDetection {
                state: CredentialVaultState::VaultAbsent,
                detail: Some(
                    "No system keyring service is running on this session bus.".to_owned(),
                ),
            };
        }
    };
    let Ok(collection) = service.get_default_collection() else {
        return CredentialVaultDetection {
            state: CredentialVaultState::VaultNoCollection,
            detail: Some("Your keyring has no default collection yet.".to_owned()),
        };
    };
    match collection.is_locked() {
        Ok(true) => CredentialVaultDetection {
            state: CredentialVaultState::VaultLocked,
            detail: Some("Your keyring is locked.".to_owned()),
        },
        Ok(false) => CredentialVaultDetection {
            state: CredentialVaultState::VaultOk,
            detail: None,
        },
        Err(_) => CredentialVaultDetection {
            state: CredentialVaultState::VaultLocked,
            detail: Some("Skriuw could not read your keyring's lock state.".to_owned()),
        },
    }
}

#[cfg(target_os = "macos")]
fn detect_vault_state() -> CredentialVaultDetection {
    CredentialVaultDetection {
        state: CredentialVaultState::VaultOk,
        detail: None,
    }
}

#[cfg(target_os = "windows")]
fn detect_vault_state() -> CredentialVaultDetection {
    CredentialVaultDetection {
        state: CredentialVaultState::VaultOk,
        detail: None,
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn detect_vault_state() -> CredentialVaultDetection {
    CredentialVaultDetection {
        state: CredentialVaultState::VaultAbsent,
        detail: Some("This platform has no supported credential vault.".to_owned()),
    }
}

fn credential_error(kind: RemoteProviderKind, error: AiCredentialError) -> AiProviderError {
    error.into_provider_error(kind.id())
}

fn vault_error(kind: RemoteProviderKind, state: CredentialVaultState) -> AiProviderError {
    let message = match state {
        CredentialVaultState::VaultLocked => {
            "Unlock your system keyring before storing a provider key."
        }
        CredentialVaultState::VaultBlocked => {
            "This build cannot reach your keyring. Connect the keyring interface or keep the key for this session only."
        }
        _ => {
            "No system keyring is available. Keep the key for this session only, or install a keyring."
        }
    };
    AiProviderError::new(
        kind.id(),
        AiProviderErrorCategory::MissingCredential,
        message,
        AiRecoveryAction::ConfigureCredential,
    )
}

/// Keyring failures are reported by category only. The underlying message can
/// name the backend and, on some platforms, echo the stored value.
fn keyring_error(kind: RemoteProviderKind, error: &KeyringError) -> AiProviderError {
    let (category, message) = match error {
        KeyringError::NoEntry => (
            AiProviderErrorCategory::MissingCredential,
            "No key is stored for this provider.",
        ),
        KeyringError::Invalid(_, _) | KeyringError::BadEncoding(_) => (
            AiProviderErrorCategory::InvalidCredential,
            "This key cannot be stored in the system keyring.",
        ),
        _ => (
            AiProviderErrorCategory::MissingCredential,
            "The system keyring refused this operation.",
        ),
    };
    AiProviderError::new(
        kind.id(),
        category,
        message,
        AiRecoveryAction::ConfigureCredential,
    )
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use skriuw_ai_remote::RemoteProviderKind;
    use skriuw_domain::{
        AiCredentialError, AiCredentialSource, AiProviderErrorCategory, CredentialVaultState,
        REMOTE_AI_DISCLOSURE_VERSION, RemoteAiKeyTier,
    };
    use tempfile::{TempDir, tempdir};

    use super::{AiCredentialStore, ConsentDocument, read_consent, write_consent};

    const KEY: &str = "sk-session-only-key";

    fn store() -> (AiCredentialStore, TempDir) {
        let directory = tempdir().expect("tempdir");
        (AiCredentialStore::new(directory.path()), directory)
    }

    #[test]
    fn reports_both_providers_without_a_key_or_consent_by_default() {
        let (store, _directory) = store();

        let states = store.provider_states();

        assert_eq!(states.len(), 2);
        for state in &states {
            assert_eq!(state.accepted_disclosure_version, None);
            assert!(!state.consent_is_current());
            assert!(!state.can_complete());
            assert_eq!(
                state.current_disclosure_version,
                REMOTE_AI_DISCLOSURE_VERSION
            );
        }
        assert!(states.iter().any(|state| state.provider_id == "gemini"));
        assert!(states.iter().any(|state| state.provider_id == "groq"));
    }

    #[test]
    fn refuses_to_resolve_a_key_before_the_disclosure_is_accepted() {
        let (store, _directory) = store();
        store
            .save_key(RemoteProviderKind::Groq, KEY, RemoteAiKeyTier::SessionOnly)
            .expect("session key");

        assert_eq!(
            store.resolve("groq").err(),
            Some(AiCredentialError::ConsentRequired)
        );

        store
            .grant_consent(RemoteProviderKind::Groq)
            .expect("consent");

        assert_eq!(store.resolve("groq").expect("credential").expose(), KEY);
    }

    #[test]
    fn holds_a_session_only_key_outside_every_persistent_store() {
        let (store, directory) = store();
        store
            .save_key(
                RemoteProviderKind::Gemini,
                KEY,
                RemoteAiKeyTier::SessionOnly,
            )
            .expect("session key");
        store
            .grant_consent(RemoteProviderKind::Gemini)
            .expect("consent");

        let gemini = store
            .provider_states()
            .into_iter()
            .find(|state| state.provider_id == "gemini")
            .expect("gemini state");
        assert_eq!(gemini.key_tier, Some(RemoteAiKeyTier::SessionOnly));
        assert!(gemini.can_complete());

        for entry in std::fs::read_dir(directory.path()).expect("read dir") {
            let path = entry.expect("entry").path();
            let bytes = std::fs::read(&path).expect("read file");
            assert!(
                !String::from_utf8_lossy(&bytes).contains(KEY),
                "{} persisted key material",
                path.display()
            );
        }
    }

    #[test]
    fn records_and_revokes_consent_on_disk_without_key_material() {
        let (store, directory) = store();
        store
            .save_key(RemoteProviderKind::Groq, KEY, RemoteAiKeyTier::SessionOnly)
            .expect("session key");
        store
            .grant_consent(RemoteProviderKind::Groq)
            .expect("consent");

        let consent_file = directory.path().join("ai-consent.json");
        let recorded = std::fs::read_to_string(&consent_file).expect("consent file");
        assert!(recorded.contains("groq"));
        assert!(!recorded.contains(KEY));

        store
            .revoke_consent(RemoteProviderKind::Groq)
            .expect("revoke");

        let groq = store
            .provider_states()
            .into_iter()
            .find(|state| state.provider_id == "groq")
            .expect("groq state");
        assert_eq!(groq.key_tier, None, "revocation must drop the key");
        assert_eq!(groq.accepted_disclosure_version, None);
        assert_eq!(
            store.resolve("groq").err(),
            Some(AiCredentialError::ConsentRequired)
        );
    }

    #[test]
    fn treats_a_stale_or_unreadable_consent_record_as_absent() {
        let (store, directory) = store();
        let path = directory.path().join("ai-consent.json");

        std::fs::write(&path, "{ not json").expect("write");
        assert!(read_consent(&path).accepted.is_empty());

        write_consent(
            &path,
            &ConsentDocument {
                version: CONSENT_DOCUMENT_VERSION_FOR_TEST + 1,
                accepted: [("groq".to_owned(), REMOTE_AI_DISCLOSURE_VERSION)]
                    .into_iter()
                    .collect(),
            },
        )
        .expect("write consent");
        assert!(read_consent(&path).accepted.is_empty());
        assert_eq!(
            store.resolve("groq").err(),
            Some(AiCredentialError::ConsentRequired)
        );
    }

    #[test]
    fn refuses_a_stale_disclosure_version_that_was_once_accepted() {
        let (store, directory) = store();
        store
            .save_key(RemoteProviderKind::Groq, KEY, RemoteAiKeyTier::SessionOnly)
            .expect("session key");
        write_consent(
            &directory.path().join("ai-consent.json"),
            &ConsentDocument {
                version: CONSENT_DOCUMENT_VERSION_FOR_TEST,
                accepted: [("groq".to_owned(), REMOTE_AI_DISCLOSURE_VERSION - 1)]
                    .into_iter()
                    .collect(),
            },
        )
        .expect("write consent");

        assert_eq!(
            store.resolve("groq").err(),
            Some(AiCredentialError::ConsentStale)
        );
    }

    #[test]
    fn rejects_a_malformed_key_before_any_store_is_touched() {
        let (store, _directory) = store();

        let error = store
            .save_key(RemoteProviderKind::Groq, "short", RemoteAiKeyTier::Vault)
            .expect_err("rejected key");

        assert_eq!(error.category, AiProviderErrorCategory::InvalidCredential);
        assert!(!error.message.contains("short"));
    }

    #[test]
    fn verification_requires_consent_even_for_a_freshly_typed_key() {
        let (store, _directory) = store();

        let error = store
            .take_key_for_verification(RemoteProviderKind::Gemini, Some(KEY.to_owned()))
            .expect_err("consent gate");
        assert_eq!(error.category, AiProviderErrorCategory::MissingCredential);

        store
            .grant_consent(RemoteProviderKind::Gemini)
            .expect("consent");

        let credential = store
            .take_key_for_verification(RemoteProviderKind::Gemini, Some(KEY.to_owned()))
            .expect("credential");
        assert_eq!(credential.expose(), KEY);
    }

    #[test]
    fn every_vault_state_that_cannot_persist_refuses_a_vault_tier_save() {
        for state in [
            CredentialVaultState::VaultLocked,
            CredentialVaultState::VaultAbsent,
            CredentialVaultState::VaultBlocked,
        ] {
            assert!(!state.accepts_new_keys());
        }
    }

    const CONSENT_DOCUMENT_VERSION_FOR_TEST: u32 = super::CONSENT_DOCUMENT_VERSION;
}
