use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::AiCancellation;

pub const MAX_LOCAL_AI_MODEL_NAME_BYTES: usize = 256;
pub const MAX_LOCAL_AI_STATUS_BYTES: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LocalAiRuntimeState {
    NotInstalled,
    InstalledStopped,
    Starting,
    Running,
    Failed,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalAiStatus {
    pub state: LocalAiRuntimeState,
    pub version: Option<String>,
    pub endpoint: String,
    pub managed: bool,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalAiModel {
    pub name: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub digest: String,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LocalAiOperation {
    Install,
    Pull,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LocalAiProgress {
    Progress {
        operation_id: String,
        operation: LocalAiOperation,
        status: String,
        completed_bytes: u64,
        total_bytes: Option<u64>,
    },
    Complete {
        operation_id: String,
        operation: LocalAiOperation,
    },
    Cancelled {
        operation_id: String,
        operation: LocalAiOperation,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LocalAiErrorCategory {
    InvalidRequest,
    Unavailable,
    DownloadFailed,
    ChecksumMismatch,
    InstallFailed,
    ProcessFailed,
    MalformedResponse,
    Cancelled,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Error)]
#[error("{message}")]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalAiError {
    pub category: LocalAiErrorCategory,
    pub message: String,
}

impl LocalAiError {
    #[must_use]
    pub fn new(category: LocalAiErrorCategory, message: impl AsRef<str>) -> Self {
        Self {
            category,
            message: bounded(message.as_ref()),
        }
    }
}

pub trait LocalAiProgressSink: Send {
    fn send(&mut self, progress: LocalAiProgress) -> Result<(), LocalAiError>;
}

pub trait LocalAiRuntime: Send + Sync {
    fn status(&self) -> Result<LocalAiStatus, LocalAiError>;
    fn start(&self) -> Result<LocalAiStatus, LocalAiError>;
    fn stop(&self) -> Result<LocalAiStatus, LocalAiError>;
    fn install(
        &self,
        operation_id: &str,
        cancellation: &AiCancellation,
        sink: &mut dyn LocalAiProgressSink,
    ) -> Result<LocalAiStatus, LocalAiError>;
    fn list_models(&self) -> Result<Vec<LocalAiModel>, LocalAiError>;
    fn pull_model(
        &self,
        operation_id: &str,
        model: &str,
        cancellation: &AiCancellation,
        sink: &mut dyn LocalAiProgressSink,
    ) -> Result<(), LocalAiError>;
    fn remove_model(&self, model: &str) -> Result<(), LocalAiError>;
    fn shutdown(&self);
}

fn bounded(message: &str) -> String {
    let mut output = String::new();
    for character in message.chars() {
        let character = if character.is_control() {
            ' '
        } else {
            character
        };
        if output.len() + character.len_utf8() > MAX_LOCAL_AI_STATUS_BYTES {
            break;
        }
        output.push(character);
    }
    let output = output.trim();
    if output.is_empty() {
        "Local AI operation failed".to_owned()
    } else {
        output.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalAiError, LocalAiErrorCategory, MAX_LOCAL_AI_STATUS_BYTES};

    #[test]
    fn bounds_errors_at_the_domain_boundary() {
        let error = LocalAiError::new(
            LocalAiErrorCategory::Unavailable,
            "x".repeat(MAX_LOCAL_AI_STATUS_BYTES + 20),
        );
        assert_eq!(error.message.len(), MAX_LOCAL_AI_STATUS_BYTES);
    }
}
