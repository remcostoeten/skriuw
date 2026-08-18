use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    AiProviderErrorCategory, AiUsage, AiValidationError, MAX_AI_IDENTIFIER_BYTES,
    MAX_AI_PROMPT_BYTES, MAX_AI_TOKEN_COUNT, RemoteAiCatalog,
};

/// The origin recorded for a run fired from the prompt playground. Future
/// editor actions record their own action id through the same field, so the
/// seam never grows a second recording path.
pub const AI_RUN_ORIGIN_PLAYGROUND: &str = "playground";

pub const DEFAULT_AI_HISTORY_MAX_RUNS: u32 = 500;
pub const DEFAULT_AI_HISTORY_MAX_AGE_DAYS: u32 = 90;
pub const MAX_AI_HISTORY_MAX_RUNS: u32 = 10_000;
pub const MAX_AI_HISTORY_MAX_AGE_DAYS: u32 = 3_650;
pub const MAX_AI_RUN_PAGE: u32 = 200;
pub const DEFAULT_AI_RUN_PAGE: u32 = 50;

/// Bytes of prompt or response text assumed to make one token when a provider
/// reports no usage. Deliberately coarse: every count derived from it is
/// carried as [`AiTokenSource::Estimated`] and must be presented as such.
pub const AI_TOKEN_ESTIMATE_BYTES: u64 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AiRunState {
    Done,
    Cancelled,
    TimedOut,
    Failed,
}

impl AiRunState {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Done => "done",
            Self::Cancelled => "cancelled",
            Self::TimedOut => "timed_out",
            Self::Failed => "failed",
        }
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "done" => Some(Self::Done),
            "cancelled" => Some(Self::Cancelled),
            "timed_out" => Some(Self::TimedOut),
            "failed" => Some(Self::Failed),
            _ => None,
        }
    }
}

/// Whether the token counts on a run came from the provider or from Skriuw's
/// byte heuristic. Nothing may present an estimate as an exact count.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AiTokenSource {
    Provider,
    Estimated,
}

impl AiTokenSource {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Provider => "provider",
            Self::Estimated => "estimated",
        }
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "provider" => Some(Self::Provider),
            "estimated" => Some(Self::Estimated),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiRunTokens {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub source: AiTokenSource,
}

impl AiRunTokens {
    /// Token counts a provider reported for itself.
    #[must_use]
    pub fn reported(usage: &AiUsage) -> Self {
        Self {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            source: AiTokenSource::Provider,
        }
    }

    /// Token counts derived from transferred bytes because the provider
    /// reported none. Cancelled and failed runs always land here.
    #[must_use]
    pub fn estimated(prompt_bytes: usize, response_bytes: usize) -> Self {
        Self {
            input_tokens: estimate_ai_tokens(prompt_bytes),
            output_tokens: estimate_ai_tokens(response_bytes),
            source: AiTokenSource::Estimated,
        }
    }
}

#[must_use]
pub fn estimate_ai_tokens(bytes: usize) -> u64 {
    let bytes = u64::try_from(bytes).unwrap_or(u64::MAX);
    bytes
        .div_ceil(AI_TOKEN_ESTIMATE_BYTES)
        .min(MAX_AI_TOKEN_COUNT)
}

/// The prompt text of one run. Absent when prompt retention is off, which is
/// the only difference between full and metadata-only history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiRunPrompts {
    pub system_prompt: String,
    pub user_prompt: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiRunRecord {
    pub run_id: String,
    pub started_at_ms: i64,
    pub origin: String,
    pub provider_id: String,
    pub model_id: String,
    /// `None` means the prompt was never retained, not that it was empty.
    pub prompts: Option<AiRunPrompts>,
    pub state: AiRunState,
    pub error_category: Option<AiProviderErrorCategory>,
    pub duration_ms: u32,
    pub tokens: AiRunTokens,
    /// Micro-dollars computed from the shipped catalog when the run reached a
    /// priced remote model. Local providers cost nothing and carry `None`.
    pub cost_micros: Option<u64>,
}

impl AiRunRecord {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        validate_history_identifier("run id", &self.run_id)?;
        validate_history_identifier("origin", &self.origin)?;
        validate_history_identifier("provider id", &self.provider_id)?;
        validate_history_identifier("model id", &self.model_id)?;
        if let Some(prompts) = &self.prompts {
            let bytes = prompts
                .system_prompt
                .len()
                .saturating_add(prompts.user_prompt.len());
            if bytes > MAX_AI_PROMPT_BYTES {
                return Err(AiValidationError::PromptTooLong {
                    maximum: MAX_AI_PROMPT_BYTES,
                });
            }
        }
        if self.tokens.input_tokens > MAX_AI_TOKEN_COUNT {
            return Err(AiValidationError::TokenCountTooLarge {
                field: "input tokens",
                maximum: MAX_AI_TOKEN_COUNT,
            });
        }
        if self.tokens.output_tokens > MAX_AI_TOKEN_COUNT {
            return Err(AiValidationError::TokenCountTooLarge {
                field: "output tokens",
                maximum: MAX_AI_TOKEN_COUNT,
            });
        }
        Ok(())
    }

    /// Drops every byte of prompt text. Applied before a run is written when
    /// metadata-only mode is on, so the text never reaches the database.
    #[must_use]
    pub fn redacted(mut self) -> Self {
        self.prompts = None;
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiHistoryRetention {
    pub max_runs: u32,
    pub max_age_days: u32,
}

impl Default for AiHistoryRetention {
    fn default() -> Self {
        Self {
            max_runs: DEFAULT_AI_HISTORY_MAX_RUNS,
            max_age_days: DEFAULT_AI_HISTORY_MAX_AGE_DAYS,
        }
    }
}

impl AiHistoryRetention {
    #[must_use]
    pub fn clamped(self) -> Self {
        Self {
            max_runs: self.max_runs.clamp(1, MAX_AI_HISTORY_MAX_RUNS),
            max_age_days: self.max_age_days.clamp(1, MAX_AI_HISTORY_MAX_AGE_DAYS),
        }
    }

    /// The oldest timestamp a run may carry and still be kept.
    #[must_use]
    pub fn oldest_kept_ms(self, now_ms: i64) -> i64 {
        let window = i64::from(self.clamped().max_age_days).saturating_mul(86_400_000);
        now_ms.saturating_sub(window)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiHistorySettings {
    pub retain_prompts: bool,
    pub retention: AiHistoryRetention,
}

impl Default for AiHistorySettings {
    fn default() -> Self {
        Self {
            retain_prompts: true,
            retention: AiHistoryRetention::default(),
        }
    }
}

impl AiHistorySettings {
    #[must_use]
    pub fn clamped(self) -> Self {
        Self {
            retain_prompts: self.retain_prompts,
            retention: self.retention.clamped(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiRunFilter {
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub state: Option<AiRunState>,
    pub limit: Option<u32>,
}

impl AiRunFilter {
    #[must_use]
    pub fn page_size(&self) -> u32 {
        self.limit
            .unwrap_or(DEFAULT_AI_RUN_PAGE)
            .clamp(1, MAX_AI_RUN_PAGE)
    }
}

/// One derived bucket of usage. Aggregates are produced by query at read time;
/// nothing stores a running total that could drift from the run rows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiUsageAggregate {
    pub day: String,
    pub provider_id: String,
    pub model_id: String,
    pub runs: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_micros: u64,
    /// True when any run in the bucket carried estimated counts, so the
    /// surface must label the whole figure as approximate.
    pub estimated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiHistoryView {
    pub settings: AiHistorySettings,
    pub pricing_as_of: Option<String>,
    pub aggregates: Vec<AiUsageAggregate>,
    pub runs: Vec<AiRunRecord>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AiModelPrice {
    pub input_price_micros_per_mtok: u64,
    pub output_price_micros_per_mtok: u64,
}

/// The narrow lookup the completion seam uses to price a finished run. The
/// shipped catalog implements it, so pricing stays a single source of truth.
pub trait AiModelPricing: Send + Sync {
    fn price(&self, provider_id: &str, model_id: &str) -> Option<AiModelPrice>;
}

impl AiModelPricing for RemoteAiCatalog {
    fn price(&self, provider_id: &str, model_id: &str) -> Option<AiModelPrice> {
        self.models
            .iter()
            .find(|model| model.provider_id == provider_id && model.model_id == model_id)
            .map(|model| AiModelPrice {
                input_price_micros_per_mtok: model.input_price_micros_per_mtok,
                output_price_micros_per_mtok: model.output_price_micros_per_mtok,
            })
    }
}

/// Micro-dollars for one run, rounded half up. Prices are quoted per million
/// tokens, so the arithmetic runs in `u128` and never touches a float.
#[must_use]
pub fn ai_run_cost_micros(tokens: &AiRunTokens, price: AiModelPrice) -> u64 {
    let input = u128::from(tokens.input_tokens)
        .saturating_mul(u128::from(price.input_price_micros_per_mtok));
    let output = u128::from(tokens.output_tokens)
        .saturating_mul(u128::from(price.output_price_micros_per_mtok));
    let total = input.saturating_add(output).saturating_add(500_000) / 1_000_000;
    u64::try_from(total).unwrap_or(u64::MAX)
}

/// The capability the completion seam calls once per terminalized run. Callers
/// must not block stream delivery on it.
pub trait AiRunRecorder: Send + Sync {
    fn record(&self, record: AiRunRecord);
}

fn validate_history_identifier(field: &'static str, value: &str) -> Result<(), AiValidationError> {
    if value.is_empty() {
        return Err(AiValidationError::Empty { field });
    }
    if value.len() > MAX_AI_IDENTIFIER_BYTES {
        return Err(AiValidationError::TooLong {
            field,
            maximum: MAX_AI_IDENTIFIER_BYTES,
        });
    }
    if !value.bytes().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
    }) {
        return Err(AiValidationError::InvalidIdentifier { field });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        AiHistoryRetention, AiModelPrice, AiModelPricing, AiRunPrompts, AiRunRecord, AiRunState,
        AiRunTokens, AiTokenSource, ai_run_cost_micros, estimate_ai_tokens,
    };
    use crate::{AiUsage, RemoteAiCatalog, RemoteAiModel};

    fn catalog() -> RemoteAiCatalog {
        RemoteAiCatalog {
            version: 1,
            pricing_as_of: "2026-08-17".into(),
            models: vec![RemoteAiModel {
                provider_id: "groq".into(),
                model_id: "openai/gpt-oss-120b".into(),
                label: "GPT-OSS 120B".into(),
                context_window_tokens: 131_072,
                input_price_micros_per_mtok: 150_000,
                output_price_micros_per_mtok: 600_000,
            }],
        }
    }

    #[test]
    fn prices_a_known_token_count_from_the_catalog() {
        let price = catalog()
            .price("groq", "openai/gpt-oss-120b")
            .expect("catalogued price");
        assert_eq!(
            price,
            AiModelPrice {
                input_price_micros_per_mtok: 150_000,
                output_price_micros_per_mtok: 600_000,
            }
        );

        let tokens = AiRunTokens {
            input_tokens: 1_000_000,
            output_tokens: 500_000,
            source: AiTokenSource::Provider,
        };
        assert_eq!(ai_run_cost_micros(&tokens, price), 450_000);

        let small = AiRunTokens {
            input_tokens: 2_000,
            output_tokens: 1_000,
            source: AiTokenSource::Provider,
        };
        assert_eq!(ai_run_cost_micros(&small, price), 900);

        assert!(catalog().price("ollama", "llama3").is_none());
    }

    #[test]
    fn marks_derived_counts_as_estimates() {
        assert_eq!(estimate_ai_tokens(0), 0);
        assert_eq!(estimate_ai_tokens(1), 1);
        assert_eq!(estimate_ai_tokens(9), 3);

        let reported = AiRunTokens::reported(&AiUsage {
            input_tokens: 11,
            output_tokens: 7,
        });
        assert_eq!(reported.source, AiTokenSource::Provider);

        let estimated = AiRunTokens::estimated(40, 12);
        assert_eq!(estimated.source, AiTokenSource::Estimated);
        assert_eq!(estimated.input_tokens, 10);
        assert_eq!(estimated.output_tokens, 3);
    }

    #[test]
    fn redaction_removes_every_prompt_byte() {
        let record = AiRunRecord {
            run_id: "run-1".into(),
            started_at_ms: 1,
            origin: "playground".into(),
            provider_id: "fake".into(),
            model_id: "fake".into(),
            prompts: Some(AiRunPrompts {
                system_prompt: "system".into(),
                user_prompt: "secret".into(),
            }),
            state: AiRunState::Done,
            error_category: None,
            duration_ms: 12,
            tokens: AiRunTokens::estimated(6, 6),
            cost_micros: None,
        };

        assert_eq!(record.validate(), Ok(()));
        assert_eq!(record.redacted().prompts, None);
    }

    #[test]
    fn retention_clamps_and_windows() {
        let retention = AiHistoryRetention {
            max_runs: 0,
            max_age_days: 0,
        }
        .clamped();
        assert_eq!(retention.max_runs, 1);
        assert_eq!(retention.max_age_days, 1);
        assert_eq!(retention.oldest_kept_ms(86_400_000), 0);
    }
}
