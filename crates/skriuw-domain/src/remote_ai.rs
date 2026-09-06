use std::fmt;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{AiProviderError, AiProviderErrorCategory, AiRecoveryAction};

pub const MIN_AI_API_KEY_BYTES: usize = 8;
pub const MAX_AI_API_KEY_BYTES: usize = 4_096;
pub const MAX_REMOTE_AI_LABEL_BYTES: usize = 128;
pub const MAX_REMOTE_AI_CATALOG_MODELS: usize = 256;
pub const MAX_REMOTE_AI_CONTEXT_TOKENS: u32 = 16 * 1_024 * 1_024;
pub const MAX_REMOTE_AI_PRICE_MICROS: u64 = 1_000_000_000;

/// The disclosure the user accepts before a provider may receive a request.
/// Raise this whenever the disclosed destination, transmitted data, or
/// retention statement changes materially; stored consent below this version
/// stops authorising requests.
pub const REMOTE_AI_DISCLOSURE_VERSION: u32 = 1;

/// A remote provider credential in transit between the native credential store
/// and the provider adapter that spends it. The value never derives `Clone`,
/// `Serialize`, or a revealing `Debug`, is zeroed when dropped, and has no
/// accessor other than [`AiCredential::expose`] so every read is greppable.
pub struct AiCredential(Vec<u8>);

impl AiCredential {
    pub fn new(value: impl AsRef<str>) -> Result<Self, AiCredentialError> {
        let value = value.as_ref();
        if value.len() < MIN_AI_API_KEY_BYTES
            || value.len() > MAX_AI_API_KEY_BYTES
            || !value.bytes().all(|byte| byte.is_ascii_graphic())
        {
            return Err(AiCredentialError::Invalid);
        }
        Ok(Self(value.as_bytes().to_vec()))
    }

    /// Construction accepts only printable ASCII, so the stored bytes are
    /// always valid UTF-8 and no key can leak through a decoding failure.
    #[must_use]
    pub fn expose(&self) -> &str {
        std::str::from_utf8(&self.0).unwrap_or_default()
    }
}

impl fmt::Debug for AiCredential {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("AiCredential(<redacted>)")
    }
}

impl Drop for AiCredential {
    fn drop(&mut self) {
        // Overwriting in place keeps the allocation the provider adapter used,
        // so the key bytes are not left readable in freed heap memory.
        self.0.fill(0);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum AiCredentialError {
    #[error("no credential is configured for this provider")]
    Missing,
    #[error("the stored credential is not a usable API key")]
    Invalid,
    #[error("the system keyring is locked")]
    VaultLocked,
    #[error("no system keyring is available")]
    VaultUnavailable,
    #[error("this provider has no accepted privacy disclosure")]
    ConsentRequired,
    #[error("this provider's privacy disclosure changed and needs review")]
    ConsentStale,
}

impl AiCredentialError {
    #[must_use]
    pub fn into_provider_error(self, provider_id: &str) -> AiProviderError {
        let (category, recovery_action) = match self {
            Self::Missing | Self::ConsentRequired | Self::ConsentStale => (
                AiProviderErrorCategory::MissingCredential,
                AiRecoveryAction::ConfigureCredential,
            ),
            Self::Invalid => (
                AiProviderErrorCategory::InvalidCredential,
                AiRecoveryAction::ConfigureCredential,
            ),
            Self::VaultLocked | Self::VaultUnavailable => (
                AiProviderErrorCategory::MissingCredential,
                AiRecoveryAction::ConfigureCredential,
            ),
        };
        AiProviderError::new(provider_id, category, &self.to_string(), recovery_action)
    }
}

/// The narrow native capability a remote provider adapter uses to obtain a key
/// for one consented request. Implementations are responsible for refusing
/// providers whose current disclosure has not been accepted, so an adapter
/// cannot reach the network before consent exists.
pub trait AiCredentialSource: Send + Sync {
    fn resolve(&self, provider_id: &str) -> Result<AiCredential, AiCredentialError>;
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteAiModel {
    pub provider_id: String,
    pub model_id: String,
    pub label: String,
    pub context_window_tokens: u32,
    pub input_price_micros_per_mtok: u64,
    pub output_price_micros_per_mtok: u64,
}

/// The repository-owned remote model catalog. Prices are integer micro-dollars
/// per million tokens so the contract carries no floating-point money, and
/// `pricing_as_of` lets the settings surface admit how old the figures are
/// instead of implying live pricing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteAiCatalog {
    pub version: u32,
    pub pricing_as_of: String,
    pub models: Vec<RemoteAiModel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum RemoteAiCatalogError {
    #[error("remote model catalog version must be at least 1")]
    UnversionedCatalog,
    #[error("remote model catalog must list between 1 and {maximum} models")]
    InvalidModelCount { maximum: usize },
    #[error("remote model catalog entry {index} has an invalid {field}")]
    InvalidModel { index: usize, field: &'static str },
    #[error("remote model catalog lists {provider_id}/{model_id} twice")]
    DuplicateModel {
        provider_id: String,
        model_id: String,
    },
}

impl RemoteAiCatalog {
    pub fn validate(&self) -> Result<(), RemoteAiCatalogError> {
        if self.version == 0 {
            return Err(RemoteAiCatalogError::UnversionedCatalog);
        }
        if !valid_label(&self.pricing_as_of) {
            return Err(RemoteAiCatalogError::InvalidModel {
                index: 0,
                field: "pricing date",
            });
        }
        if self.models.is_empty() || self.models.len() > MAX_REMOTE_AI_CATALOG_MODELS {
            return Err(RemoteAiCatalogError::InvalidModelCount {
                maximum: MAX_REMOTE_AI_CATALOG_MODELS,
            });
        }
        let mut seen = Vec::with_capacity(self.models.len());
        for (index, model) in self.models.iter().enumerate() {
            let invalid = |field| RemoteAiCatalogError::InvalidModel { index, field };
            if !valid_provider_identifier(&model.provider_id) {
                return Err(invalid("provider id"));
            }
            if !valid_provider_identifier(&model.model_id) {
                return Err(invalid("model id"));
            }
            if !valid_label(&model.label) {
                return Err(invalid("label"));
            }
            if model.context_window_tokens == 0
                || model.context_window_tokens > MAX_REMOTE_AI_CONTEXT_TOKENS
            {
                return Err(invalid("context window"));
            }
            if model.input_price_micros_per_mtok > MAX_REMOTE_AI_PRICE_MICROS
                || model.output_price_micros_per_mtok > MAX_REMOTE_AI_PRICE_MICROS
            {
                return Err(invalid("price"));
            }
            let key = (model.provider_id.as_str(), model.model_id.as_str());
            if seen.contains(&key) {
                return Err(RemoteAiCatalogError::DuplicateModel {
                    provider_id: model.provider_id.clone(),
                    model_id: model.model_id.clone(),
                });
            }
            seen.push(key);
        }
        Ok(())
    }

    #[must_use]
    pub fn models_for(&self, provider_id: &str) -> Vec<&RemoteAiModel> {
        self.models
            .iter()
            .filter(|model| model.provider_id == provider_id)
            .collect()
    }
}

/// Whether a listed model comes from the repository-owned catalog or was
/// fetched from the provider's model-listing endpoint with the user's key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteAiModelSource {
    Catalog,
    Fetched,
}

/// One model a remote provider can serve. Catalog entries carry the shipped
/// pricing; fetched entries carry only what the provider's listing reports, so
/// their prices stay absent rather than guessed and runs on them go unpriced.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteAiModelListing {
    pub provider_id: String,
    pub model_id: String,
    pub label: String,
    pub context_window_tokens: Option<u32>,
    pub input_price_micros_per_mtok: Option<u64>,
    pub output_price_micros_per_mtok: Option<u64>,
    pub source: RemoteAiModelSource,
}

impl RemoteAiModelListing {
    pub fn validate(&self) -> Result<(), RemoteAiCatalogError> {
        let invalid = |field| RemoteAiCatalogError::InvalidModel { index: 0, field };
        if !valid_provider_identifier(&self.provider_id) {
            return Err(invalid("provider id"));
        }
        if !valid_provider_identifier(&self.model_id) {
            return Err(invalid("model id"));
        }
        if !valid_label(&self.label) {
            return Err(invalid("label"));
        }
        if let Some(window) = self.context_window_tokens
            && (window == 0 || window > MAX_REMOTE_AI_CONTEXT_TOKENS)
        {
            return Err(invalid("context window"));
        }
        for price in [
            self.input_price_micros_per_mtok,
            self.output_price_micros_per_mtok,
        ]
        .into_iter()
        .flatten()
        {
            if price > MAX_REMOTE_AI_PRICE_MICROS {
                return Err(invalid("price"));
            }
        }
        Ok(())
    }
}

impl From<&RemoteAiModel> for RemoteAiModelListing {
    fn from(model: &RemoteAiModel) -> Self {
        Self {
            provider_id: model.provider_id.clone(),
            model_id: model.model_id.clone(),
            label: model.label.clone(),
            context_window_tokens: Some(model.context_window_tokens),
            input_price_micros_per_mtok: Some(model.input_price_micros_per_mtok),
            output_price_micros_per_mtok: Some(model.output_price_micros_per_mtok),
            source: RemoteAiModelSource::Catalog,
        }
    }
}

/// Every remote model the renderer may offer: the shipped catalog merged with
/// the models each provider reported for the user's key. A fetched model that
/// the catalog already lists keeps its catalog entry, so shipped pricing and
/// labels always win.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteAiModelDirectory {
    pub pricing_as_of: String,
    pub models: Vec<RemoteAiModelListing>,
}

impl RemoteAiModelDirectory {
    #[must_use]
    pub fn merge(catalog: &RemoteAiCatalog, fetched: &[RemoteAiModelListing]) -> Self {
        let mut models: Vec<RemoteAiModelListing> = catalog
            .models
            .iter()
            .map(RemoteAiModelListing::from)
            .collect();
        for listing in fetched {
            if listing.validate().is_err() || listing.source != RemoteAiModelSource::Fetched {
                continue;
            }
            let known = models.iter().any(|model| {
                model.provider_id == listing.provider_id && model.model_id == listing.model_id
            });
            if !known {
                models.push(listing.clone());
            }
        }
        Self {
            pricing_as_of: catalog.pricing_as_of.clone(),
            models,
        }
    }

    #[must_use]
    pub fn contains(&self, provider_id: &str, model_id: &str) -> bool {
        self.models
            .iter()
            .any(|model| model.provider_id == provider_id && model.model_id == model_id)
    }
}

/// Where a device can persist remote provider keys. Detection runs only when
/// the opt-in-gated provider settings surface asks for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum CredentialVaultState {
    VaultOk,
    VaultLocked,
    VaultNoCollection,
    VaultAbsent,
    VaultBlocked,
}

impl CredentialVaultState {
    #[must_use]
    pub fn accepts_new_keys(self) -> bool {
        matches!(self, Self::VaultOk | Self::VaultNoCollection)
    }

    /// Whether a stored key can already exist in this vault. A locked vault
    /// counts: it may hold a key that the lock prevents Skriuw from reading or
    /// deleting. The remaining states have nowhere for a key to live, so a
    /// vault operation they refuse cannot have left key material behind.
    #[must_use]
    pub fn may_hold_keys(self) -> bool {
        matches!(self, Self::VaultOk | Self::VaultLocked)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CredentialVaultDetection {
    pub state: CredentialVaultState,
    pub detail: Option<String>,
}

/// The tier holding a provider key right now. `SessionOnly` keys live in
/// Rust-side memory until the process exits and are never written to disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteAiKeyTier {
    Vault,
    SessionOnly,
}

/// Everything the renderer may learn about a remote provider. There is no key
/// field and no way to read a stored key back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteAiProviderState {
    pub provider_id: String,
    pub label: String,
    /// The host every request to this provider reaches. The disclosure names it,
    /// so it is carried here instead of restated by the settings surface.
    pub destination: String,
    pub key_tier: Option<RemoteAiKeyTier>,
    pub accepted_disclosure_version: Option<u32>,
    pub current_disclosure_version: u32,
    /// Whether the provider publishes a model-listing endpoint. When false the
    /// settings surface offers no "Refresh models" action for it.
    pub supports_model_listing: bool,
}

impl RemoteAiProviderState {
    #[must_use]
    pub fn has_key(&self) -> bool {
        self.key_tier.is_some()
    }

    #[must_use]
    pub fn consent_is_current(&self) -> bool {
        self.accepted_disclosure_version == Some(self.current_disclosure_version)
    }

    #[must_use]
    pub fn can_complete(&self) -> bool {
        self.has_key() && self.consent_is_current()
    }
}

/// The device-local consent record. It is native device state: it must not
/// enter the workspace settings document, archives, exports, or sync payloads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteAiConsent {
    pub provider_id: String,
    pub accepted_disclosure_version: u32,
}

impl RemoteAiConsent {
    #[must_use]
    pub fn authorises(&self, provider_id: &str) -> bool {
        self.provider_id == provider_id
            && self.accepted_disclosure_version == REMOTE_AI_DISCLOSURE_VERSION
    }
}

/// Catalog identifiers become URL path segments in a provider adapter, so they
/// accept the domain identifier alphabet minus every traversal-shaped segment.
fn valid_provider_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= crate::MAX_AI_IDENTIFIER_BYTES
        && !value.starts_with('/')
        && value
            .split('/')
            .all(|segment| !segment.is_empty() && !matches!(segment, "." | ".."))
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
        })
}

fn valid_label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_REMOTE_AI_LABEL_BYTES
        && !value.chars().any(char::is_control)
}

#[cfg(test)]
mod tests {
    use super::{
        AiCredential, AiCredentialError, CredentialVaultState, MAX_AI_API_KEY_BYTES,
        REMOTE_AI_DISCLOSURE_VERSION, RemoteAiCatalog, RemoteAiCatalogError, RemoteAiConsent,
        RemoteAiKeyTier, RemoteAiModel, RemoteAiProviderState,
    };
    use crate::{AiProviderErrorCategory, AiRecoveryAction};

    fn model(provider_id: &str, model_id: &str) -> RemoteAiModel {
        RemoteAiModel {
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            label: "Test model".into(),
            context_window_tokens: 131_072,
            input_price_micros_per_mtok: 590_000,
            output_price_micros_per_mtok: 790_000,
        }
    }

    fn catalog(models: Vec<RemoteAiModel>) -> RemoteAiCatalog {
        RemoteAiCatalog {
            version: 1,
            pricing_as_of: "2026-08-01".into(),
            models,
        }
    }

    #[test]
    fn bounds_api_keys_before_they_reach_a_provider() {
        assert!(AiCredential::new("sk-test-credential").is_ok());
        for rejected in [
            "short",
            "has whitespace inside",
            "trailing-newline\n",
            "unicodé-credential",
            &"x".repeat(MAX_AI_API_KEY_BYTES + 1),
        ] {
            assert_eq!(
                AiCredential::new(rejected).err(),
                Some(AiCredentialError::Invalid),
                "expected {rejected:?} to be refused"
            );
        }
    }

    #[test]
    fn never_renders_a_key_through_debug() {
        let credential = AiCredential::new("sk-secret-value").expect("credential");

        assert_eq!(format!("{credential:?}"), "AiCredential(<redacted>)");
        assert_eq!(credential.expose(), "sk-secret-value");
    }

    #[test]
    fn projects_credential_failures_onto_actionable_provider_errors() {
        let missing = AiCredentialError::Missing.into_provider_error("groq");
        assert_eq!(missing.category, AiProviderErrorCategory::MissingCredential);
        assert_eq!(
            missing.recovery_action,
            AiRecoveryAction::ConfigureCredential
        );

        let invalid = AiCredentialError::Invalid.into_provider_error("gemini");
        assert_eq!(invalid.category, AiProviderErrorCategory::InvalidCredential);

        let stale = AiCredentialError::ConsentStale.into_provider_error("gemini");
        assert_eq!(stale.category, AiProviderErrorCategory::MissingCredential);
        assert!(!stale.message.is_empty());
    }

    #[test]
    fn validates_the_repository_owned_catalogue() {
        assert_eq!(catalog(vec![model("groq", "a")]).validate(), Ok(()));
        assert!(matches!(
            catalog(Vec::new()).validate(),
            Err(RemoteAiCatalogError::InvalidModelCount { .. })
        ));
        assert!(matches!(
            catalog(vec![model("groq", "a"), model("groq", "a")]).validate(),
            Err(RemoteAiCatalogError::DuplicateModel { .. })
        ));

        let mut traversal = catalog(vec![model("groq", "a")]);
        traversal.models[0].model_id = "../secret".into();
        assert!(matches!(
            traversal.validate(),
            Err(RemoteAiCatalogError::InvalidModel { .. })
        ));

        let mut window = catalog(vec![model("groq", "a")]);
        window.models[0].context_window_tokens = 0;
        assert!(matches!(
            window.validate(),
            Err(RemoteAiCatalogError::InvalidModel { .. })
        ));
    }

    #[test]
    fn selects_only_the_requested_provider_models() {
        let catalog = catalog(vec![
            model("groq", "a"),
            model("gemini", "b"),
            model("groq", "c"),
        ]);

        let groq = catalog.models_for("groq");

        assert_eq!(groq.len(), 2);
        assert!(groq.iter().all(|model| model.provider_id == "groq"));
    }

    #[test]
    fn requires_a_key_and_current_consent_before_completion() {
        let mut state = RemoteAiProviderState {
            provider_id: "groq".into(),
            label: "Groq".into(),
            destination: "api.groq.com".into(),
            key_tier: None,
            accepted_disclosure_version: None,
            current_disclosure_version: REMOTE_AI_DISCLOSURE_VERSION,
            supports_model_listing: true,
        };
        assert!(!state.can_complete());

        state.key_tier = Some(RemoteAiKeyTier::Vault);
        assert!(!state.can_complete());

        state.accepted_disclosure_version = Some(REMOTE_AI_DISCLOSURE_VERSION - 1);
        assert!(!state.consent_is_current());

        state.accepted_disclosure_version = Some(REMOTE_AI_DISCLOSURE_VERSION);
        assert!(state.can_complete());
    }

    #[test]
    fn only_the_current_disclosure_authorises_a_provider() {
        let accepted = RemoteAiConsent {
            provider_id: "gemini".into(),
            accepted_disclosure_version: REMOTE_AI_DISCLOSURE_VERSION,
        };

        assert!(accepted.authorises("gemini"));
        assert!(!accepted.authorises("groq"));
        assert!(
            !RemoteAiConsent {
                provider_id: "gemini".into(),
                accepted_disclosure_version: REMOTE_AI_DISCLOSURE_VERSION + 1,
            }
            .authorises("gemini")
        );
    }

    fn fetched(provider_id: &str, model_id: &str) -> super::RemoteAiModelListing {
        super::RemoteAiModelListing {
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            label: model_id.into(),
            context_window_tokens: Some(131_072),
            input_price_micros_per_mtok: None,
            output_price_micros_per_mtok: None,
            source: super::RemoteAiModelSource::Fetched,
        }
    }

    #[test]
    fn merges_fetched_models_after_the_catalog_without_duplicating_entries() {
        let directory = super::RemoteAiModelDirectory::merge(
            &catalog(vec![model("groq", "a")]),
            &[fetched("groq", "a"), fetched("groq", "b")],
        );

        assert_eq!(directory.pricing_as_of, "2026-08-01");
        assert_eq!(directory.models.len(), 2);
        assert_eq!(
            directory.models[0].source,
            super::RemoteAiModelSource::Catalog,
            "the priced catalog entry must win over the fetched duplicate"
        );
        assert!(directory.models[0].input_price_micros_per_mtok.is_some());
        assert_eq!(directory.models[1].model_id, "b");
        assert_eq!(directory.models[1].input_price_micros_per_mtok, None);
        assert!(directory.contains("groq", "b"));
        assert!(!directory.contains("gemini", "b"));
    }

    #[test]
    fn merge_drops_invalid_or_mislabelled_fetched_entries() {
        let mut traversal = fetched("groq", "ok");
        traversal.model_id = "../secret".into();
        let mut fake_catalog_entry = fetched("groq", "self-priced");
        fake_catalog_entry.source = super::RemoteAiModelSource::Catalog;

        let directory = super::RemoteAiModelDirectory::merge(
            &catalog(vec![model("groq", "a")]),
            &[traversal, fake_catalog_entry],
        );

        assert_eq!(directory.models.len(), 1);
    }

    #[test]
    fn validates_fetched_listings_with_the_catalog_bounds() {
        assert_eq!(fetched("groq", "a").validate(), Ok(()));

        let mut window = fetched("groq", "a");
        window.context_window_tokens = Some(0);
        assert!(window.validate().is_err());

        let mut price = fetched("groq", "a");
        price.input_price_micros_per_mtok = Some(super::MAX_REMOTE_AI_PRICE_MICROS + 1);
        assert!(price.validate().is_err());

        let mut absent = fetched("groq", "a");
        absent.context_window_tokens = None;
        assert_eq!(absent.validate(), Ok(()));
    }

    #[test]
    fn refuses_new_keys_when_no_usable_vault_exists() {
        assert!(CredentialVaultState::VaultOk.accepts_new_keys());
        assert!(CredentialVaultState::VaultNoCollection.accepts_new_keys());
        assert!(!CredentialVaultState::VaultLocked.accepts_new_keys());
        assert!(!CredentialVaultState::VaultAbsent.accepts_new_keys());
        assert!(!CredentialVaultState::VaultBlocked.accepts_new_keys());
    }

    #[test]
    fn only_a_reachable_vault_can_still_hold_key_material() {
        assert!(CredentialVaultState::VaultOk.may_hold_keys());
        assert!(
            CredentialVaultState::VaultLocked.may_hold_keys(),
            "a locked vault can hold a key that cannot be deleted yet"
        );
        assert!(!CredentialVaultState::VaultNoCollection.may_hold_keys());
        assert!(!CredentialVaultState::VaultAbsent.may_hold_keys());
        assert!(!CredentialVaultState::VaultBlocked.may_hold_keys());
    }
}
