use std::{
    collections::{BTreeMap, BTreeSet},
    io,
};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

mod ai;
mod ai_history;
mod annotation;
mod checkpoint;
mod chunk;
mod local_ai;
mod lock;
mod operation;
mod prompt;
mod reconcile;
mod remote_ai;
mod search;
mod sync;
mod sync_policy;
mod task;
mod transcribe;

pub use ai::{
    AiCancellation, AiComplete, AiCompletionDelta, AiCompletionEvent, AiCompletionParameters,
    AiCompletionRequest, AiCompletionTerminal, AiEventSink, AiProviderError,
    AiProviderErrorCategory, AiRecoveryAction, AiSinkError, AiUsage, AiValidationError,
    MAX_AI_DELTA_BYTES, MAX_AI_DURATION_MS, MAX_AI_ERROR_MESSAGE_BYTES, MAX_AI_IDENTIFIER_BYTES,
    MAX_AI_PROMPT_BYTES, MAX_AI_RESPONSE_BYTES, MAX_AI_RETRIES, MAX_AI_TOKEN_COUNT,
};
pub use ai_history::{
    AI_RUN_ORIGIN_PLAYGROUND, AI_TOKEN_ESTIMATE_BYTES, AiHistoryRetention, AiHistorySettings,
    AiHistoryView, AiModelPrice, AiModelPricing, AiRunFilter, AiRunPrompts, AiRunRecord,
    AiRunRecorder, AiRunState, AiRunStatus, AiRunSummary, AiRunTokens, AiTokenSource,
    AiUsageAggregate, DEFAULT_AI_HISTORY_MAX_AGE_DAYS, DEFAULT_AI_HISTORY_MAX_RUNS,
    DEFAULT_AI_RUN_PAGE, MAX_AI_HISTORY_MAX_AGE_DAYS, MAX_AI_HISTORY_MAX_RUNS, MAX_AI_RUN_PAGE,
    ai_run_cost_micros, ai_run_record, ai_token_source_as_str, estimate_ai_tokens,
    parse_ai_token_source,
};
pub use checkpoint::{
    CHECKPOINT_CONTENT_MIME_TYPE, CheckpointSeal, CheckpointValidationError,
    WORKSPACE_CHECKPOINT_VERSION, WorkspaceCheckpoint,
};
pub use chunk::{
    CANONICAL_CHUNK_BYTES, CONTENT_DIGEST_HEX_BYTES, CONTENT_MANIFEST_VERSION, ContentChunkRef,
    ContentEncoding, ContentHashAlgorithm, ContentManifest, ContentManifestKind,
    ContentValidationError, MAX_CONTENT_BYTES, MAX_CONTENT_MIME_BYTES, MAX_MANIFEST_CHUNKS,
    content_digest, validate_content_digest,
};
pub use local_ai::{
    LocalAiError, LocalAiErrorCategory, LocalAiModel, LocalAiOperation, LocalAiProgress,
    LocalAiProgressSink, LocalAiRuntime, LocalAiRuntimeState, LocalAiStatus,
    MAX_LOCAL_AI_MODEL_NAME_BYTES, MAX_LOCAL_AI_STATUS_BYTES,
};
pub use lock::{
    LockedDocumentBody, MAX_NOTE_LOCK_HINT_CHARS, MAX_NOTE_LOCK_SECRET_BYTES,
    MIN_NOTE_LOCK_PASSPHRASE_CHARS, MIN_NOTE_LOCK_PIN_DIGITS, NOTE_LOCK_CONFIGURE_ENTROPY_BYTES,
    NOTE_LOCK_FREE_ATTEMPTS, NOTE_LOCK_KEY_BYTES, NOTE_LOCK_RECOVERY_ENTROPY_BYTES,
    NOTE_LOCK_SALT_BYTES, NOTE_LOCK_SCHEME, NoteLockConfig, NoteLockKind, NoteLockState,
    SealedPayload, locked_document_placeholder, unlock_retry_delay_ms, validate_note_lock_config,
    validate_note_lock_hint, validate_note_lock_secret, validate_sealed_payload,
};
pub use prompt::{
    BUILT_IN_PROMPT_LIBRARY_VERSION, BUILT_IN_PROMPTS, BuiltInPrompt, BuiltInPromptLibrary,
    MAX_PROMPT_NAME_BYTES, MAX_PROMPT_SYSTEM_BYTES, MAX_PROMPT_TEMPERATURE_MILLIS,
    PromptInputShape, PromptParameters, WorkspacePrompt, built_in_prompt,
    validate_workspace_prompts,
};
pub use reconcile::{
    RemoteOperationDecision, RemoteTargetState, SyncConflictReason, classify_apply_failure,
    reconcile_remote_operation,
};
pub use remote_ai::{
    AiCredentialError, CredentialVaultDetection, CredentialVaultState,
    MAX_REMOTE_AI_CATALOG_MODELS, MAX_REMOTE_AI_CONTEXT_TOKENS, MAX_REMOTE_AI_LABEL_BYTES,
    MAX_REMOTE_AI_PRICE_MICROS, REMOTE_AI_DISCLOSURE_VERSION, RemoteAiCatalog,
    RemoteAiCatalogError, RemoteAiConsent, RemoteAiKeyTier, RemoteAiModel, RemoteAiModelDirectory,
    RemoteAiModelListing, RemoteAiModelSource, RemoteAiProviderState,
};
pub use search::{SEARCH_INDEX_VERSION, SearchIndexStatus, index_text};
pub use sync::{
    BlockedSyncOperationView, ClientSyncOperation, DiscardedSyncOperationView,
    MAX_INLINE_SYNC_OPERATION_BYTES, MAX_OPERATION_ASSET_MANIFESTS, MAX_SAFE_SYNC_SEQUENCE,
    MAX_SEAL_SCHEME_BYTES, MAX_SYNC_BATCH_BYTES, MAX_SYNC_BATCH_OPERATIONS,
    MAX_SYNC_PULL_OPERATIONS, MIN_CHUNKED_CONTENT_PROTOCOL_VERSION,
    MIN_SEALED_CONTENT_PROTOCOL_VERSION, ReplicatedWorkspaceOperation, RequiredAssetContent,
    SEAL_KEY_ID_HEX_CHARACTERS, SEAL_NONCE_BASE64_CHARACTERS, SEALED_CONTENT_MIME_TYPE,
    SUPPORTED_SYNC_PROTOCOL_VERSIONS, SYNC_RECOVERY_VIEW_VERSION, SealedContent, SealedTransport,
    SyncAcceptedOperation, SyncOperationPayload, SyncPullResponse, SyncPushRequest,
    SyncPushResponse, SyncRecoveryView, SyncReplicationClass, SyncValidationError,
    WORKSPACE_OPERATION_SYNC_POLICY_V1, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceEncryptionMarker,
    WorkspaceOperationSyncPolicy, validate_sync_identifier, validate_sync_sequence,
};
pub use sync_policy::{
    BlockedSyncReason, CanonicalDocument, InitialSyncError, OutboxAdmission, OutboxTail,
    ParkedSyncOperation, RemoteApplyErrorKind, RemoteApplyFailure, SupersededDocumentPlan,
    SupersededNoteState, blocked_reason_is_retryable, blocking_requires_release,
    coalesces_into_tail, document_write_target, documents_equivalent, initial_sync_operations,
    outbox_admission, remote_apply_failure, requeued_operation, superseded_document_plan,
};
pub use task::{
    DocumentTaskLink, MAX_TASK_ASSIGNEES, MAX_TASK_DESCRIPTION_BYTES, MAX_TASK_TAGS, TaskPriority,
    TaskSource, TaskSourceDocument, TaskStatus, WorkspaceTask, document_task_links,
    unique_document_task_link, validate_workspace_tasks,
};

pub use transcribe::{
    AI_AUDIO_MIME_TYPES, AiTranscribe, AiTranscriptionModel, AiTranscriptionRequest,
    AiTranscriptionResult, AiTranscriptionTerminal, MAX_AI_AUDIO_BYTES, MAX_AI_LANGUAGE_BYTES,
    MAX_AI_TRANSCRIPT_BYTES,
};

pub use annotation::{
    AnnotationComment, AnnotationStatus, MAX_ANNOTATION_ANCHOR_TEXT_BYTES,
    MAX_ANNOTATION_COMMENT_BYTES, MAX_ANNOTATION_COMMENTS, WorkspaceAnnotation,
};
pub use operation::{
    NodePlacement, NodePosition, WorkspaceOperation, WorkspaceOperationEnvelope,
    validate_operation_group,
};

pub const WORKSPACE_PROTOCOL_VERSION: u16 = 1;
pub const WORKSPACE_ARCHIVE_VERSION: u16 = 6;
pub const SUPPORTED_ARCHIVE_VERSIONS: [u16; 6] = [1, 2, 3, 4, 5, 6];
pub const WORKSPACE_SETTINGS_VERSION: u16 = 1;
pub const NOTE_PROPERTY_VALUE_VERSION: u16 = 1;
pub const MAX_ENTITY_ID_BYTES: usize = 128;
pub const MAX_TITLE_BYTES: usize = 512;
pub const MAX_SETTING_KEY_BYTES: usize = 128;
pub const MAX_SETTING_TEXT_BYTES: usize = 512;
/// Serialized size cap for the device-local `databaseViews` settings extension.
/// The renderer evicts its oldest layouts to stay under this, so the cap is a
/// contract every version keeps rather than a limit a newer build may raise.
pub const MAX_DATABASE_VIEWS_BYTES: usize = 256 * 1024;
pub const MAX_REFERENCE_NAME_BYTES: usize = 512;
pub const MAX_REFERENCE_COLOR_BYTES: usize = 64;
pub const MAX_IMAGE_MIME_BYTES: usize = 128;
pub const IMAGE_CONTENT_HASH_BYTES: usize = 64;
/// The cover gradients a note may name. A cover gradient travels as an
/// identifier, never as CSS, so a synced or imported workspace can never make
/// the renderer paint style it did not ship. `apps/workspace/src/features/note-chrome/cover/gradient-model.ts`
/// mirrors this list and owns the paint for each id.
pub const COVER_GRADIENT_IDS: [&str; 12] = [
    "slate", "crimson", "sunset", "gold", "meadow", "lagoon", "ocean", "dusk", "bloom", "aurora",
    "midnight", "orchid",
];

pub const MAX_MEDIA_NAME_BYTES: usize = 200;
pub const MAX_MEDIA_ALT_BYTES: usize = 1_000;
pub const MAX_NOTE_PROPERTIES: usize = 64;
pub const MAX_PROPERTY_OPTIONS: usize = 64;
pub const MAX_PROPERTY_NAME_BYTES: usize = 80;
pub const MAX_PROPERTY_VALUE_BYTES: usize = 2_000;
pub const MAX_TEMPLATE_NAME_BYTES: usize = 60;
pub const MAX_DOCUMENT_JSON_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_DOCUMENT_MARKDOWN_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_DOCUMENT_NODES: usize = 1_000_000;
pub const MAX_DOCUMENT_DEPTH: usize = 128;
pub const MAX_OPERATION_GROUP: usize = 100_000;
pub const MAX_OPERATION_GROUP_BYTES: usize = 512 * 1024 * 1024;

pub const SETTINGS_FIELDS: [&str; 9] = [
    "settingsVersion",
    "theme",
    "compactSidebar",
    "showPageIcons",
    "rememberLastNote",
    "editorFont",
    "editorLineHeight",
    "showLineNumbers",
    "editorPlaceholder",
];

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum OperationValidationError {
    #[error("unsupported workspace protocol version {0}")]
    UnsupportedProtocol(u16),
    #[error("{field} cannot be empty")]
    Empty { field: &'static str },
    #[error("{field} exceeds {maximum} bytes")]
    TooLong { field: &'static str, maximum: usize },
    #[error("{field} contains unsupported characters")]
    InvalidIdentifier { field: &'static str },
    #[error("timestamp cannot be negative")]
    NegativeTimestamp,
    #[error("document must be a JSON object")]
    InvalidDocument,
    #[error("document exceeds maximum depth {maximum}")]
    DocumentTooDeep { maximum: usize },
    #[error("word count cannot be negative")]
    NegativeWordCount,
    #[error("expected revision must be between 1 and {maximum}")]
    InvalidRevision { maximum: i64 },
    #[error("node cannot be its own parent")]
    SelfParent,
    #[error("node cannot be placed relative to itself")]
    SelfAnchor,
    #[error("unsupported workspace settings version {0}")]
    UnsupportedSettingsVersion(u16),
    #[error("unsupported note property value version {0}")]
    UnsupportedPropertyValueVersion(u16),
    #[error("extension setting {key} collides with a schema field")]
    SettingFieldCollision { key: String },
    #[error("{field} must be positive")]
    NotPositive { field: &'static str },
    #[error("{field} exceeds {maximum} entries")]
    TooMany { field: &'static str, maximum: usize },
    #[error("{field} contains a duplicate {id}")]
    Duplicate { field: &'static str, id: String },
    #[error("{field} contains an unknown reference {id}")]
    UnknownReference { field: &'static str, id: String },
    #[error("property positions must be contiguous from zero")]
    InvalidPropertyPositions,
    #[error("{field} position cannot be negative")]
    NegativePosition { field: &'static str },
    #[error("cover transform is outside its supported range")]
    InvalidCoverTransform,
    #[error("{id} is not a built-in cover gradient")]
    UnknownCoverGradient { id: String },
    #[error("task {id} is detached but still carries a source link")]
    DetachedTaskKeepsSource { id: String },
    #[error("task {id} is not linked from its source document")]
    UnlinkedTaskSource { id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ArchiveValidationError {
    #[error("unsupported workspace archive version {0}")]
    UnsupportedArchiveVersion(u16),
    #[error("unsupported workspace protocol version {0}")]
    UnsupportedProtocol(u16),
    #[error("invalid workspace archive: {0}")]
    Invalid(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Note,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    pub id: String,
    pub kind: NodeKind,
    pub parent_id: Option<String>,
    pub rank: i64,
    pub title: String,
    pub icon: Option<String>,
    #[serde(default)]
    pub cover_image_id: Option<String>,
    #[serde(default)]
    pub cover_gradient: Option<String>,
    #[serde(default)]
    pub cover_full_width: bool,
    #[serde(default = "default_cover_position")]
    pub cover_position_x: f64,
    #[serde(default = "default_cover_position")]
    pub cover_position_y: f64,
    #[serde(default = "default_cover_zoom")]
    pub cover_zoom: f64,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    #[serde(default)]
    pub pinned_at: Option<i64>,
    #[serde(default)]
    pub locked_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocument {
    pub note_id: String,
    pub document_json: Value,
    pub markdown: String,
    pub revision: i64,
    pub word_count: i64,
    /// Present when the note is locked and its body is stored sealed. The
    /// plaintext fields then hold the empty placeholder, and a device that
    /// holds the lock key opens the body on request instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sealed: Option<lock::SealedPayload>,
}

/// The subset of canonical state a renderer needs after specific notes
/// changed underneath it: the current document bodies plus the node records
/// for the same identifiers, so title and placement stay in step.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDelta {
    pub documents: Vec<WorkspaceDocument>,
    pub nodes: Vec<WorkspaceNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HistoryHeader {
    pub note_id: String,
    pub version_id: String,
    pub created_at: i64,
    pub summary: String,
    pub additions: Option<i64>,
    pub deletions: Option<i64>,
    pub word_count: Option<i64>,
}

/// The product's word rule: whitespace-separated tokens containing at least one
/// alphanumeric character, so markdown punctuation and list bullets do not
/// count as words. Shared by document storage and history capture so a note's
/// word count means the same thing everywhere it is shown.
#[must_use]
pub fn count_words(markdown: &str) -> i64 {
    markdown
        .split_whitespace()
        .filter(|token| token.chars().any(char::is_alphanumeric))
        .count() as i64
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    #[serde(default = "default_settings_version")]
    pub settings_version: u16,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub compact_sidebar: bool,
    #[serde(default = "default_enabled")]
    pub show_page_icons: bool,
    #[serde(default = "default_enabled")]
    pub remember_last_note: bool,
    #[serde(default = "default_editor_font")]
    pub editor_font: String,
    #[serde(default = "default_editor_line_height")]
    pub editor_line_height: String,
    #[serde(default = "default_enabled")]
    pub show_line_numbers: bool,
    #[serde(default = "default_editor_placeholder")]
    pub editor_placeholder: String,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

impl Default for WorkspaceSettings {
    fn default() -> Self {
        Self {
            settings_version: default_settings_version(),
            theme: default_theme(),
            compact_sidebar: false,
            show_page_icons: default_enabled(),
            remember_last_note: default_enabled(),
            editor_font: default_editor_font(),
            editor_line_height: default_editor_line_height(),
            show_line_numbers: default_enabled(),
            editor_placeholder: default_editor_placeholder(),
            extensions: BTreeMap::new(),
        }
    }
}

impl WorkspaceSettings {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        if self.settings_version != WORKSPACE_SETTINGS_VERSION {
            return Err(OperationValidationError::UnsupportedSettingsVersion(
                self.settings_version,
            ));
        }
        validate_id("theme", &self.theme)?;
        validate_id("editor font", &self.editor_font)?;
        validate_id("editor line height", &self.editor_line_height)?;
        validate_setting_text("editor placeholder", &self.editor_placeholder)?;
        for (key, value) in &self.extensions {
            if key == "noteTemplateIds" || key == "savedSearches" {
                let maximum = if key == "noteTemplateIds" { 200 } else { 100 };
                let entries = value
                    .as_array()
                    .ok_or(OperationValidationError::InvalidDocument)?;
                if entries.len() > maximum {
                    return Err(OperationValidationError::TooLong {
                        field: "saved preferences",
                        maximum,
                    });
                }
                for entry in entries {
                    let text = entry
                        .as_str()
                        .ok_or(OperationValidationError::InvalidDocument)?;
                    if key == "noteTemplateIds" {
                        validate_id("template note id", text)?;
                    } else {
                        validate_bounded_text("saved search", text, 2048)?;
                        if text.encode_utf16().count() > 512 {
                            return Err(OperationValidationError::TooLong {
                                field: "saved search",
                                maximum: 512,
                            });
                        }
                    }
                }
            }
            if key == "mathMacros" {
                let macros = serde_json::from_value::<BTreeMap<String, String>>(value.clone())
                    .map_err(|_| OperationValidationError::InvalidDocument)?;
                validate_math_macros(&macros)?;
            }
            if key == "databaseViews" {
                validate_database_views(value)?;
            }
            validate_setting_key(key)?;
            if SETTINGS_FIELDS.contains(&key.as_str()) {
                return Err(OperationValidationError::SettingFieldCollision { key: key.clone() });
            }
        }
        Ok(())
    }
}

fn validate_database_views(value: &Value) -> Result<(), OperationValidationError> {
    if !value.is_object() {
        return Err(OperationValidationError::InvalidDocument);
    }
    let size = serde_json::to_vec(value)
        .map_err(|_| OperationValidationError::InvalidDocument)?
        .len();
    if size > MAX_DATABASE_VIEWS_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "database layouts",
            maximum: MAX_DATABASE_VIEWS_BYTES,
        });
    }
    Ok(())
}

fn validate_math_macros(macros: &BTreeMap<String, String>) -> Result<(), OperationValidationError> {
    if macros.len() > 64 {
        return Err(OperationValidationError::TooLong {
            field: "math macros",
            maximum: 64,
        });
    }
    for (name, definition) in macros {
        if name.len() < 2
            || name.len() > 64
            || !name.starts_with('\\')
            || !name[1..].bytes().all(|byte| byte.is_ascii_alphabetic())
        {
            return Err(OperationValidationError::InvalidDocument);
        }
        validate_bounded_text("math macro definition", definition, 4096)?;
    }
    Ok(())
}

fn default_settings_version() -> u16 {
    WORKSPACE_SETTINGS_VERSION
}

fn default_enabled() -> bool {
    true
}

fn default_cover_position() -> f64 {
    50.0
}

fn default_cover_zoom() -> f64 {
    1.0
}

fn default_theme() -> String {
    "midnight".into()
}

fn default_editor_font() -> String {
    "inter".into()
}

fn default_editor_line_height() -> String {
    "comfortable".into()
}

fn default_editor_placeholder() -> String {
    "Start writing...".into()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceImage {
    pub id: String,
    pub note_id: String,
    pub content_hash: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub created_at: i64,
}

impl WorkspaceImage {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("image id", &self.id)?;
        validate_id("note id", &self.note_id)?;
        validate_content_hash(&self.content_hash)?;
        validate_mime_type(&self.mime_type)?;
        if self.byte_size <= 0 {
            return Err(OperationValidationError::NotPositive {
                field: "image byte size",
            });
        }
        for (field, value) in [("image width", self.width), ("image height", self.height)] {
            if value.is_some_and(|value| value <= 0) {
                return Err(OperationValidationError::NotPositive { field });
            }
        }
        validate_timestamp(self.created_at)
    }
}

/// Librarian metadata a person types about one stored file. Keyed by content
/// hash rather than by image row: the same bytes are attached once per note,
/// and detaching an image prunes those rows, which would take the name with
/// them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub content_hash: String,
    pub name: String,
    pub alt: String,
    pub updated_at: i64,
}

impl MediaMetadata {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_content_hash(&self.content_hash)?;
        validate_optional_bounded_text("media name", &self.name, MAX_MEDIA_NAME_BYTES)?;
        validate_optional_bounded_text("media alt text", &self.alt, MAX_MEDIA_ALT_BYTES)?;
        validate_timestamp(self.updated_at)
    }

    /// A record whose fields are all blank carries nothing; storage drops it
    /// instead of keeping an empty row alive.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.name.trim().is_empty() && self.alt.trim().is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum NotePropertyColor {
    Gray,
    Stone,
    Amber,
    Green,
    Blue,
    Teal,
    Rose,
    Red,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotePropertyOption {
    pub id: String,
    pub label: String,
    pub color: NotePropertyColor,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", content = "value", rename_all = "kebab-case")]
pub enum NotePropertyValue {
    Text(String),
    Number(Option<f64>),
    Date(String),
    Select(Option<String>),
    MultiSelect(Vec<String>),
    Person(Vec<String>),
    Url(String),
    Checkbox(bool),
    Rating(Option<u8>),
    Location(String),
    Email(String),
    Phone(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct VersionedNotePropertyValue {
    pub value_version: u16,
    #[serde(flatten)]
    pub value: NotePropertyValue,
}

impl VersionedNotePropertyValue {
    #[must_use]
    pub fn v1(value: NotePropertyValue) -> Self {
        Self {
            value_version: NOTE_PROPERTY_VALUE_VERSION,
            value,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotePropertyField {
    pub id: String,
    pub name: String,
    pub value: VersionedNotePropertyValue,
    #[serde(default)]
    pub options: Vec<NotePropertyOption>,
    pub position: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NoteProperty {
    pub note_id: String,
    #[serde(flatten)]
    pub field: NotePropertyField,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotePropertyTemplate {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub properties: Vec<NotePropertyField>,
}

impl NotePropertyField {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("property id", &self.id)?;
        validate_bounded_text("property name", &self.name, MAX_PROPERTY_NAME_BYTES)?;
        if self.position < 0 {
            return Err(OperationValidationError::NegativePosition { field: "property" });
        }
        if self.value.value_version != NOTE_PROPERTY_VALUE_VERSION {
            return Err(OperationValidationError::UnsupportedPropertyValueVersion(
                self.value.value_version,
            ));
        }
        validate_property_options(&self.options)?;
        match &self.value.value {
            NotePropertyValue::Text(value)
            | NotePropertyValue::Date(value)
            | NotePropertyValue::Url(value)
            | NotePropertyValue::Location(value)
            | NotePropertyValue::Email(value)
            | NotePropertyValue::Phone(value) => {
                validate_optional_bounded_text("property value", value, MAX_PROPERTY_VALUE_BYTES)?;
                if !self.options.is_empty() {
                    return Err(OperationValidationError::InvalidIdentifier {
                        field: "property options",
                    });
                }
            }
            NotePropertyValue::Number(value) => {
                if value.is_some_and(|value| !value.is_finite()) {
                    return Err(OperationValidationError::InvalidIdentifier {
                        field: "property number",
                    });
                }
                if !self.options.is_empty() {
                    return Err(OperationValidationError::InvalidIdentifier {
                        field: "property options",
                    });
                }
            }
            NotePropertyValue::Select(value) => {
                if let Some(id) = value {
                    require_option_reference("property select", id, &self.options)?;
                }
            }
            NotePropertyValue::MultiSelect(values) => {
                validate_value_ids("property multi-select", values, &self.options)?;
            }
            NotePropertyValue::Person(values) => {
                validate_ordered_ids("property people", values, MAX_PROPERTY_OPTIONS)?;
                if !self.options.is_empty() {
                    return Err(OperationValidationError::InvalidIdentifier {
                        field: "property options",
                    });
                }
            }
            NotePropertyValue::Checkbox(_) | NotePropertyValue::Rating(_) => {
                if let NotePropertyValue::Rating(Some(value)) = &self.value.value
                    && *value > 5
                {
                    return Err(OperationValidationError::InvalidIdentifier {
                        field: "property rating",
                    });
                }
                if !self.options.is_empty() {
                    return Err(OperationValidationError::InvalidIdentifier {
                        field: "property options",
                    });
                }
            }
        }
        Ok(())
    }
}

impl NotePropertyTemplate {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("property template id", &self.id)?;
        validate_bounded_text(
            "property template name",
            &self.name,
            MAX_TEMPLATE_NAME_BYTES,
        )?;
        if self.position < 0 {
            return Err(OperationValidationError::NegativePosition {
                field: "property template",
            });
        }
        validate_note_property_fields(&self.properties)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub protocol_version: u16,
    pub active_note_id: Option<String>,
    pub nodes: Vec<WorkspaceNode>,
    pub documents: Vec<WorkspaceDocument>,
    pub history_headers: Vec<HistoryHeader>,
    pub settings: WorkspaceSettings,
    #[serde(default)]
    pub tags: Vec<WorkspaceTag>,
    #[serde(default)]
    pub people: Vec<WorkspacePerson>,
    #[serde(default)]
    pub references: Vec<NoteReferences>,
    #[serde(default)]
    pub images: Vec<WorkspaceImage>,
    #[serde(default)]
    pub media_metadata: Vec<MediaMetadata>,
    #[serde(default)]
    pub properties: Vec<NoteProperty>,
    #[serde(default)]
    pub property_templates: Vec<NotePropertyTemplate>,
    #[serde(default)]
    pub tasks: Vec<WorkspaceTask>,
    #[serde(default)]
    pub prompts: Vec<WorkspacePrompt>,
    #[serde(default)]
    pub annotations: Vec<WorkspaceAnnotation>,
    #[serde(default)]
    pub import_receipts: Vec<ProviderImportReceipt>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderImportReceipt {
    pub provider: String,
    pub source_key: String,
    pub source_path: String,
    pub note_id: String,
    pub imported_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opened_file: Option<OpenedFileState>,
}

/// What a note and the file the operating system opened it from looked like
/// when they last matched, so reopening the file can tell which side changed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFileState {
    pub format_id: String,
    pub file_hash: String,
    pub note_hash: String,
}

impl WorkspaceSnapshot {
    #[must_use]
    pub fn unavailable_node_ids(&self) -> BTreeSet<&str> {
        let mut children = BTreeMap::<&str, Vec<&str>>::new();
        let mut pending = Vec::new();
        for node in &self.nodes {
            if let Some(parent_id) = node.parent_id.as_deref() {
                children.entry(parent_id).or_default().push(&node.id);
            }
            if node.deleted_at.is_some() {
                pending.push(node.id.as_str());
            }
        }

        let mut unavailable = BTreeSet::new();
        while let Some(id) = pending.pop() {
            if !unavailable.insert(id) {
                continue;
            }
            if let Some(descendants) = children.get(id) {
                pending.extend(descendants.iter().copied());
            }
        }
        unavailable
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceArchive {
    pub archive_version: u16,
    pub protocol_version: u16,
    pub exported_at: i64,
    pub active_note_id: Option<String>,
    pub nodes: Vec<WorkspaceNode>,
    pub documents: Vec<WorkspaceDocument>,
    pub settings: WorkspaceSettings,
    #[serde(default)]
    pub tags: Vec<WorkspaceTag>,
    #[serde(default)]
    pub people: Vec<WorkspacePerson>,
    #[serde(default)]
    pub properties: Vec<NoteProperty>,
    #[serde(default)]
    pub property_templates: Vec<NotePropertyTemplate>,
    #[serde(default)]
    pub tasks: Vec<WorkspaceTask>,
    #[serde(default)]
    pub prompts: Vec<WorkspacePrompt>,
    #[serde(default)]
    pub annotations: Vec<WorkspaceAnnotation>,
    /// The workspace's note lock, when one is configured. Carries wrapped key
    /// material only, so an archive stays safe to hand around.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_lock: Option<lock::NoteLockConfig>,
}

impl WorkspaceArchive {
    #[must_use]
    pub fn current(snapshot: WorkspaceSnapshot, exported_at: i64) -> Self {
        Self {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: snapshot.protocol_version,
            exported_at,
            active_note_id: snapshot.active_note_id,
            nodes: snapshot.nodes,
            documents: snapshot.documents,
            settings: snapshot.settings,
            tags: snapshot.tags,
            people: snapshot.people,
            properties: snapshot.properties,
            property_templates: snapshot.property_templates,
            tasks: snapshot.tasks,
            annotations: snapshot.annotations,
            note_lock: None,
            prompts: snapshot.prompts,
        }
    }

    pub fn validate(&self) -> Result<(), ArchiveValidationError> {
        if !SUPPORTED_ARCHIVE_VERSIONS.contains(&self.archive_version) {
            return Err(ArchiveValidationError::UnsupportedArchiveVersion(
                self.archive_version,
            ));
        }
        if self.protocol_version != WORKSPACE_PROTOCOL_VERSION {
            return Err(ArchiveValidationError::UnsupportedProtocol(
                self.protocol_version,
            ));
        }
        if self.exported_at < 0 {
            return archive_error("export timestamp cannot be negative");
        }

        let mut nodes = BTreeMap::new();
        for node in &self.nodes {
            validate_id("node id", &node.id).map_err(archive_operation_error)?;
            validate_title(&node.title).map_err(archive_operation_error)?;
            if let Some(cover_image_id) = &node.cover_image_id {
                if node.kind != NodeKind::Note {
                    return archive_error(format!("folder {} has a cover image", node.id));
                }
                validate_id("cover image id", cover_image_id).map_err(archive_operation_error)?;
            }
            if let Some(cover_gradient) = &node.cover_gradient {
                if node.kind != NodeKind::Note {
                    return archive_error(format!("folder {} has a cover gradient", node.id));
                }
                if node.cover_image_id.is_some() {
                    return archive_error(format!(
                        "node {} has both a cover image and a cover gradient",
                        node.id
                    ));
                }
                validate_cover_gradient(cover_gradient).map_err(archive_operation_error)?;
            }
            if node.cover_image_id.is_none()
                && node.cover_gradient.is_none()
                && node.cover_full_width
            {
                return archive_error(format!("node {} has cover width without a cover", node.id));
            }
            validate_cover_transform(
                node.cover_position_x,
                node.cover_position_y,
                node.cover_zoom,
            )
            .map_err(archive_operation_error)?;
            validate_timestamp(node.created_at).map_err(archive_operation_error)?;
            validate_timestamp(node.updated_at).map_err(archive_operation_error)?;
            if node.created_at > node.updated_at {
                return archive_error(format!("node {} is updated before creation", node.id));
            }
            if node
                .deleted_at
                .is_some_and(|deleted_at| deleted_at < node.created_at)
            {
                return archive_error(format!("node {} is deleted before creation", node.id));
            }
            if let Some(pinned_at) = node.pinned_at {
                validate_timestamp(pinned_at).map_err(archive_operation_error)?;
                if pinned_at < node.created_at {
                    return archive_error(format!("node {} is pinned before creation", node.id));
                }
            }
            if nodes.insert(node.id.as_str(), node).is_some() {
                return archive_error(format!("duplicate node {}", node.id));
            }
        }

        for node in &self.nodes {
            let Some(parent_id) = node.parent_id.as_deref() else {
                continue;
            };
            let parent = nodes.get(parent_id).ok_or_else(|| {
                ArchiveValidationError::Invalid(format!("missing parent {parent_id}"))
            })?;
            if parent.kind != NodeKind::Folder {
                return archive_error(format!("parent {parent_id} is not a folder"));
            }
            let mut ancestors = BTreeSet::new();
            let mut current = Some(parent_id);
            while let Some(ancestor_id) = current {
                if !ancestors.insert(ancestor_id) || ancestor_id == node.id {
                    return archive_error(format!("node {} has a parent cycle", node.id));
                }
                current = nodes
                    .get(ancestor_id)
                    .and_then(|ancestor| ancestor.parent_id.as_deref());
            }
        }

        let mut documents = BTreeSet::new();
        for document in &self.documents {
            validate_id("note id", &document.note_id).map_err(archive_operation_error)?;
            let node = nodes.get(document.note_id.as_str()).ok_or_else(|| {
                ArchiveValidationError::Invalid(format!(
                    "document references missing note {}",
                    document.note_id
                ))
            })?;
            if node.kind != NodeKind::Note {
                return archive_error(format!("document {} belongs to a folder", document.note_id));
            }
            validate_document(&document.document_json, &document.markdown)
                .map_err(archive_operation_error)?;
            if document.revision < 1 {
                return archive_error(format!(
                    "document {} has invalid revision",
                    document.note_id
                ));
            }
            if document.word_count < 0 {
                return archive_error(format!(
                    "document {} has negative word count",
                    document.note_id
                ));
            }
            if !documents.insert(document.note_id.as_str()) {
                return archive_error(format!("duplicate document {}", document.note_id));
            }
        }

        for node in self.nodes.iter().filter(|node| node.kind == NodeKind::Note) {
            if !documents.contains(node.id.as_str()) {
                return archive_error(format!("note {} has no document", node.id));
            }
        }

        if let Some(active_note_id) = self.active_note_id.as_deref() {
            let active = nodes.get(active_note_id).ok_or_else(|| {
                ArchiveValidationError::Invalid(format!(
                    "active note {active_note_id} does not exist"
                ))
            })?;
            if active.kind != NodeKind::Note {
                return archive_error(format!("active note {active_note_id} is unavailable"));
            }
            let mut current = Some(*active);
            while let Some(node) = current {
                if node.deleted_at.is_some() {
                    return archive_error(format!("active note {active_note_id} is unavailable"));
                }
                current = node
                    .parent_id
                    .as_deref()
                    .and_then(|parent_id| nodes.get(parent_id).copied());
            }
        }

        self.settings.validate().map_err(archive_operation_error)?;
        validate_relationships(&self.tags, &self.people, &self.documents, &nodes)?;
        validate_archive_properties(
            &self.properties,
            &self.property_templates,
            &self.people,
            &nodes,
        )?;
        validate_workspace_tasks(
            &self.tasks,
            &self
                .documents
                .iter()
                .map(|document| (document.note_id.as_str(), &document.document_json))
                .collect(),
            &self.tags.iter().map(|tag| tag.id.as_str()).collect(),
            &self
                .people
                .iter()
                .map(|person| person.id.as_str())
                .collect(),
        )
        .map_err(archive_operation_error)?;
        validate_workspace_prompts(&self.prompts).map_err(archive_operation_error)?;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub created_in: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePerson {
    pub id: String,
    pub name: String,
    pub initials: Option<String>,
    pub color: Option<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub created_in: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentReference {
    pub kind: ReferenceKind,
    pub target_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReferenceKind {
    Tag,
    Person,
    Note,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NoteReferences {
    pub note_id: String,
    pub targets: Vec<DocumentReference>,
}

pub(crate) fn validate_bounded_text(
    field: &'static str,
    value: &str,
    maximum: usize,
) -> Result<(), OperationValidationError> {
    if value.trim().is_empty() {
        return Err(OperationValidationError::Empty { field });
    }
    if value.len() > maximum {
        return Err(OperationValidationError::TooLong { field, maximum });
    }
    Ok(())
}

fn validate_optional_bounded_text(
    field: &'static str,
    value: &str,
    maximum: usize,
) -> Result<(), OperationValidationError> {
    if value.len() > maximum {
        return Err(OperationValidationError::TooLong { field, maximum });
    }
    Ok(())
}

fn validate_ordered_ids(
    field: &'static str,
    ids: &[String],
    maximum: usize,
) -> Result<(), OperationValidationError> {
    if ids.len() > maximum {
        return Err(OperationValidationError::TooMany { field, maximum });
    }
    let mut unique = BTreeSet::new();
    for id in ids {
        validate_id(field, id)?;
        if !unique.insert(id) {
            return Err(OperationValidationError::Duplicate {
                field,
                id: id.clone(),
            });
        }
    }
    Ok(())
}

fn validate_property_options(
    options: &[NotePropertyOption],
) -> Result<(), OperationValidationError> {
    if options.len() > MAX_PROPERTY_OPTIONS {
        return Err(OperationValidationError::TooMany {
            field: "property options",
            maximum: MAX_PROPERTY_OPTIONS,
        });
    }
    let mut ids = BTreeSet::new();
    for option in options {
        validate_id("property option id", &option.id)?;
        validate_bounded_text(
            "property option label",
            &option.label,
            MAX_PROPERTY_NAME_BYTES,
        )?;
        if !ids.insert(option.id.as_str()) {
            return Err(OperationValidationError::Duplicate {
                field: "property options",
                id: option.id.clone(),
            });
        }
    }
    Ok(())
}

fn require_option_reference(
    field: &'static str,
    id: &str,
    options: &[NotePropertyOption],
) -> Result<(), OperationValidationError> {
    validate_id(field, id)?;
    if options.iter().any(|option| option.id == id) {
        Ok(())
    } else {
        Err(OperationValidationError::UnknownReference {
            field,
            id: id.into(),
        })
    }
}

fn validate_value_ids(
    field: &'static str,
    values: &[String],
    options: &[NotePropertyOption],
) -> Result<(), OperationValidationError> {
    validate_ordered_ids(field, values, MAX_PROPERTY_OPTIONS)?;
    for id in values {
        require_option_reference(field, id, options)?;
    }
    Ok(())
}

pub fn validate_note_property_fields(
    fields: &[NotePropertyField],
) -> Result<(), OperationValidationError> {
    if fields.len() > MAX_NOTE_PROPERTIES {
        return Err(OperationValidationError::TooMany {
            field: "note properties",
            maximum: MAX_NOTE_PROPERTIES,
        });
    }
    let mut ids = BTreeSet::new();
    let mut positions = BTreeSet::new();
    for field in fields {
        field.validate()?;
        if !ids.insert(field.id.as_str()) {
            return Err(OperationValidationError::Duplicate {
                field: "note properties",
                id: field.id.clone(),
            });
        }
        positions.insert(field.position);
    }
    if positions != (0..i64::try_from(fields.len()).unwrap_or(i64::MAX)).collect::<BTreeSet<_>>() {
        return Err(OperationValidationError::InvalidPropertyPositions);
    }
    Ok(())
}

pub fn validate_workspace_properties(
    properties: &[NoteProperty],
    templates: &[NotePropertyTemplate],
    people: &[WorkspacePerson],
    nodes: &[WorkspaceNode],
) -> Result<(), ArchiveValidationError> {
    let nodes = nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<BTreeMap<_, _>>();
    validate_archive_properties(properties, templates, people, &nodes)
}

fn validate_archive_properties(
    properties: &[NoteProperty],
    templates: &[NotePropertyTemplate],
    people: &[WorkspacePerson],
    nodes: &BTreeMap<&str, &WorkspaceNode>,
) -> Result<(), ArchiveValidationError> {
    let person_ids = people
        .iter()
        .map(|person| person.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut grouped = BTreeMap::<&str, Vec<NotePropertyField>>::new();
    for property in properties {
        let node = nodes.get(property.note_id.as_str()).ok_or_else(|| {
            ArchiveValidationError::Invalid(format!(
                "property references missing note {}",
                property.note_id
            ))
        })?;
        if node.kind != NodeKind::Note {
            return archive_error(format!(
                "property {} belongs to a folder",
                property.field.id
            ));
        }
        validate_person_property_references(&property.field, &person_ids)
            .map_err(archive_operation_error)?;
        grouped
            .entry(property.note_id.as_str())
            .or_default()
            .push(property.field.clone());
    }
    for fields in grouped.values() {
        validate_note_property_fields(fields).map_err(archive_operation_error)?;
    }
    let mut template_ids = BTreeSet::new();
    let mut template_positions = BTreeSet::new();
    for template in templates {
        template.validate().map_err(archive_operation_error)?;
        if !template_ids.insert(template.id.as_str()) {
            return archive_error(format!("duplicate property template {}", template.id));
        }
        if !template_positions.insert(template.position) {
            return archive_error(format!(
                "duplicate property template position {}",
                template.position
            ));
        }
        for field in &template.properties {
            validate_person_property_references(field, &person_ids)
                .map_err(archive_operation_error)?;
        }
    }
    if template_positions
        != (0..i64::try_from(templates.len()).unwrap_or(i64::MAX)).collect::<BTreeSet<_>>()
    {
        return archive_error("property template positions must be contiguous from zero");
    }
    Ok(())
}

fn validate_person_property_references(
    field: &NotePropertyField,
    person_ids: &BTreeSet<&str>,
) -> Result<(), OperationValidationError> {
    if let NotePropertyValue::Person(ids) = &field.value.value {
        for id in ids {
            if !person_ids.contains(id.as_str()) {
                return Err(OperationValidationError::UnknownReference {
                    field: "property people",
                    id: id.clone(),
                });
            }
        }
    }
    Ok(())
}

fn archive_error<T>(message: impl Into<String>) -> Result<T, ArchiveValidationError> {
    Err(ArchiveValidationError::Invalid(message.into()))
}

fn archive_operation_error(error: OperationValidationError) -> ArchiveValidationError {
    ArchiveValidationError::Invalid(error.to_string())
}

fn validate_reference_name(value: &str) -> Result<(), OperationValidationError> {
    if value.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "reference name",
        });
    }
    if value.len() > MAX_REFERENCE_NAME_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "reference name",
            maximum: MAX_REFERENCE_NAME_BYTES,
        });
    }
    Ok(())
}

fn validate_reference_color(value: &Option<String>) -> Result<(), OperationValidationError> {
    let Some(color) = value else {
        return Ok(());
    };
    if color.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "reference color",
        });
    }
    if color.len() > MAX_REFERENCE_COLOR_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "reference color",
            maximum: MAX_REFERENCE_COLOR_BYTES,
        });
    }
    Ok(())
}

/// A task operation that also rewrites the source note must submit a document
/// that still carries the task's link. Anything else would leave the record
/// and the checklist item describing different things.
fn validate_task_document(
    task: &WorkspaceTask,
    document: Option<&TaskSourceDocument>,
) -> Result<(), OperationValidationError> {
    let Some(document) = document else {
        return Ok(());
    };
    document.validate()?;
    let Some(source) = &task.source else {
        return Ok(());
    };
    if source.note_id != document.note_id {
        return Err(OperationValidationError::UnknownReference {
            field: "task source note",
            id: document.note_id.clone(),
        });
    }
    let links = document_task_links(&document.document_json);
    let link = unique_document_task_link(&links, &task.id).ok_or_else(|| {
        OperationValidationError::UnlinkedTaskSource {
            id: task.id.clone(),
        }
    })?;
    if link.block_id != source.block_id {
        return Err(OperationValidationError::UnlinkedTaskSource {
            id: task.id.clone(),
        });
    }
    Ok(())
}

fn validate_tag(tag: &WorkspaceTag) -> Result<(), OperationValidationError> {
    validate_id("tag id", &tag.id)?;
    validate_reference_name(&tag.name)
}

fn validate_person(person: &WorkspacePerson) -> Result<(), OperationValidationError> {
    validate_id("person id", &person.id)?;
    validate_reference_name(&person.name)
}

/// Every distinct tag, person, and note a document mentions, in first-mention
/// order. A target mentioned twice is listed once, matching the one row per
/// target that reference storage keeps.
pub fn document_references(value: &Value) -> Vec<DocumentReference> {
    fn visit(value: &Value, targets: &mut Vec<DocumentReference>) {
        let Some(object) = value.as_object() else {
            return;
        };
        let kind = match object.get("type").and_then(Value::as_str) {
            Some("tag_ref") => Some(ReferenceKind::Tag),
            Some("mention_ref") => match object
                .get("attrs")
                .and_then(Value::as_object)
                .and_then(|attrs| attrs.get("kind"))
                .and_then(Value::as_str)
            {
                Some("person") => Some(ReferenceKind::Person),
                Some("note") => Some(ReferenceKind::Note),
                _ => None,
            },
            _ => None,
        };
        if let Some(kind) = kind
            && let Some(id) = object
                .get("attrs")
                .and_then(Value::as_object)
                .and_then(|attrs| attrs.get("id"))
                .and_then(Value::as_str)
            && !targets
                .iter()
                .any(|target| target.kind == kind && target.target_id == id)
        {
            targets.push(DocumentReference {
                kind,
                target_id: id.into(),
            });
        }
        if let Some(content) = object.get("content").and_then(Value::as_array) {
            for child in content {
                visit(child, targets);
            }
        }
    }
    let mut targets = Vec::new();
    visit(value, &mut targets);
    targets
}

fn validate_relationships(
    tags: &[WorkspaceTag],
    people: &[WorkspacePerson],
    documents: &[WorkspaceDocument],
    nodes: &BTreeMap<&str, &WorkspaceNode>,
) -> Result<(), ArchiveValidationError> {
    let mut tag_ids = BTreeSet::new();
    for tag in tags {
        validate_tag(tag).map_err(archive_operation_error)?;
        if !tag_ids.insert(tag.id.as_str()) {
            return archive_error(format!("duplicate tag {}", tag.id));
        }
    }
    let mut person_ids = BTreeSet::new();
    for person in people {
        validate_person(person).map_err(archive_operation_error)?;
        if !person_ids.insert(person.id.as_str()) {
            return archive_error(format!("duplicate person {}", person.id));
        }
    }
    for document in documents {
        for reference in document_references(&document.document_json) {
            let valid = match reference.kind {
                ReferenceKind::Tag => tag_ids.contains(reference.target_id.as_str()),
                ReferenceKind::Person => person_ids.contains(reference.target_id.as_str()),
                ReferenceKind::Note => nodes
                    .get(reference.target_id.as_str())
                    .is_some_and(|node| node.kind == NodeKind::Note),
            };
            if !valid {
                return archive_error(format!(
                    "document {} has dangling reference {}",
                    document.note_id, reference.target_id
                ));
            }
        }
    }
    Ok(())
}

fn validate_content_hash(value: &str) -> Result<(), OperationValidationError> {
    if value.is_empty() {
        return Err(OperationValidationError::Empty {
            field: "content hash",
        });
    }
    if value.len() != IMAGE_CONTENT_HASH_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(OperationValidationError::InvalidIdentifier {
            field: "content hash",
        });
    }
    Ok(())
}

fn validate_cover_transform(
    position_x: f64,
    position_y: f64,
    zoom: f64,
) -> Result<(), OperationValidationError> {
    if !position_x.is_finite()
        || !position_y.is_finite()
        || !zoom.is_finite()
        || !(0.0..=100.0).contains(&position_x)
        || !(0.0..=100.0).contains(&position_y)
        || !(1.0..=3.0).contains(&zoom)
    {
        return Err(OperationValidationError::InvalidCoverTransform);
    }
    Ok(())
}

fn validate_cover_gradient(value: &str) -> Result<(), OperationValidationError> {
    if COVER_GRADIENT_IDS.contains(&value) {
        return Ok(());
    }
    Err(OperationValidationError::UnknownCoverGradient {
        id: value.to_owned(),
    })
}

fn validate_mime_type(value: &str) -> Result<(), OperationValidationError> {
    if value.is_empty() {
        return Err(OperationValidationError::Empty { field: "mime type" });
    }
    if value.len() > MAX_IMAGE_MIME_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "mime type",
            maximum: MAX_IMAGE_MIME_BYTES,
        });
    }
    let subtype = value
        .strip_prefix("image/")
        .or_else(|| value.strip_prefix("video/"))
        .unwrap_or("");
    if subtype.is_empty()
        || !subtype
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'+' | b'.'))
    {
        return Err(OperationValidationError::InvalidIdentifier { field: "mime type" });
    }
    Ok(())
}

/// Collects the ids of every stored-media reference inside a document —
/// `image_ref` nodes and `media` nodes bound to a workspace blob via
/// `refId` — in first-appearance order and without duplicates.
pub fn document_image_ids(value: &Value) -> Vec<String> {
    fn visit(value: &Value, seen: &mut BTreeSet<String>, ids: &mut Vec<String>) {
        let Some(object) = value.as_object() else {
            return;
        };
        let reference = match object.get("type").and_then(Value::as_str) {
            Some("image_ref") => Some("id"),
            Some("media") => Some("refId"),
            _ => None,
        };
        if let Some(attribute) = reference
            && let Some(id) = object
                .get("attrs")
                .and_then(Value::as_object)
                .and_then(|attrs| attrs.get(attribute))
                .and_then(Value::as_str)
            && !id.is_empty()
            && seen.insert(id.into())
        {
            ids.push(id.into());
        }
        if let Some(content) = object.get("content").and_then(Value::as_array) {
            for child in content {
                visit(child, seen, ids);
            }
        }
    }
    let mut seen = BTreeSet::new();
    let mut ids = Vec::new();
    visit(value, &mut seen, &mut ids);
    ids
}

pub(crate) fn validate_id(
    field: &'static str,
    value: &str,
) -> Result<(), OperationValidationError> {
    if value.is_empty() {
        return Err(OperationValidationError::Empty { field });
    }
    if value.len() > MAX_ENTITY_ID_BYTES {
        return Err(OperationValidationError::TooLong {
            field,
            maximum: MAX_ENTITY_ID_BYTES,
        });
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(OperationValidationError::InvalidIdentifier { field });
    }
    Ok(())
}

fn validate_optional_id(
    field: &'static str,
    value: &Option<String>,
) -> Result<(), OperationValidationError> {
    match value {
        Some(value) => validate_id(field, value),
        None => Ok(()),
    }
}

pub(crate) fn validate_title(title: &str) -> Result<(), OperationValidationError> {
    if title.trim().is_empty() {
        return Err(OperationValidationError::Empty { field: "title" });
    }
    if title.len() > MAX_TITLE_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "title",
            maximum: MAX_TITLE_BYTES,
        });
    }
    Ok(())
}

fn validate_setting_key(key: &str) -> Result<(), OperationValidationError> {
    if key.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "setting key",
        });
    }
    if key.len() > MAX_SETTING_KEY_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "setting key",
            maximum: MAX_SETTING_KEY_BYTES,
        });
    }
    Ok(())
}

fn validate_setting_text(field: &'static str, value: &str) -> Result<(), OperationValidationError> {
    if value.len() > MAX_SETTING_TEXT_BYTES {
        return Err(OperationValidationError::TooLong {
            field,
            maximum: MAX_SETTING_TEXT_BYTES,
        });
    }
    Ok(())
}

pub(crate) fn validate_revision(revision: i64) -> Result<(), OperationValidationError> {
    if (1..i64::MAX).contains(&revision) {
        Ok(())
    } else {
        Err(OperationValidationError::InvalidRevision {
            maximum: i64::MAX - 1,
        })
    }
}

pub(crate) fn validate_timestamp(at: i64) -> Result<(), OperationValidationError> {
    if at < 0 {
        Err(OperationValidationError::NegativeTimestamp)
    } else {
        Ok(())
    }
}

#[derive(Clone, Copy)]
struct DocumentLimits {
    json_bytes: usize,
    markdown_bytes: usize,
    nodes: usize,
    depth: usize,
}

const DOCUMENT_LIMITS: DocumentLimits = DocumentLimits {
    json_bytes: MAX_DOCUMENT_JSON_BYTES,
    markdown_bytes: MAX_DOCUMENT_MARKDOWN_BYTES,
    nodes: MAX_DOCUMENT_NODES,
    depth: MAX_DOCUMENT_DEPTH,
};

pub(crate) fn validate_document(
    document: &Value,
    markdown: &str,
) -> Result<(), OperationValidationError> {
    validate_document_with_limits(document, markdown, DOCUMENT_LIMITS)
}

fn validate_document_with_limits(
    document: &Value,
    markdown: &str,
    limits: DocumentLimits,
) -> Result<(), OperationValidationError> {
    if !document.is_object() {
        return Err(OperationValidationError::InvalidDocument);
    }
    if markdown.len() > limits.markdown_bytes {
        return Err(OperationValidationError::TooLong {
            field: "document Markdown",
            maximum: limits.markdown_bytes,
        });
    }
    let mut seen = 0usize;
    let mut stack = vec![(document, 1usize)];
    while let Some((value, depth)) = stack.pop() {
        if depth > limits.depth {
            return Err(OperationValidationError::DocumentTooDeep {
                maximum: limits.depth,
            });
        }
        seen = seen.saturating_add(1);
        if seen > limits.nodes {
            return Err(OperationValidationError::TooMany {
                field: "document JSON nodes",
                maximum: limits.nodes,
            });
        }
        match value {
            Value::Array(values) => {
                stack.extend(values.iter().map(|value| (value, depth + 1)));
            }
            Value::Object(values) => {
                stack.extend(values.values().map(|value| (value, depth + 1)));
            }
            _ => {}
        }
    }
    let mut counter = BoundedWriter::new(limits.json_bytes);
    serde_json::to_writer(&mut counter, document).map_err(|_| OperationValidationError::TooLong {
        field: "document JSON",
        maximum: limits.json_bytes,
    })
}

struct BoundedWriter {
    written: usize,
    maximum: usize,
}

impl BoundedWriter {
    fn new(maximum: usize) -> Self {
        Self {
            written: 0,
            maximum,
        }
    }
}

impl io::Write for BoundedWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if self.written.saturating_add(buffer.len()) > self.maximum {
            return Err(io::Error::new(
                io::ErrorKind::FileTooLarge,
                "document JSON exceeds its byte limit",
            ));
        }
        self.written += buffer.len();
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn validate_parent(id: &str, parent_id: &Option<String>) -> Result<(), OperationValidationError> {
    if parent_id.as_deref() == Some(id) {
        Err(OperationValidationError::SelfParent)
    } else {
        Ok(())
    }
}

fn validate_placement(id: &str, placement: &NodePlacement) -> Result<(), OperationValidationError> {
    validate_optional_id("parent id", &placement.parent_id)?;
    validate_parent(id, &placement.parent_id)?;
    let anchor_id = match &placement.position {
        NodePosition::First | NodePosition::Last => return Ok(()),
        NodePosition::Before { anchor_id } | NodePosition::After { anchor_id } => anchor_id,
    };
    validate_id("anchor id", anchor_id)?;
    if anchor_id == id {
        Err(OperationValidationError::SelfAnchor)
    } else {
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityRevision {
    pub id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NodeRankChange {
    pub id: String,
    pub parent_id: Option<String>,
    pub rank: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OperationAck {
    pub applied: usize,
    pub revisions: Vec<EntityRevision>,
    pub rank_changes: Vec<NodeRankChange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[cfg(test)]
mod tests;
