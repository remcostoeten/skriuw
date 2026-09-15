//! Skriuw's remote provider surface.
//!
//! The adapters, descriptors, credential port and model-listing contract were
//! extracted into `ai-providers`. What remains here is the part the SDK
//! deliberately does not own: the repository catalogue, the authority derived
//! from it, Skriuw's user agent, and the projection from the SDK's listing type
//! onto the renderer contract.

mod transcribe;

use std::sync::Arc;

use skriuw_domain::{
    RemoteAiCatalog, RemoteAiCatalogError, RemoteAiModelListing, RemoteAiModelSource,
};

pub use ai_providers::{
    AIMLAPI_PROVIDER_ID, AiModelAuthority as RemoteAiModelAuthority, AiModelListing,
    DASHSCOPE_PROVIDER_ID, DEEPSEEK_PROVIDER_ID, GEMINI_PROVIDER_ID, GROQ_PROVIDER_ID,
    MOONSHOT_PROVIDER_ID, RemoteAiProvider, RemoteAiSetupError, RemoteProviderKind,
    ZAI_PROVIDER_ID,
};

pub use transcribe::{RemoteAiTranscriber, ai_transcription_models};

const CATALOG_SOURCE: &str = include_str!("../models.json");

/// The identity Skriuw sends to every remote provider. The SDK has none of its
/// own, so this preserves the requests the extraction replaced byte for byte.
pub const USER_AGENT: &str = "Skriuw";

/// Parses and validates the repository-owned remote model catalog. There is no
/// discovery request: refreshing the catalog re-reads this embedded document.
pub fn remote_ai_catalog() -> Result<RemoteAiCatalog, RemoteAiCatalogError> {
    let catalog: RemoteAiCatalog = serde_json::from_str(CATALOG_SOURCE)
        .map_err(|_| RemoteAiCatalogError::UnversionedCatalog)?;
    catalog.validate()?;
    Ok(catalog)
}

/// The models the shipped catalogue alone permits. Surfaces that have not
/// fetched a provider's own listing use this; the application widens it with
/// its fetched-model store.
pub struct CatalogModelAuthority;

impl RemoteAiModelAuthority for CatalogModelAuthority {
    fn permits(&self, provider_id: &str, model_id: &str) -> bool {
        remote_ai_catalog().ok().is_some_and(|catalog| {
            catalog
                .models_for(provider_id)
                .iter()
                .any(|model| model.model_id == model_id)
        })
    }
}

/// Builds a provider bound to Skriuw's user agent.
///
/// # Errors
///
/// [`RemoteAiSetupError`] when the endpoint or the HTTP client cannot be built.
pub fn remote_provider(
    kind: RemoteProviderKind,
    credentials: Arc<dyn ai_providers::AiCredentialSource>,
    models: Arc<dyn RemoteAiModelAuthority>,
) -> Result<RemoteAiProvider, RemoteAiSetupError> {
    RemoteAiProvider::new(kind, credentials, models, USER_AGENT)
}

/// Projects an SDK listing onto the renderer contract. The SDK type carries the
/// same fields under different names; the wire shape the renderer reads is
/// unchanged.
#[must_use]
pub fn model_listing(listing: &AiModelListing) -> RemoteAiModelListing {
    RemoteAiModelListing {
        provider_id: listing.provider_id.clone(),
        model_id: listing.model_id.clone(),
        label: listing.label.clone(),
        context_window_tokens: listing.context_window_tokens,
        input_price_micros_per_mtok: listing.input_price_micros_per_mtok,
        output_price_micros_per_mtok: listing.output_price_micros_per_mtok,
        source: match listing.source {
            ai_providers::AiModelSource::Catalog => RemoteAiModelSource::Catalog,
            ai_providers::AiModelSource::Fetched => RemoteAiModelSource::Fetched,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CatalogModelAuthority, GROQ_PROVIDER_ID, RemoteAiModelAuthority, RemoteProviderKind,
        model_listing,
    };

    /// The catalogue is repository-owned product data, so this check stayed in
    /// Skriuw when the adapters left.
    #[test]
    fn ships_a_valid_repository_catalogue_covering_every_provider() {
        let catalog = super::remote_ai_catalog().expect("catalog");

        assert_eq!(catalog.validate(), Ok(()));
        for kind in RemoteProviderKind::ALL {
            assert!(
                !catalog.models_for(kind.id()).is_empty(),
                "no catalog model seeds provider {}",
                kind.id()
            );
        }
        assert_eq!(catalog.models_for(GROQ_PROVIDER_ID).len(), 3);
        assert!(
            catalog
                .models_for(GROQ_PROVIDER_ID)
                .iter()
                .all(|model| model.provider_id == GROQ_PROVIDER_ID)
        );
        assert!(catalog.models_for("openai").is_empty());
    }

    #[test]
    fn the_catalogue_authority_permits_exactly_what_it_ships() {
        let authority = CatalogModelAuthority;

        assert!(authority.permits(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"));
        assert!(!authority.permits(GROQ_PROVIDER_ID, "never-shipped"));
        assert!(!authority.permits("openai", "openai/gpt-oss-20b"));
    }

    /// A fetched listing must reach the renderer with its provenance and its
    /// absent prices intact: an absent price is unpriced, never free.
    #[test]
    fn projects_a_fetched_listing_without_inventing_pricing() {
        let projected = model_listing(&ai_providers::AiModelListing {
            provider_id: GROQ_PROVIDER_ID.to_owned(),
            model_id: "brand-new-model".to_owned(),
            label: "Brand new".to_owned(),
            context_window_tokens: Some(131_072),
            input_price_micros_per_mtok: None,
            output_price_micros_per_mtok: None,
            source: ai_providers::AiModelSource::Fetched,
        });

        assert_eq!(projected.model_id, "brand-new-model");
        assert_eq!(projected.context_window_tokens, Some(131_072));
        assert_eq!(projected.input_price_micros_per_mtok, None);
        assert_eq!(
            projected.source,
            skriuw_domain::RemoteAiModelSource::Fetched
        );
        assert_eq!(projected.validate(), Ok(()));
    }
}
