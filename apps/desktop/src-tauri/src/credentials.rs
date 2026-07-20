//! OS-backed storage for cloud-AI provider keys (DH-03).
//!
//! Groq and Gemini keys never live in `settings.json`, snapshots, logs, or any
//! serialized/`Debug` output. They are stored through the operating system's
//! credential store — macOS Keychain, Windows Credential Manager, or the Linux
//! Secret Service — via the `keyring` crate (pure-Rust `sync-secret-service`
//! backend on Linux, so no system libdbus/libsecret is required to build).
//!
//! Everything the rest of the app touches goes through the [`CredentialStore`]
//! trait, so tests use an in-memory adapter with injectable failures and the
//! secret value never has to reach a real keychain in CI.

use std::fmt;
#[cfg(test)]
use std::{collections::HashMap, sync::Mutex};

/// Production credential service name. Deliberately NOT the `.dev` Tauri
/// identifier: development keys must not collide with a shipped install's, so
/// the debug build appends a `.dev` suffix (see [`service_name`]).
const CREDENTIAL_SERVICE: &str = "nl.remcostoeten.skriuw";

/// Which cloud provider a stored key belongs to. The account name inside the
/// OS store is stable across app upgrades so an updated build finds prior keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialProvider {
    Groq,
    Gemini,
    /// Bearer credential issued by the user's Skriuw sync server.
    SyncBearer,
}

impl CredentialProvider {
    /// Stable per-provider account name inside the credential service.
    pub fn account(self) -> &'static str {
        match self {
            CredentialProvider::Groq => "ai:groq",
            CredentialProvider::Gemini => "ai:gemini",
            CredentialProvider::SyncBearer => "sync:bearer",
        }
    }

    /// Resolves the `"groq"`/`"gemini"`/`"google"` provider string used across
    /// the AI commands. Returns `None` for anything else.
    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "groq" => Some(CredentialProvider::Groq),
            "gemini" | "google" => Some(CredentialProvider::Gemini),
            _ => None,
        }
    }

    /// The legacy plaintext `settings.json` field this provider used before
    /// DH-03, for the one-way migration in [`migrate_legacy_secret`].
    pub fn legacy_field(self) -> &'static str {
        match self {
            CredentialProvider::Groq => "groqApiKey",
            CredentialProvider::Gemini => "geminiApiKey",
            CredentialProvider::SyncBearer => "syncToken",
        }
    }
}

/// A secret value that refuses to reveal itself through `Debug`/`Display`, so
/// it can never leak into a log line, panic message, or error string by
/// accident. Read the bytes only at the provider-call site via [`Self::expose`].
#[derive(Clone)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: impl Into<String>) -> Self {
        SecretString(value.into())
    }

    /// The only way to read the secret. Kept to the smallest possible scope at
    /// the call site and dropped immediately after the request is built.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretString(<redacted>)")
    }
}

/// Categorized credential-store failure. No variant carries the secret value.
#[derive(Debug)]
pub enum CredentialError {
    /// The platform credential backend is missing or not running (e.g. no
    /// Secret Service on a headless Linux session). Cloud AI is disabled;
    /// Ollama is unaffected.
    Unavailable(String),
    /// The backend exists but denied access, or the keychain/collection is
    /// locked and the user must unlock it.
    AccessDenied(String),
    /// The submitted value failed a sanity check before it was stored.
    InvalidSecret(String),
    /// A read-back after a write did not match what was written.
    VerificationFailed,
    /// Any other backend error.
    Unexpected(String),
}

impl fmt::Display for CredentialError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CredentialError::Unavailable(reason) => write!(
                formatter,
                "the operating system credential store is unavailable ({reason}); \
				 features that require a saved credential are disabled. Local Ollama still works."
            ),
            CredentialError::AccessDenied(reason) => write!(
                formatter,
                "access to the credential store was denied or it is locked ({reason}); \
				 unlock your keychain and try again."
            ),
            CredentialError::InvalidSecret(reason) => {
                write!(formatter, "invalid credential: {reason}")
            }
            CredentialError::VerificationFailed => write!(
                formatter,
                "the credential could not be read back after saving; it was not stored."
            ),
            CredentialError::Unexpected(reason) => {
                write!(formatter, "credential store error: {reason}")
            }
        }
    }
}

impl std::error::Error for CredentialError {}

/// Conservative maximum stored-key length, to reject obviously wrong pastes
/// without knowing each provider's exact format.
const MAX_SECRET_LEN: usize = 4096;

/// The credential-store seam. Production uses [`OsCredentialStore`]; tests use
/// an in-memory adapter with injectable failures.
pub trait CredentialStore: Send + Sync {
    fn set(&self, provider: CredentialProvider, secret: &str) -> Result<(), CredentialError>;
    fn get(&self, provider: CredentialProvider) -> Result<Option<SecretString>, CredentialError>;
    fn delete(&self, provider: CredentialProvider) -> Result<(), CredentialError>;
}

/// Tauri-managed credential store handle. Wraps a boxed adapter so the app can
/// be built with the OS store in production and an in-memory one in tests
/// without threading a generic through every command.
pub struct CredentialState(Box<dyn CredentialStore>);

impl CredentialState {
    pub fn os() -> Self {
        CredentialState(Box::new(OsCredentialStore::new()))
    }

    pub fn store(&self) -> &dyn CredentialStore {
        self.0.as_ref()
    }
}

/// Validates and normalizes a submitted key before it is stored. An empty value
/// is the caller's signal to delete, so it must be handled before calling this.
fn sanitize_secret(value: &str) -> Result<String, CredentialError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(CredentialError::InvalidSecret(
            "the key is empty".to_string(),
        ));
    }
    if trimmed.chars().count() > MAX_SECRET_LEN {
        return Err(CredentialError::InvalidSecret(format!(
            "the key exceeds {MAX_SECRET_LEN} characters"
        )));
    }
    if trimmed.chars().any(char::is_control) {
        return Err(CredentialError::InvalidSecret(
            "the key contains control characters".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

/// The production adapter, backed by the OS credential store via `keyring`.
pub struct OsCredentialStore {
    service: String,
}

impl OsCredentialStore {
    pub fn new() -> Self {
        OsCredentialStore {
            service: service_name(),
        }
    }

    fn entry(&self, provider: CredentialProvider) -> Result<keyring::Entry, CredentialError> {
        keyring::Entry::new(&self.service, provider.account()).map_err(map_keyring_error)
    }
}

impl Default for OsCredentialStore {
    fn default() -> Self {
        Self::new()
    }
}

impl CredentialStore for OsCredentialStore {
    fn set(&self, provider: CredentialProvider, secret: &str) -> Result<(), CredentialError> {
        let clean = sanitize_secret(secret)?;
        let entry = self.entry(provider)?;
        entry.set_password(&clean).map_err(map_keyring_error)?;
        // Read-back verification: never report success on a write we can't confirm.
        match entry.get_password() {
            Ok(stored) if stored == clean => Ok(()),
            Ok(_) => Err(CredentialError::VerificationFailed),
            Err(error) => Err(map_keyring_error(error)),
        }
    }

    fn get(&self, provider: CredentialProvider) -> Result<Option<SecretString>, CredentialError> {
        match self.entry(provider)?.get_password() {
            Ok(value) => Ok(Some(SecretString::new(value))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(map_keyring_error(error)),
        }
    }

    fn delete(&self, provider: CredentialProvider) -> Result<(), CredentialError> {
        match self.entry(provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(map_keyring_error(error)),
        }
    }
}

/// Maps `keyring` errors into the app's categorized [`CredentialError`] without
/// ever surfacing a secret value (keyring errors never contain the password).
fn map_keyring_error(error: keyring::Error) -> CredentialError {
    match error {
        keyring::Error::NoStorageAccess(inner) => CredentialError::AccessDenied(inner.to_string()),
        keyring::Error::PlatformFailure(inner) => CredentialError::Unavailable(inner.to_string()),
        keyring::Error::NoEntry => {
            CredentialError::Unexpected("credential entry not found".to_string())
        }
        keyring::Error::Invalid(field, reason) => {
            CredentialError::InvalidSecret(format!("{field}: {reason}"))
        }
        other => CredentialError::Unexpected(other.to_string()),
    }
}

/// Production credential service name, suffixed `.dev` in debug builds so
/// development runs never read or clobber a shipped install's stored keys.
fn service_name() -> String {
    if cfg!(debug_assertions) {
        format!("{CREDENTIAL_SERVICE}.dev")
    } else {
        CREDENTIAL_SERVICE.to_string()
    }
}

/// Outcome of migrating one provider's legacy plaintext key. Drives the UI
/// state and whether the plaintext field may be removed from settings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrationOutcome {
    /// No legacy plaintext value existed; nothing to do.
    NothingToDo,
    /// A secure key already existed; the legacy plaintext may be removed.
    AlreadySecured,
    /// The legacy value was securely stored and read back; remove the plaintext.
    Migrated,
    /// Secure storage failed. The plaintext is intentionally retained for
    /// recoverability; the provider's cloud key stays disabled until retry.
    Failed(String),
}

impl MigrationOutcome {
    /// Whether the legacy plaintext field is now safe to delete from settings.
    pub fn should_remove_legacy(&self) -> bool {
        matches!(
            self,
            MigrationOutcome::AlreadySecured | MigrationOutcome::Migrated
        )
    }
}

/// Idempotently migrates one provider's legacy plaintext key into the OS store.
/// Safe to re-run after a crash: it never deletes a legacy value before a secure
/// copy is stored and read back, and it never overwrites an existing secure key.
pub fn migrate_legacy_secret(
    store: &dyn CredentialStore,
    provider: CredentialProvider,
    legacy_plaintext: Option<&str>,
) -> MigrationOutcome {
    let legacy = match legacy_plaintext
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => value,
        None => return MigrationOutcome::NothingToDo,
    };

    // An existing secure key always wins; the plaintext is now redundant.
    match store.get(provider) {
        Ok(Some(_)) => return MigrationOutcome::AlreadySecured,
        Ok(None) => {}
        Err(error) => return MigrationOutcome::Failed(error.to_string()),
    }

    // `set` already verifies with a read-back, so success means the secure copy
    // exists and matches. Only then is the caller told to drop the plaintext.
    match store.set(provider, legacy) {
        Ok(()) => MigrationOutcome::Migrated,
        Err(error) => MigrationOutcome::Failed(error.to_string()),
    }
}

/// In-memory credential store for tests: a deterministic adapter with hooks to
/// simulate an unavailable backend and a corrupt read-back.
#[cfg(test)]
pub struct InMemoryCredentialStore {
    entries: Mutex<HashMap<&'static str, String>>,
    unavailable: Mutex<bool>,
    corrupt_readback: Mutex<bool>,
}

#[cfg(test)]
impl InMemoryCredentialStore {
    pub fn new() -> Self {
        InMemoryCredentialStore {
            entries: Mutex::new(HashMap::new()),
            unavailable: Mutex::new(false),
            corrupt_readback: Mutex::new(false),
        }
    }

    pub fn set_unavailable(&self, value: bool) {
        *self.unavailable.lock().unwrap() = value;
    }

    /// Makes the next `set` store a value that does not match what was written,
    /// so read-back verification fails.
    pub fn set_corrupt_readback(&self, value: bool) {
        *self.corrupt_readback.lock().unwrap() = value;
    }
}

#[cfg(test)]
impl CredentialStore for InMemoryCredentialStore {
    fn set(&self, provider: CredentialProvider, secret: &str) -> Result<(), CredentialError> {
        if *self.unavailable.lock().unwrap() {
            return Err(CredentialError::Unavailable("test backend off".to_string()));
        }
        let clean = sanitize_secret(secret)?;
        let stored = if *self.corrupt_readback.lock().unwrap() {
            format!("{clean}-corrupt")
        } else {
            clean.clone()
        };
        self.entries
            .lock()
            .unwrap()
            .insert(provider.account(), stored);
        match self.get(provider)? {
            Some(value) if value.expose() == clean => Ok(()),
            _ => Err(CredentialError::VerificationFailed),
        }
    }

    fn get(&self, provider: CredentialProvider) -> Result<Option<SecretString>, CredentialError> {
        if *self.unavailable.lock().unwrap() {
            return Err(CredentialError::Unavailable("test backend off".to_string()));
        }
        Ok(self
            .entries
            .lock()
            .unwrap()
            .get(provider.account())
            .map(|value| SecretString::new(value.clone())))
    }

    fn delete(&self, provider: CredentialProvider) -> Result<(), CredentialError> {
        if *self.unavailable.lock().unwrap() {
            return Err(CredentialError::Unavailable("test backend off".to_string()));
        }
        self.entries.lock().unwrap().remove(provider.account());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_string_redacts_debug_output() {
        let secret = SecretString::new("super-secret-key");
        assert_eq!(format!("{secret:?}"), "SecretString(<redacted>)");
        assert!(!format!("{secret:?}").contains("super-secret-key"));
        assert_eq!(secret.expose(), "super-secret-key");
    }

    #[test]
    fn set_get_delete_roundtrip_per_provider() {
        let store = InMemoryCredentialStore::new();
        assert!(store.get(CredentialProvider::Groq).unwrap().is_none());

        store.set(CredentialProvider::Groq, "groq-key").unwrap();
        store.set(CredentialProvider::Gemini, "gemini-key").unwrap();
        store
            .set(CredentialProvider::SyncBearer, "sync-bearer")
            .unwrap();
        assert_eq!(
            store
                .get(CredentialProvider::Groq)
                .unwrap()
                .unwrap()
                .expose(),
            "groq-key"
        );
        // Providers never collide.
        assert_eq!(
            store
                .get(CredentialProvider::Gemini)
                .unwrap()
                .unwrap()
                .expose(),
            "gemini-key"
        );
        assert_eq!(
            store
                .get(CredentialProvider::SyncBearer)
                .unwrap()
                .unwrap()
                .expose(),
            "sync-bearer"
        );

        store.delete(CredentialProvider::Groq).unwrap();
        assert!(store.get(CredentialProvider::Groq).unwrap().is_none());
        // Deleting one leaves the other intact.
        assert!(store.get(CredentialProvider::Gemini).unwrap().is_some());
        assert!(store.get(CredentialProvider::SyncBearer).unwrap().is_some());
    }

    #[test]
    fn development_and_production_service_names_differ() {
        // The compiled-in name depends on the build profile; assert the two
        // possible values can never be equal so dev and prod keys never mix.
        let prod = CREDENTIAL_SERVICE.to_string();
        let dev = format!("{CREDENTIAL_SERVICE}.dev");
        assert_ne!(prod, dev);
        assert!(service_name() == prod || service_name() == dev);
    }

    #[test]
    fn set_trims_and_rejects_empty_or_oversized() {
        let store = InMemoryCredentialStore::new();
        store
            .set(CredentialProvider::Groq, "  spaced-key  ")
            .unwrap();
        assert_eq!(
            store
                .get(CredentialProvider::Groq)
                .unwrap()
                .unwrap()
                .expose(),
            "spaced-key"
        );
        assert!(matches!(
            store.set(CredentialProvider::Groq, "   "),
            Err(CredentialError::InvalidSecret(_))
        ));
        let huge = "a".repeat(MAX_SECRET_LEN + 1);
        assert!(matches!(
            store.set(CredentialProvider::Groq, &huge),
            Err(CredentialError::InvalidSecret(_))
        ));
    }

    #[test]
    fn unavailable_backend_is_categorized_not_treated_as_missing() {
        let store = InMemoryCredentialStore::new();
        store.set_unavailable(true);
        assert!(matches!(
            store.get(CredentialProvider::Groq),
            Err(CredentialError::Unavailable(_))
        ));
    }

    #[test]
    fn read_back_mismatch_reports_verification_failure() {
        let store = InMemoryCredentialStore::new();
        store.set_corrupt_readback(true);
        assert!(matches!(
            store.set(CredentialProvider::Groq, "key"),
            Err(CredentialError::VerificationFailed)
        ));
    }

    #[test]
    fn migration_of_plaintext_only_key_stores_securely() {
        let store = InMemoryCredentialStore::new();
        let outcome = migrate_legacy_secret(&store, CredentialProvider::Groq, Some("legacy-key"));
        assert_eq!(outcome, MigrationOutcome::Migrated);
        assert!(outcome.should_remove_legacy());
        assert_eq!(
            store
                .get(CredentialProvider::Groq)
                .unwrap()
                .unwrap()
                .expose(),
            "legacy-key"
        );
    }

    #[test]
    fn migration_is_noop_without_a_legacy_value() {
        let store = InMemoryCredentialStore::new();
        assert_eq!(
            migrate_legacy_secret(&store, CredentialProvider::Groq, None),
            MigrationOutcome::NothingToDo
        );
        assert_eq!(
            migrate_legacy_secret(&store, CredentialProvider::Groq, Some("   ")),
            MigrationOutcome::NothingToDo
        );
    }

    #[test]
    fn existing_secure_key_wins_and_legacy_may_be_removed() {
        let store = InMemoryCredentialStore::new();
        store.set(CredentialProvider::Gemini, "secure-key").unwrap();
        let outcome = migrate_legacy_secret(&store, CredentialProvider::Gemini, Some("legacy-key"));
        assert_eq!(outcome, MigrationOutcome::AlreadySecured);
        assert!(outcome.should_remove_legacy());
        // The secure key is untouched — the legacy value never overwrites it.
        assert_eq!(
            store
                .get(CredentialProvider::Gemini)
                .unwrap()
                .unwrap()
                .expose(),
            "secure-key"
        );
    }

    #[test]
    fn store_failure_retains_legacy_and_reports_failure() {
        let store = InMemoryCredentialStore::new();
        store.set_unavailable(true);
        let outcome = migrate_legacy_secret(&store, CredentialProvider::Groq, Some("legacy-key"));
        assert!(matches!(outcome, MigrationOutcome::Failed(_)));
        assert!(!outcome.should_remove_legacy());
    }

    #[test]
    fn read_back_failure_during_migration_retains_legacy() {
        let store = InMemoryCredentialStore::new();
        store.set_corrupt_readback(true);
        let outcome = migrate_legacy_secret(&store, CredentialProvider::Groq, Some("legacy-key"));
        assert!(matches!(outcome, MigrationOutcome::Failed(_)));
        assert!(!outcome.should_remove_legacy());
    }

    #[test]
    fn migration_is_idempotent_across_retries() {
        let store = InMemoryCredentialStore::new();
        let first = migrate_legacy_secret(&store, CredentialProvider::Groq, Some("legacy-key"));
        assert_eq!(first, MigrationOutcome::Migrated);
        // A second run (e.g. after a crash before the plaintext was removed)
        // finds the secure key and reports it as already secured, not a dup.
        let second = migrate_legacy_secret(&store, CredentialProvider::Groq, Some("legacy-key"));
        assert_eq!(second, MigrationOutcome::AlreadySecured);
    }

    #[test]
    fn one_provider_may_migrate_while_the_other_retries() {
        let store = FlakyStore::new();
        // Groq stores fine; Gemini's backend is down.
        store.fail_provider(CredentialProvider::Gemini);
        assert_eq!(
            migrate_legacy_secret(&store, CredentialProvider::Groq, Some("groq-key")),
            MigrationOutcome::Migrated
        );
        assert!(matches!(
            migrate_legacy_secret(&store, CredentialProvider::Gemini, Some("gemini-key")),
            MigrationOutcome::Failed(_)
        ));
    }

    /// A store that fails for one specific provider, to prove per-provider
    /// migration independence.
    struct FlakyStore {
        inner: InMemoryCredentialStore,
        failing: Mutex<Option<&'static str>>,
    }

    impl FlakyStore {
        fn new() -> Self {
            FlakyStore {
                inner: InMemoryCredentialStore::new(),
                failing: Mutex::new(None),
            }
        }
        fn fail_provider(&self, provider: CredentialProvider) {
            *self.failing.lock().unwrap() = Some(provider.account());
        }
        fn is_failing(&self, provider: CredentialProvider) -> bool {
            *self.failing.lock().unwrap() == Some(provider.account())
        }
    }

    impl CredentialStore for FlakyStore {
        fn set(&self, provider: CredentialProvider, secret: &str) -> Result<(), CredentialError> {
            if self.is_failing(provider) {
                return Err(CredentialError::Unavailable("down".to_string()));
            }
            self.inner.set(provider, secret)
        }
        fn get(
            &self,
            provider: CredentialProvider,
        ) -> Result<Option<SecretString>, CredentialError> {
            if self.is_failing(provider) {
                return Err(CredentialError::Unavailable("down".to_string()));
            }
            self.inner.get(provider)
        }
        fn delete(&self, provider: CredentialProvider) -> Result<(), CredentialError> {
            self.inner.delete(provider)
        }
    }
}
