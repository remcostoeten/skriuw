//! Device-local store of remote models fetched from a provider with the
//! user's key. The shipped catalog stays the only source of pricing; this
//! store only widens which model ids a provider adapter may address, and every
//! persisted entry has passed domain validation, so a tampered document can
//! never put an unvalidated id into a provider URL.

use std::{
    collections::BTreeMap,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use skriuw_ai_remote::{RemoteAiModelAuthority, remote_ai_catalog};
use skriuw_domain::{
    AiProviderError, AiProviderErrorCategory, AiRecoveryAction, MAX_REMOTE_AI_CATALOG_MODELS,
    RemoteAiModelDirectory, RemoteAiModelListing, RemoteAiModelSource,
};

const MODELS_FILE: &str = "ai-models.json";
const MODELS_DOCUMENT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProviderModels {
    fetched_at_ms: i64,
    models: Vec<RemoteAiModelListing>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ModelsDocument {
    version: u32,
    #[serde(default)]
    providers: BTreeMap<String, ProviderModels>,
}

impl Default for ModelsDocument {
    fn default() -> Self {
        Self {
            version: MODELS_DOCUMENT_VERSION,
            providers: BTreeMap::new(),
        }
    }
}

pub(crate) struct FetchedModelStore {
    path: PathBuf,
    document: Mutex<Option<ModelsDocument>>,
}

impl FetchedModelStore {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            path: app_data_dir.join(MODELS_FILE),
            document: Mutex::new(None),
        }
    }

    pub(crate) fn replace(
        &self,
        provider_id: &str,
        models: Vec<RemoteAiModelListing>,
        fetched_at_ms: i64,
    ) -> Result<(), AiProviderError> {
        let mut models: Vec<RemoteAiModelListing> = models
            .into_iter()
            .filter(|listing| {
                listing.provider_id == provider_id
                    && listing.source == RemoteAiModelSource::Fetched
                    && listing.validate().is_ok()
            })
            .collect();
        models.truncate(MAX_REMOTE_AI_CATALOG_MODELS);
        let mut guard = lock(&self.document);
        let mut document = guard.take().unwrap_or_else(|| read_document(&self.path));
        document.providers.insert(
            provider_id.to_owned(),
            ProviderModels {
                fetched_at_ms,
                models,
            },
        );
        let result = write_document(&self.path, &document);
        *guard = Some(document);
        result.map_err(|_| {
            AiProviderError::new(
                provider_id,
                AiProviderErrorCategory::InternalFailure,
                "Skriuw could not record the fetched models on this device",
                AiRecoveryAction::Retry,
            )
        })
    }

    pub(crate) fn fetched_models(&self) -> Vec<RemoteAiModelListing> {
        let mut guard = lock(&self.document);
        let document = guard.get_or_insert_with(|| read_document(&self.path));
        document
            .providers
            .values()
            .flat_map(|provider| provider.models.iter().cloned())
            .collect()
    }

    pub(crate) fn directory(&self) -> Result<RemoteAiModelDirectory, AiProviderError> {
        let catalog = remote_ai_catalog().map_err(|error| {
            AiProviderError::new(
                "remote",
                AiProviderErrorCategory::InternalFailure,
                &error.to_string(),
                AiRecoveryAction::None,
            )
        })?;
        Ok(RemoteAiModelDirectory::merge(
            &catalog,
            &self.fetched_models(),
        ))
    }
}

impl RemoteAiModelAuthority for FetchedModelStore {
    fn permits(&self, provider_id: &str, model_id: &str) -> bool {
        let in_catalog = remote_ai_catalog().ok().is_some_and(|catalog| {
            catalog
                .models_for(provider_id)
                .iter()
                .any(|model| model.model_id == model_id)
        });
        if in_catalog {
            return true;
        }
        self.fetched_models()
            .iter()
            .any(|listing| listing.provider_id == provider_id && listing.model_id == model_id)
    }
}

fn read_document(path: &Path) -> ModelsDocument {
    let Ok(raw) = fs::read_to_string(path) else {
        return ModelsDocument::default();
    };
    // A document that cannot be parsed, is from another version, or holds an
    // invalid entry is treated as absent: the user refreshes again instead of
    // an unvalidated model id reaching a provider URL.
    serde_json::from_str::<ModelsDocument>(&raw)
        .ok()
        .filter(|document| document.version == MODELS_DOCUMENT_VERSION)
        .filter(|document| {
            document.providers.iter().all(|(provider_id, provider)| {
                provider.models.iter().all(|listing| {
                    listing.provider_id == *provider_id
                        && listing.source == RemoteAiModelSource::Fetched
                        && listing.validate().is_ok()
                })
            })
        })
        .unwrap_or_default()
}

fn write_document(path: &Path, document: &ModelsDocument) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let serialized = serde_json::to_vec_pretty(document)
        .map_err(|error| std::io::Error::new(ErrorKind::InvalidData, error))?;
    let pending = path.with_extension("json.pending");
    let _ = fs::remove_file(&pending);
    fs::write(&pending, &serialized)?;
    fs::rename(&pending, path)
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use skriuw_ai_remote::RemoteAiModelAuthority;
    use skriuw_domain::{RemoteAiModelListing, RemoteAiModelSource};
    use tempfile::tempdir;

    use super::FetchedModelStore;

    fn listing(provider_id: &str, model_id: &str) -> RemoteAiModelListing {
        RemoteAiModelListing {
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            label: model_id.into(),
            context_window_tokens: Some(131_072),
            input_price_micros_per_mtok: None,
            output_price_micros_per_mtok: None,
            source: RemoteAiModelSource::Fetched,
        }
    }

    #[test]
    fn persists_fetched_models_across_a_reopen() {
        let directory = tempdir().expect("tempdir");
        let store = FetchedModelStore::new(directory.path());
        store
            .replace("groq", vec![listing("groq", "brand-new-model")], 1_000)
            .expect("replace");

        let reopened = FetchedModelStore::new(directory.path());

        assert!(reopened.permits("groq", "brand-new-model"));
        assert!(!reopened.permits("gemini", "brand-new-model"));
        assert_eq!(reopened.fetched_models().len(), 1);
    }

    #[test]
    fn the_catalog_remains_permitted_without_any_fetch() {
        let directory = tempdir().expect("tempdir");
        let store = FetchedModelStore::new(directory.path());

        assert!(store.permits("groq", "openai/gpt-oss-20b"));
        assert!(!store.permits("groq", "never-fetched"));
    }

    #[test]
    fn a_refresh_replaces_the_provider_listing_and_drops_foreign_entries() {
        let directory = tempdir().expect("tempdir");
        let store = FetchedModelStore::new(directory.path());
        store
            .replace("groq", vec![listing("groq", "old-model")], 1_000)
            .expect("replace");

        store
            .replace(
                "groq",
                vec![listing("groq", "new-model"), listing("gemini", "smuggled")],
                2_000,
            )
            .expect("replace");

        assert!(store.permits("groq", "new-model"));
        assert!(!store.permits("groq", "old-model"));
        assert!(!store.permits("gemini", "smuggled"));
    }

    #[test]
    fn a_tampered_document_is_treated_as_absent() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("ai-models.json");
        std::fs::write(&path, "{ not json").expect("write");
        assert!(FetchedModelStore::new(directory.path())
            .fetched_models()
            .is_empty());

        let traversal = serde_json::json!({
            "version": 1,
            "providers": {
                "groq": {
                    "fetchedAtMs": 1_000,
                    "models": [{
                        "providerId": "groq",
                        "modelId": "../escape",
                        "label": "Escape",
                        "contextWindowTokens": null,
                        "inputPriceMicrosPerMtok": null,
                        "outputPriceMicrosPerMtok": null,
                        "source": "fetched"
                    }]
                }
            }
        });
        std::fs::write(&path, traversal.to_string()).expect("write");

        assert!(FetchedModelStore::new(directory.path())
            .fetched_models()
            .is_empty());
    }

    #[test]
    fn the_directory_merges_catalog_pricing_with_fetched_models() {
        let directory = tempdir().expect("tempdir");
        let store = FetchedModelStore::new(directory.path());
        store
            .replace(
                "groq",
                vec![listing("groq", "openai/gpt-oss-20b"), listing("groq", "brand-new-model")],
                1_000,
            )
            .expect("replace");

        let merged = store.directory().expect("directory");

        let shipped = merged
            .models
            .iter()
            .find(|model| model.model_id == "openai/gpt-oss-20b")
            .expect("catalog model");
        assert!(shipped.input_price_micros_per_mtok.is_some());
        let fetched = merged
            .models
            .iter()
            .find(|model| model.model_id == "brand-new-model")
            .expect("fetched model");
        assert_eq!(fetched.input_price_micros_per_mtok, None);
    }
}
