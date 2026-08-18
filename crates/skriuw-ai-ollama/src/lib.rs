use std::{
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use flate2::read::GzDecoder;
use reqwest::{StatusCode, Url, blocking::Client};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use skriuw_domain::{
    AiCancellation, AiComplete, AiCompletionDelta, AiCompletionRequest, AiCompletionTerminal,
    AiEventSink, AiProviderError, AiProviderErrorCategory, AiRecoveryAction, AiUsage, LocalAiError,
    LocalAiErrorCategory, LocalAiModel, LocalAiOperation, LocalAiProgress, LocalAiProgressSink,
    LocalAiRuntime, LocalAiRuntimeState, LocalAiStatus, MAX_AI_RESPONSE_BYTES,
};
use tempfile::TempDir;

const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:11434";
const RELEASE_API: &str = "https://api.github.com/repos/ollama/ollama/releases/latest";
const MAX_API_RESPONSE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_RELEASE_RESPONSE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_STREAM_EVENT_BYTES: u64 = 64 * 1024;
const MAX_PULL_STREAM_BYTES: u64 = 256 * 1024 * 1024;
const START_TIMEOUT: Duration = Duration::from_secs(15);

pub struct OllamaRuntime {
    endpoint: Url,
    install_root: PathBuf,
    client: Client,
    managed_child: Mutex<Option<Child>>,
    last_failure: Mutex<Option<String>>,
    notice: Option<String>,
}

impl OllamaRuntime {
    pub fn new(install_root: PathBuf, endpoint: Option<&str>) -> Result<Self, LocalAiError> {
        let endpoint = Url::parse(endpoint.unwrap_or(DEFAULT_ENDPOINT)).map_err(|_| {
            LocalAiError::new(
                LocalAiErrorCategory::InvalidRequest,
                "Ollama endpoint is invalid",
            )
        })?;
        if !endpoint_is_loopback(&endpoint) {
            return Err(LocalAiError::new(
                LocalAiErrorCategory::InvalidRequest,
                "Ollama endpoint must use localhost or a loopback address",
            ));
        }
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(300))
            .user_agent("Skriuw local AI")
            .build()
            .map_err(|error| local_error(LocalAiErrorCategory::Unavailable, error))?;
        Ok(Self {
            endpoint,
            install_root,
            client,
            managed_child: Mutex::new(None),
            last_failure: Mutex::new(None),
            notice: None,
        })
    }

    /// Builds a runtime from an optional endpoint override supplied by the host
    /// environment. An override that is not a loopback HTTP endpoint is refused
    /// without blocking construction: the runtime keeps the default endpoint and
    /// reports the refusal in its status detail, so a bad override degrades the
    /// local AI surface instead of the application that hosts it.
    pub fn with_endpoint_override(
        install_root: PathBuf,
        endpoint: Option<&str>,
    ) -> Result<Self, LocalAiError> {
        let Some(requested) = endpoint else {
            return Self::new(install_root, None);
        };
        match Self::new(install_root.clone(), Some(requested)) {
            Ok(runtime) => Ok(runtime),
            Err(refused) => Ok(Self {
                notice: Some(format!(
                    "{}. Using {DEFAULT_ENDPOINT} instead.",
                    refused.message
                )),
                ..Self::new(install_root, None)?
            }),
        }
    }

    #[must_use]
    pub fn endpoint(&self) -> &Url {
        &self.endpoint
    }

    fn detail(&self, failure: Option<String>) -> Option<String> {
        match (failure, self.notice.as_deref()) {
            (Some(failure), Some(notice)) => Some(format!("{failure}. {notice}")),
            (Some(failure), None) => Some(failure),
            (None, Some(notice)) => Some(notice.to_owned()),
            (None, None) => None,
        }
    }

    fn api_url(&self, path: &str) -> Result<Url, LocalAiError> {
        self.endpoint.join(path).map_err(|_| {
            LocalAiError::new(
                LocalAiErrorCategory::InvalidRequest,
                "Ollama API path is invalid",
            )
        })
    }

    fn app_binary(&self) -> PathBuf {
        self.install_root.join("bin").join(if cfg!(windows) {
            "ollama.exe"
        } else {
            "ollama"
        })
    }

    fn available_binary(&self) -> Option<PathBuf> {
        let owned = self.app_binary();
        if owned.is_file() {
            return Some(owned);
        }
        find_on_path(if cfg!(windows) {
            "ollama.exe"
        } else {
            "ollama"
        })
    }

    fn server_version(&self) -> Option<String> {
        let response = self
            .client
            .get(self.api_url("/api/version").ok()?)
            .timeout(Duration::from_millis(750))
            .send()
            .ok()?;
        if !response.status().is_success() {
            return None;
        }
        response
            .json::<VersionResponse>()
            .ok()
            .and_then(|response| valid_short_text(&response.version).then_some(response.version))
    }

    fn reap_managed_child(&self) -> bool {
        let mut child = lock(&self.managed_child);
        let Some(active) = child.as_mut() else {
            return false;
        };
        match active.try_wait() {
            Ok(None) => true,
            Ok(Some(status)) => {
                *lock(&self.last_failure) = Some(format!("Ollama stopped with {status}"));
                *child = None;
                false
            }
            Err(error) => {
                *lock(&self.last_failure) = Some(format!("Could not inspect Ollama: {error}"));
                *child = None;
                false
            }
        }
    }

    fn emit(
        sink: &mut dyn LocalAiProgressSink,
        operation_id: &str,
        operation: LocalAiOperation,
        status: impl Into<String>,
        completed_bytes: u64,
        total_bytes: Option<u64>,
    ) -> Result<(), LocalAiError> {
        sink.send(LocalAiProgress::Progress {
            operation_id: operation_id.to_owned(),
            operation,
            status: status.into(),
            completed_bytes,
            total_bytes,
        })
    }

    fn terminal(
        sink: &mut dyn LocalAiProgressSink,
        operation_id: &str,
        operation: LocalAiOperation,
        cancelled: bool,
    ) -> Result<(), LocalAiError> {
        sink.send(if cancelled {
            LocalAiProgress::Cancelled {
                operation_id: operation_id.to_owned(),
                operation,
            }
        } else {
            LocalAiProgress::Complete {
                operation_id: operation_id.to_owned(),
                operation,
            }
        })
    }

    fn install_archive(
        &self,
        operation_id: &str,
        cancellation: &AiCancellation,
        sink: &mut dyn LocalAiProgressSink,
    ) -> Result<(), LocalAiError> {
        let asset_name = release_asset_name()?;
        Self::emit(
            sink,
            operation_id,
            LocalAiOperation::Install,
            "Checking release",
            0,
            None,
        )?;
        let release = read_json_capped::<ReleaseResponse>(
            self.client.get(RELEASE_API).send(),
            MAX_RELEASE_RESPONSE_BYTES,
        )?;
        let asset = release
            .assets
            .into_iter()
            .find(|asset| asset.name == asset_name)
            .ok_or_else(|| {
                LocalAiError::new(
                    LocalAiErrorCategory::Unsupported,
                    format!(
                        "Ollama release {} has no {asset_name} asset",
                        release.tag_name
                    ),
                )
            })?;
        let expected_digest = asset
            .digest
            .as_deref()
            .and_then(|digest| digest.strip_prefix("sha256:"))
            .filter(|digest| valid_sha256(digest))
            .ok_or_else(|| {
                LocalAiError::new(
                    LocalAiErrorCategory::ChecksumMismatch,
                    "Ollama release asset has no valid SHA-256 digest",
                )
            })?;
        let temporary = TempDir::new_in(
            self.install_root
                .parent()
                .unwrap_or(self.install_root.as_path()),
        )
        .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?;
        let archive_path = temporary.path().join(&asset.name);
        download(
            &self.client,
            &asset.browser_download_url,
            &archive_path,
            operation_id,
            cancellation,
            sink,
        )?;
        if cancellation.is_cancelled() {
            Self::terminal(sink, operation_id, LocalAiOperation::Install, true)?;
            return Err(LocalAiError::new(
                LocalAiErrorCategory::Cancelled,
                "Ollama installation cancelled",
            ));
        }
        Self::emit(
            sink,
            operation_id,
            LocalAiOperation::Install,
            "Verifying download",
            0,
            None,
        )?;
        verify_sha256(&archive_path, expected_digest)?;
        let extracted = temporary.path().join("extracted");
        fs::create_dir_all(&extracted)
            .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?;
        extract_archive(&archive_path, &extracted)?;
        let source = find_binary_bounded(&extracted, 5).ok_or_else(|| {
            LocalAiError::new(
                LocalAiErrorCategory::InstallFailed,
                "Ollama archive contained no executable",
            )
        })?;
        let destination = self.app_binary();
        let bin_dir = destination.parent().ok_or_else(|| {
            LocalAiError::new(
                LocalAiErrorCategory::InstallFailed,
                "Ollama install path is invalid",
            )
        })?;
        fs::create_dir_all(bin_dir)
            .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?;
        let pending = bin_dir.join(if cfg!(windows) {
            "ollama.pending.exe"
        } else {
            "ollama.pending"
        });
        fs::copy(source, &pending)
            .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?;
        set_executable(&pending)?;
        fs::rename(&pending, &destination)
            .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?;
        Self::terminal(sink, operation_id, LocalAiOperation::Install, false)
    }
}

impl LocalAiRuntime for OllamaRuntime {
    fn status(&self) -> Result<LocalAiStatus, LocalAiError> {
        let managed = self.reap_managed_child();
        if let Some(version) = self.server_version() {
            return Ok(LocalAiStatus {
                state: LocalAiRuntimeState::Running,
                version: Some(version),
                endpoint: self.endpoint.to_string(),
                managed,
                detail: self.detail(None),
            });
        }
        let failure = lock(&self.last_failure).clone();
        let state = if self.available_binary().is_some() {
            if failure.is_some() {
                LocalAiRuntimeState::Failed
            } else {
                LocalAiRuntimeState::InstalledStopped
            }
        } else if cfg!(windows) {
            LocalAiRuntimeState::Unsupported
        } else {
            LocalAiRuntimeState::NotInstalled
        };
        Ok(LocalAiStatus {
            state,
            version: None,
            endpoint: self.endpoint.to_string(),
            managed: false,
            detail: self.detail(failure),
        })
    }

    fn start(&self) -> Result<LocalAiStatus, LocalAiError> {
        if self.server_version().is_some() {
            return self.status();
        }
        let binary = self.available_binary().ok_or_else(|| {
            LocalAiError::new(LocalAiErrorCategory::Unavailable, "Ollama is not installed")
        })?;
        let child = Command::new(binary)
            .arg("serve")
            .env("OLLAMA_HOST", self.endpoint.as_str())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| local_error(LocalAiErrorCategory::ProcessFailed, error))?;
        *lock(&self.managed_child) = Some(child);
        *lock(&self.last_failure) = None;
        let deadline = Instant::now() + START_TIMEOUT;
        while Instant::now() < deadline {
            if self.server_version().is_some() {
                return self.status();
            }
            if !self.reap_managed_child() {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        Err(LocalAiError::new(
            LocalAiErrorCategory::ProcessFailed,
            "Ollama did not become ready within 15 seconds",
        ))
    }

    fn stop(&self) -> Result<LocalAiStatus, LocalAiError> {
        self.shutdown();
        self.status()
    }

    fn install(
        &self,
        operation_id: &str,
        cancellation: &AiCancellation,
        sink: &mut dyn LocalAiProgressSink,
    ) -> Result<LocalAiStatus, LocalAiError> {
        validate_operation_id(operation_id)?;
        if cfg!(windows) {
            return Err(LocalAiError::new(
                LocalAiErrorCategory::Unsupported,
                "Install Ollama from ollama.com/download/windows",
            ));
        }
        self.install_archive(operation_id, cancellation, sink)?;
        self.start()
    }

    fn list_models(&self) -> Result<Vec<LocalAiModel>, LocalAiError> {
        let response = read_json_capped::<TagsResponse>(
            self.client.get(self.api_url("/api/tags")?).send(),
            MAX_API_RESPONSE_BYTES,
        )?;
        response.models.into_iter().map(validate_model).collect()
    }

    fn pull_model(
        &self,
        operation_id: &str,
        model: &str,
        cancellation: &AiCancellation,
        sink: &mut dyn LocalAiProgressSink,
    ) -> Result<(), LocalAiError> {
        validate_operation_id(operation_id)?;
        validate_model_name(model)?;
        let response = self
            .client
            .post(self.api_url("/api/pull")?)
            .json(&ModelRequest {
                model,
                stream: true,
            })
            .send()
            .map_err(|error| local_error(LocalAiErrorCategory::Unavailable, error))?;
        ensure_success(response.status())?;
        let mut reader = BufReader::new(response.take(MAX_PULL_STREAM_BYTES + 1));
        let mut line = String::new();
        let mut consumed = 0u64;
        loop {
            if cancellation.is_cancelled() {
                Self::terminal(sink, operation_id, LocalAiOperation::Pull, true)?;
                return Err(LocalAiError::new(
                    LocalAiErrorCategory::Cancelled,
                    "Model pull cancelled",
                ));
            }
            let read = read_stream_event(&mut reader, &mut line)?;
            if read == 0 {
                break;
            }
            consumed = consumed.saturating_add(read as u64);
            if consumed > MAX_PULL_STREAM_BYTES {
                return Err(LocalAiError::new(
                    LocalAiErrorCategory::MalformedResponse,
                    "Ollama pull response was too large",
                ));
            }
            let event = line.trim();
            if event.is_empty() {
                continue;
            }
            let update: PullResponse = serde_json::from_str(event).map_err(|_| {
                LocalAiError::new(
                    LocalAiErrorCategory::MalformedResponse,
                    "Ollama returned invalid pull progress",
                )
            })?;
            Self::emit(
                sink,
                operation_id,
                LocalAiOperation::Pull,
                update.status,
                update.completed.unwrap_or(0),
                update.total,
            )?;
        }
        Self::terminal(sink, operation_id, LocalAiOperation::Pull, false)
    }

    fn remove_model(&self, model: &str) -> Result<(), LocalAiError> {
        validate_model_name(model)?;
        let response = self
            .client
            .delete(self.api_url("/api/delete")?)
            .json(&ModelRequest {
                model,
                stream: false,
            })
            .send()
            .map_err(|error| local_error(LocalAiErrorCategory::Unavailable, error))?;
        ensure_success(response.status())
    }

    fn shutdown(&self) {
        if let Some(mut child) = lock(&self.managed_child).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl AiComplete for OllamaRuntime {
    fn complete(
        &self,
        request: &AiCompletionRequest,
        cancellation: &AiCancellation,
        sink: &mut dyn AiEventSink,
    ) -> AiCompletionTerminal {
        if request.validate().is_err() || request.provider_id != "ollama" {
            return provider_error(
                AiProviderErrorCategory::RejectedRequest,
                "Ollama completion request is invalid",
                AiRecoveryAction::ReduceRequest,
            );
        }
        let body = GenerateRequest {
            model: &request.model_id,
            system: &request.system_prompt,
            prompt: &request.user_prompt,
            stream: true,
            options: GenerateOptions {
                temperature: request
                    .parameters
                    .temperature_millis
                    .map(|value| f32::from(value) / 1_000.0),
                top_p: request
                    .parameters
                    .top_p_millis
                    .map(|value| f32::from(value) / 1_000.0),
            },
        };
        let response = match self
            .client
            .post(match self.api_url("/api/generate") {
                Ok(url) => url,
                Err(_) => {
                    return provider_error(
                        AiProviderErrorCategory::InternalFailure,
                        "Ollama endpoint is invalid",
                        AiRecoveryAction::CheckProviderStatus,
                    );
                }
            })
            .timeout(Duration::from_millis(u64::from(
                request.parameters.timeout_ms,
            )))
            .json(&body)
            .send()
        {
            Ok(response) if response.status().is_success() => response,
            Ok(response) if response.status() == StatusCode::NOT_FOUND => {
                return provider_error(
                    AiProviderErrorCategory::UnavailableProvider,
                    "Ollama model is not installed",
                    AiRecoveryAction::ChooseDifferentModel,
                );
            }
            Ok(_) => {
                return provider_error(
                    AiProviderErrorCategory::TransportFailure,
                    "Ollama rejected the completion request",
                    AiRecoveryAction::CheckProviderStatus,
                );
            }
            Err(error) if error.is_timeout() => return AiCompletionTerminal::Timeout,
            Err(_) => {
                return provider_error(
                    AiProviderErrorCategory::UnavailableProvider,
                    "Ollama is not reachable",
                    AiRecoveryAction::CheckProviderStatus,
                );
            }
        };
        let mut reader = BufReader::new(response.take(MAX_AI_RESPONSE_BYTES as u64 + 1));
        let mut line = String::new();
        let mut sequence = 0u32;
        let mut response_bytes = 0usize;
        loop {
            if cancellation.is_cancelled() {
                return AiCompletionTerminal::Cancelled;
            }
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    return provider_error(
                        AiProviderErrorCategory::MalformedResponse,
                        "Ollama ended the response without a terminal event",
                        AiRecoveryAction::Retry,
                    );
                }
                Ok(_) => {}
                Err(_) => {
                    return provider_error(
                        AiProviderErrorCategory::TransportFailure,
                        "Ollama response stream failed",
                        AiRecoveryAction::Retry,
                    );
                }
            }
            let event: GenerateResponse = match serde_json::from_str(line.trim()) {
                Ok(event) => event,
                Err(_) => {
                    return provider_error(
                        AiProviderErrorCategory::MalformedResponse,
                        "Ollama returned malformed completion data",
                        AiRecoveryAction::Retry,
                    );
                }
            };
            if !event.response.is_empty() {
                response_bytes = response_bytes.saturating_add(event.response.len());
                if response_bytes > request.parameters.max_output_bytes as usize
                    || response_bytes > MAX_AI_RESPONSE_BYTES
                {
                    cancellation.cancel();
                    return provider_error(
                        AiProviderErrorCategory::MalformedResponse,
                        "Ollama response exceeded the output limit",
                        AiRecoveryAction::ReduceRequest,
                    );
                }
                let delta = AiCompletionDelta {
                    request_id: request.request_id.clone(),
                    sequence,
                    text: event.response,
                };
                if delta.validate().is_err() || sink.send_delta(delta).is_err() {
                    cancellation.cancel();
                    return AiCompletionTerminal::Cancelled;
                }
                sequence = match sequence.checked_add(1) {
                    Some(next) => next,
                    None => {
                        return provider_error(
                            AiProviderErrorCategory::MalformedResponse,
                            "Ollama returned too many deltas",
                            AiRecoveryAction::Retry,
                        );
                    }
                };
            }
            if event.done {
                return AiCompletionTerminal::Done {
                    usage: match (event.prompt_eval_count, event.eval_count) {
                        (Some(input_tokens), Some(output_tokens)) => Some(AiUsage {
                            input_tokens,
                            output_tokens,
                        }),
                        _ => None,
                    },
                };
            }
        }
    }
}

#[derive(Deserialize)]
struct VersionResponse {
    version: String,
}

#[derive(Deserialize)]
struct ReleaseResponse {
    tag_name: String,
    assets: Vec<ReleaseAsset>,
}

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<OllamaModelResponse>,
}

#[derive(Deserialize)]
struct OllamaModelResponse {
    name: String,
    modified_at: String,
    size: u64,
    digest: String,
    details: Option<OllamaModelDetails>,
}

#[derive(Deserialize)]
struct OllamaModelDetails {
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

#[derive(Serialize)]
struct ModelRequest<'a> {
    model: &'a str,
    stream: bool,
}

#[derive(Deserialize)]
struct PullResponse {
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
}

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    system: &'a str,
    prompt: &'a str,
    stream: bool,
    options: GenerateOptions,
}

#[derive(Serialize)]
struct GenerateOptions {
    temperature: Option<f32>,
    top_p: Option<f32>,
}

#[derive(Deserialize)]
struct GenerateResponse {
    #[serde(default)]
    response: String,
    #[serde(default)]
    done: bool,
    prompt_eval_count: Option<u64>,
    eval_count: Option<u64>,
}

fn validate_model(response: OllamaModelResponse) -> Result<LocalAiModel, LocalAiError> {
    validate_model_name(&response.name)?;
    if !valid_sha256(&response.digest) || !valid_short_text(&response.modified_at) {
        return Err(LocalAiError::new(
            LocalAiErrorCategory::MalformedResponse,
            "Ollama returned invalid model metadata",
        ));
    }
    let details = response.details;
    Ok(LocalAiModel {
        name: response.name,
        size_bytes: response.size,
        modified_at: response.modified_at,
        digest: response.digest,
        parameter_size: details
            .as_ref()
            .and_then(|details| details.parameter_size.clone())
            .filter(|value| valid_short_text(value)),
        quantization_level: details
            .and_then(|details| details.quantization_level)
            .filter(|value| valid_short_text(value)),
    })
}

fn validate_model_name(model: &str) -> Result<(), LocalAiError> {
    if model.is_empty()
        || model.len() > 256
        || model.starts_with('/')
        || model
            .split('/')
            .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
        || !model.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b':' | b'/')
        })
    {
        return Err(LocalAiError::new(
            LocalAiErrorCategory::InvalidRequest,
            "Ollama model name is invalid",
        ));
    }
    Ok(())
}

fn validate_operation_id(operation_id: &str) -> Result<(), LocalAiError> {
    if operation_id.is_empty()
        || operation_id.len() > 128
        || !operation_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(LocalAiError::new(
            LocalAiErrorCategory::InvalidRequest,
            "Local AI operation ID is invalid",
        ));
    }
    Ok(())
}

fn endpoint_is_loopback(endpoint: &Url) -> bool {
    endpoint.scheme() == "http"
        && endpoint.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .trim_start_matches('[')
                    .trim_end_matches(']')
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|address| address.is_loopback())
        })
}

fn read_json_capped<T: for<'de> Deserialize<'de>>(
    response: Result<reqwest::blocking::Response, reqwest::Error>,
    limit: u64,
) -> Result<T, LocalAiError> {
    let response =
        response.map_err(|error| local_error(LocalAiErrorCategory::Unavailable, error))?;
    ensure_success(response.status())?;
    let mut bytes = Vec::new();
    response
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| local_error(LocalAiErrorCategory::MalformedResponse, error))?;
    if bytes.len() as u64 > limit {
        return Err(LocalAiError::new(
            LocalAiErrorCategory::MalformedResponse,
            "Ollama response exceeded its size limit",
        ));
    }
    serde_json::from_slice(&bytes).map_err(|_| {
        LocalAiError::new(
            LocalAiErrorCategory::MalformedResponse,
            "Ollama returned malformed JSON",
        )
    })
}

fn read_stream_event<R: BufRead>(reader: &mut R, line: &mut String) -> Result<usize, LocalAiError> {
    line.clear();
    let read = reader
        .by_ref()
        .take(MAX_STREAM_EVENT_BYTES + 1)
        .read_line(line)
        .map_err(|error| local_error(LocalAiErrorCategory::DownloadFailed, error))?;
    if read as u64 > MAX_STREAM_EVENT_BYTES {
        return Err(LocalAiError::new(
            LocalAiErrorCategory::MalformedResponse,
            "Ollama returned an oversized stream event",
        ));
    }
    Ok(read)
}

fn ensure_success(status: StatusCode) -> Result<(), LocalAiError> {
    if status.is_success() {
        Ok(())
    } else {
        Err(LocalAiError::new(
            LocalAiErrorCategory::Unavailable,
            format!("Ollama returned HTTP {status}"),
        ))
    }
}

fn download(
    client: &Client,
    url: &str,
    destination: &Path,
    operation_id: &str,
    cancellation: &AiCancellation,
    sink: &mut dyn LocalAiProgressSink,
) -> Result<(), LocalAiError> {
    let mut response = client
        .get(url)
        .send()
        .map_err(|error| local_error(LocalAiErrorCategory::DownloadFailed, error))?;
    ensure_success(response.status())?;
    let total = response.content_length();
    let mut file = fs::File::create(destination)
        .map_err(|error| local_error(LocalAiErrorCategory::DownloadFailed, error))?;
    let mut buffer = [0u8; 64 * 1024];
    let mut completed = 0u64;
    loop {
        if cancellation.is_cancelled() {
            return Ok(());
        }
        let read = response
            .read(&mut buffer)
            .map_err(|error| local_error(LocalAiErrorCategory::DownloadFailed, error))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| local_error(LocalAiErrorCategory::DownloadFailed, error))?;
        completed = completed.saturating_add(read as u64);
        OllamaRuntime::emit(
            sink,
            operation_id,
            LocalAiOperation::Install,
            "Downloading Ollama",
            completed,
            total,
        )?;
    }
    file.sync_all()
        .map_err(|error| local_error(LocalAiErrorCategory::DownloadFailed, error))
}

fn release_asset_name() -> Result<&'static str, LocalAiError> {
    match (env::consts::OS, env::consts::ARCH) {
        ("linux", "x86_64") => Ok("ollama-linux-amd64.tar.zst"),
        ("linux", "aarch64") => Ok("ollama-linux-arm64.tar.zst"),
        ("macos", _) => Ok("ollama-darwin.tgz"),
        _ => Err(LocalAiError::new(
            LocalAiErrorCategory::Unsupported,
            "This platform has no supported Ollama app-owned archive",
        )),
    }
}

fn extract_archive(archive: &Path, destination: &Path) -> Result<(), LocalAiError> {
    let file = fs::File::open(archive)
        .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?;
    if archive
        .extension()
        .is_some_and(|extension| extension == "zst")
    {
        let decoder = zstd::Decoder::new(file)
            .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?;
        tar::Archive::new(decoder)
            .unpack(destination)
            .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))
    } else {
        tar::Archive::new(GzDecoder::new(file))
            .unpack(destination)
            .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))
    }
}

fn find_binary_bounded(root: &Path, remaining_depth: usize) -> Option<PathBuf> {
    if remaining_depth == 0 {
        return None;
    }
    for entry in fs::read_dir(root).ok()?.flatten() {
        let path = entry.path();
        if path.is_file()
            && entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(if cfg!(windows) {
                    "ollama.exe"
                } else {
                    "ollama"
                })
        {
            return Some(path);
        }
        if path.is_dir()
            && let Some(found) = find_binary_bounded(&path, remaining_depth - 1)
        {
            return Some(found);
        }
    }
    None
}

fn find_on_path(binary: &str) -> Option<PathBuf> {
    env::split_paths(&env::var_os("PATH")?)
        .map(|directory| directory.join(binary))
        .find(|candidate| candidate.is_file())
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), LocalAiError> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))?
        .permissions();
    permissions.set_mode(0o700);
    fs::set_permissions(path, permissions)
        .map_err(|error| local_error(LocalAiErrorCategory::InstallFailed, error))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), LocalAiError> {
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String, LocalAiError> {
    let mut file = fs::File::open(path)
        .map_err(|error| local_error(LocalAiErrorCategory::ChecksumMismatch, error))?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| local_error(LocalAiErrorCategory::ChecksumMismatch, error))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), LocalAiError> {
    if !valid_sha256(expected) || file_sha256(path)? != expected {
        return Err(LocalAiError::new(
            LocalAiErrorCategory::ChecksumMismatch,
            "Ollama download checksum did not match the signed release metadata",
        ));
    }
    Ok(())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_short_text(value: &str) -> bool {
    !value.is_empty() && value.len() <= 256 && !value.chars().any(char::is_control)
}

fn provider_error(
    category: AiProviderErrorCategory,
    message: &str,
    recovery_action: AiRecoveryAction,
) -> AiCompletionTerminal {
    AiCompletionTerminal::ProviderError(AiProviderError::new(
        "ollama",
        category,
        message,
        recovery_action,
    ))
}

fn local_error(category: LocalAiErrorCategory, error: impl std::fmt::Display) -> LocalAiError {
    LocalAiError::new(category, error.to_string())
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        io::{Read, Write},
        net::TcpListener,
        path::PathBuf,
        sync::{Arc, Mutex},
        thread,
        time::{Duration, Instant},
    };

    use super::{
        MAX_STREAM_EVENT_BYTES, OllamaRuntime, endpoint_is_loopback, extract_archive,
        find_binary_bounded, lock, valid_sha256, validate_model_name, verify_sha256,
    };
    use reqwest::Url;
    use sha2::{Digest, Sha256};
    use skriuw_domain::{
        AiCancellation, AiComplete, AiCompletionDelta, AiCompletionParameters, AiCompletionRequest,
        AiCompletionTerminal, AiEventSink, AiSinkError, LocalAiError, LocalAiErrorCategory,
        LocalAiProgress, LocalAiProgressSink, LocalAiRuntime, LocalAiRuntimeState,
    };
    use tempfile::{TempDir, tempdir};

    /// Device verification starts real servers; keeping them off the default
    /// port leaves any Ollama the host already runs untouched.
    const VERIFY_ENDPOINT: &str = "http://127.0.0.1:21556";

    #[test]
    fn accepts_only_loopback_http_endpoints() {
        assert!(endpoint_is_loopback(
            &Url::parse("http://127.0.0.1:11434").unwrap()
        ));
        assert!(endpoint_is_loopback(
            &Url::parse("http://[::1]:11434").unwrap()
        ));
        assert!(!endpoint_is_loopback(
            &Url::parse("https://ollama.com").unwrap()
        ));
    }

    #[test]
    fn validates_model_names_and_release_digests() {
        assert!(validate_model_name("gemma3:4b").is_ok());
        assert!(validate_model_name("../model").is_err());
        assert!(valid_sha256(&"a".repeat(64)));
        assert!(!valid_sha256("aabb"));
    }

    #[test]
    fn rejects_a_corrupted_release_download() {
        let directory = tempdir().unwrap();
        let archive = directory.path().join("ollama.tar.zst");
        fs::write(&archive, b"verified bytes").unwrap();
        let expected = format!("{:x}", Sha256::digest(b"verified bytes"));

        assert!(verify_sha256(&archive, &expected).is_ok());
        fs::write(&archive, b"corrupted bytes").unwrap();
        assert!(verify_sha256(&archive, &expected).is_err());
    }

    #[test]
    fn detects_an_existing_server_without_claiming_ownership() {
        let (endpoint, server) =
            serve_once("application/json", r#"{"version":"0.32.5"}"#.to_owned());
        let (runtime, _directory) = runtime(&endpoint);

        let status = runtime.status().unwrap();

        assert_eq!(status.state, LocalAiRuntimeState::Running);
        assert_eq!(status.version.as_deref(), Some("0.32.5"));
        assert!(!status.managed);
        server.join().unwrap();
    }

    #[test]
    fn streams_ollama_completion_through_the_provider_seam() {
        let body = concat!(
            "{\"response\":\"local \",\"done\":false}\n",
            "{\"response\":\"answer\",\"done\":true,\"prompt_eval_count\":3,\"eval_count\":2}\n"
        )
        .to_owned();
        let (endpoint, server) = serve_once("application/x-ndjson", body);
        let (runtime, _directory) = runtime(&endpoint);
        let mut sink = RecordingSink::default();
        let request = AiCompletionRequest {
            request_id: "request-1".into(),
            provider_id: "ollama".into(),
            model_id: "gemma3:4b".into(),
            system_prompt: "Be concise.".into(),
            user_prompt: "Answer locally.".into(),
            parameters: AiCompletionParameters::default(),
        };

        let terminal = runtime.complete(&request, &AiCancellation::new(), &mut sink);

        assert_eq!(sink.deltas.len(), 2);
        assert_eq!(sink.deltas[0].text, "local ");
        assert_eq!(sink.deltas[1].sequence, 1);
        assert!(matches!(
            terminal,
            AiCompletionTerminal::Done { usage: Some(_) }
        ));
        server.join().unwrap();
    }

    #[test]
    fn extracts_a_release_archive_and_finds_its_nested_executable() {
        let directory = tempdir().unwrap();
        let archive = directory.path().join("ollama-linux-amd64.tar.zst");
        write_archive(&archive, "bin/ollama");
        let extracted = directory.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();

        extract_archive(&archive, &extracted).unwrap();

        let binary = find_binary_bounded(&extracted, 5).expect("archive executable");
        assert_eq!(fs::read(&binary).unwrap(), b"#!/bin/sh\n");
    }

    #[test]
    fn refuses_an_archive_that_buries_its_executable_too_deeply() {
        let directory = tempdir().unwrap();
        let archive = directory.path().join("ollama-linux-amd64.tar.zst");
        write_archive(&archive, "a/b/c/d/e/f/ollama");
        let extracted = directory.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();
        extract_archive(&archive, &extracted).unwrap();

        assert!(find_binary_bounded(&extracted, 5).is_none());
    }

    #[test]
    fn refuses_an_archive_without_an_executable() {
        let directory = tempdir().unwrap();
        let archive = directory.path().join("ollama-linux-amd64.tar.zst");
        write_archive(&archive, "bin/readme.txt");
        let extracted = directory.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();
        extract_archive(&archive, &extracted).unwrap();

        assert!(find_binary_bounded(&extracted, 5).is_none());
    }

    #[test]
    fn refuses_a_non_loopback_override_without_blocking_construction() {
        let directory = tempdir().unwrap();
        let runtime = OllamaRuntime::with_endpoint_override(
            directory.path().join("ollama"),
            Some("https://ollama.example.com"),
        )
        .unwrap();

        let status = runtime.status().unwrap();

        assert_eq!(runtime.endpoint().as_str(), "http://127.0.0.1:11434/");
        assert!(
            status
                .detail
                .as_deref()
                .is_some_and(|detail| detail.contains("loopback")),
            "expected the refused override to stay visible, got {:?}",
            status.detail
        );
        assert_ne!(status.state, LocalAiRuntimeState::Failed);
    }

    #[test]
    fn honours_a_loopback_override() {
        let directory = tempdir().unwrap();
        let runtime = OllamaRuntime::with_endpoint_override(
            directory.path().join("ollama"),
            Some("http://127.0.0.1:21434"),
        )
        .unwrap();

        assert_eq!(runtime.endpoint().as_str(), "http://127.0.0.1:21434/");
        assert_eq!(runtime.status().unwrap().detail, None);
    }

    #[test]
    fn streams_a_long_pull_without_capping_it_at_a_single_response_size() {
        let mut body = String::new();
        let mut lines = 0u64;
        while (body.len() as u64) <= super::MAX_API_RESPONSE_BYTES {
            body.push_str(&format!(
                "{{\"status\":\"pulling 4f2b0c1e\",\"completed\":{lines},\"total\":9000000000}}\n"
            ));
            lines += 1;
        }
        body.push_str("\n{\"status\":\"success\"}\n");
        let (endpoint, server) = serve_once("application/x-ndjson", body);
        let (runtime, _directory) = runtime(&endpoint);
        let mut sink = RecordingProgress::default();

        runtime
            .pull_model("pull-1", "gemma3:4b", &AiCancellation::new(), &mut sink)
            .unwrap();

        assert_eq!(sink.events.len() as u64, lines + 2);
        assert!(matches!(
            sink.events.last(),
            Some(LocalAiProgress::Complete { .. })
        ));
        server.join().unwrap();
    }

    #[test]
    fn rejects_an_oversized_pull_stream_event() {
        let body = format!(
            "{{\"status\":\"{}\"}}\n",
            "s".repeat(MAX_STREAM_EVENT_BYTES as usize + 1)
        );
        let (endpoint, server) = serve_once("application/x-ndjson", body);
        let (runtime, _directory) = runtime(&endpoint);
        let mut sink = RecordingProgress::default();

        let error = runtime
            .pull_model("pull-1", "gemma3:4b", &AiCancellation::new(), &mut sink)
            .unwrap_err();

        assert_eq!(error.category, LocalAiErrorCategory::MalformedResponse);
        assert!(sink.events.is_empty());
        server.join().unwrap();
    }

    #[test]
    fn cancels_a_pull_before_reading_the_stream() {
        let (endpoint, server) = serve_once("application/x-ndjson", "{\"status\":\"x\"}\n".into());
        let (runtime, _directory) = runtime(&endpoint);
        let cancellation = AiCancellation::new();
        cancellation.cancel();
        let mut sink = RecordingProgress::default();

        let error = runtime
            .pull_model("pull-1", "gemma3:4b", &cancellation, &mut sink)
            .unwrap_err();

        assert_eq!(error.category, LocalAiErrorCategory::Cancelled);
        assert!(matches!(
            sink.events.as_slice(),
            [LocalAiProgress::Cancelled { .. }]
        ));
        server.join().unwrap();
    }

    /// Device verification for the download half of the install path. The
    /// archive and its extraction need several gigabytes, so the base directory
    /// is taken from `SKRIUW_INSTALL_VERIFY_DIR` and should name a disk-backed
    /// path on hosts where the default temporary directory lives in RAM.
    #[test]
    #[ignore = "device verification: downloads a real Ollama release (~1.4 GB)"]
    fn installs_a_real_release_into_an_app_owned_directory() {
        let base = env::var_os("SKRIUW_INSTALL_VERIFY_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(env::temp_dir);
        let directory = TempDir::new_in(&base).unwrap();
        let install_root = directory.path().join("ollama");
        let runtime =
            OllamaRuntime::with_endpoint_override(install_root.clone(), Some(VERIFY_ENDPOINT))
                .unwrap();
        let mut sink = RecordingProgress::default();

        let status = runtime
            .install("device-install", &AiCancellation::new(), &mut sink)
            .unwrap();

        assert_eq!(status.state, LocalAiRuntimeState::Running);
        assert!(status.managed, "an installed runtime is owned by Skriuw");
        let published = install_root.join("bin").join("ollama");
        assert!(published.is_file(), "install published no binary");
        assert!(
            !install_root.join("bin").join("ollama.pending").exists(),
            "install left its pending sibling behind"
        );
        assert!(
            sink.events.iter().any(|event| matches!(
                event,
                LocalAiProgress::Progress {
                    total_bytes: Some(_),
                    ..
                }
            )),
            "install reported no measurable download progress"
        );
        assert!(matches!(
            sink.events.last(),
            Some(LocalAiProgress::Complete { .. })
        ));

        runtime.shutdown();
    }

    #[test]
    #[ignore = "device verification: needs a real Ollama installation on this machine"]
    fn detects_starts_and_lists_a_real_local_ollama() {
        let directory = tempdir().unwrap();
        let runtime =
            OllamaRuntime::with_endpoint_override(directory.path().join("ollama"), None).unwrap();

        let detected = runtime.status().unwrap();
        assert_ne!(detected.state, LocalAiRuntimeState::NotInstalled);
        let external = detected.state == LocalAiRuntimeState::Running;

        let started = runtime.start().unwrap();
        assert_eq!(started.state, LocalAiRuntimeState::Running);
        assert!(started.version.is_some());
        assert_eq!(started.managed, !external);

        runtime.list_models().unwrap();
        runtime.shutdown();

        assert_eq!(
            runtime.status().unwrap().state == LocalAiRuntimeState::Running,
            external,
            "shutdown must stop a Skriuw-managed server and leave an external one alone"
        );
    }

    #[test]
    #[ignore = "device verification: pulls a small model from a real Ollama, then removes it"]
    fn pulls_completes_and_removes_a_real_model() {
        const MODEL: &str = "qwen2.5:0.5b";
        let directory = tempdir().unwrap();
        let runtime =
            OllamaRuntime::with_endpoint_override(directory.path().join("ollama"), None).unwrap();
        runtime.start().unwrap();
        let mut progress = RecordingProgress::default();

        runtime
            .pull_model("device-pull", MODEL, &AiCancellation::new(), &mut progress)
            .unwrap();

        assert!(
            progress.events.len() > 1,
            "pull reported no streamed progress"
        );
        assert!(matches!(
            progress.events.last(),
            Some(LocalAiProgress::Complete { .. })
        ));
        let pulled = runtime.list_models().unwrap();
        assert!(pulled.iter().any(|model| model.name == MODEL));

        let mut sink = RecordingSink::default();
        let terminal = runtime.complete(
            &AiCompletionRequest {
                request_id: "device-1".into(),
                provider_id: "ollama".into(),
                model_id: MODEL.into(),
                system_prompt: "Answer with one word.".into(),
                user_prompt: "Name a colour.".into(),
                parameters: AiCompletionParameters::default(),
            },
            &AiCancellation::new(),
            &mut sink,
        );

        assert!(matches!(terminal, AiCompletionTerminal::Done { .. }));
        assert!(!sink.deltas.is_empty());

        runtime.remove_model(MODEL).unwrap();
        assert!(
            !runtime
                .list_models()
                .unwrap()
                .iter()
                .any(|model| model.name == MODEL)
        );
    }

    #[test]
    #[ignore = "device verification: cancels a real streaming completion against a real Ollama"]
    fn cancels_a_real_completion_mid_stream() {
        const MODEL: &str = "qwen2.5:0.5b";
        let directory = tempdir().unwrap();
        let runtime =
            OllamaRuntime::with_endpoint_override(directory.path().join("ollama"), None).unwrap();
        runtime.start().unwrap();
        let already_installed = runtime
            .list_models()
            .unwrap()
            .iter()
            .any(|model| model.name == MODEL);
        if !already_installed {
            runtime
                .pull_model(
                    "device-cancel-pull",
                    MODEL,
                    &AiCancellation::new(),
                    &mut RecordingProgress::default(),
                )
                .unwrap();
        }
        let request = AiCompletionRequest {
            request_id: "device-cancel".into(),
            provider_id: "ollama".into(),
            model_id: MODEL.into(),
            system_prompt: "Follow the instruction exactly.".into(),
            user_prompt: "Count from 1 to 1000, one number per line.".into(),
            parameters: AiCompletionParameters {
                timeout_ms: 300_000,
                ..AiCompletionParameters::default()
            },
        };
        let cancellation = AiCancellation::new();
        let deltas: Arc<Mutex<Vec<AiCompletionDelta>>> = Arc::default();

        let (terminal, cancelled_at) = thread::scope(|scope| {
            let worker = scope.spawn(|| {
                let mut sink = SharedSink {
                    deltas: Arc::clone(&deltas),
                };
                runtime.complete(&request, &cancellation, &mut sink)
            });
            let first_delta_deadline = Instant::now() + Duration::from_secs(120);
            while lock(&deltas).is_empty() {
                if worker.is_finished() {
                    let terminal = worker.join().unwrap();
                    panic!("completion terminated before any delta: {terminal:?}");
                }
                assert!(
                    Instant::now() < first_delta_deadline,
                    "completion produced no delta to cancel behind"
                );
                thread::sleep(Duration::from_millis(20));
            }
            cancellation.cancel();
            let cancelled_at = Instant::now();
            (worker.join().unwrap(), cancelled_at)
        });

        assert!(
            cancelled_at.elapsed() < Duration::from_secs(5),
            "cancellation took {:?} to terminate the stream",
            cancelled_at.elapsed()
        );
        assert_eq!(terminal, AiCompletionTerminal::Cancelled);
        let recorded_len = {
            let recorded = lock(&deltas);
            assert!(
                recorded.iter().any(|delta| !delta.text.is_empty()),
                "cancellation landed before any streamed text"
            );
            recorded.len()
        };
        thread::sleep(Duration::from_millis(250));
        assert_eq!(
            lock(&deltas).len(),
            recorded_len,
            "deltas kept arriving after the cancelled terminal"
        );

        if !already_installed {
            runtime.remove_model(MODEL).unwrap();
        }
        runtime.shutdown();
    }

    struct SharedSink {
        deltas: Arc<Mutex<Vec<AiCompletionDelta>>>,
    }

    impl AiEventSink for SharedSink {
        fn send_delta(&mut self, delta: AiCompletionDelta) -> Result<(), AiSinkError> {
            lock(&self.deltas).push(delta);
            Ok(())
        }
    }

    #[derive(Default)]
    struct RecordingProgress {
        events: Vec<LocalAiProgress>,
    }

    impl LocalAiProgressSink for RecordingProgress {
        fn send(&mut self, progress: LocalAiProgress) -> Result<(), LocalAiError> {
            self.events.push(progress);
            Ok(())
        }
    }

    #[derive(Default)]
    struct RecordingSink {
        deltas: Vec<AiCompletionDelta>,
    }

    impl AiEventSink for RecordingSink {
        fn send_delta(&mut self, delta: AiCompletionDelta) -> Result<(), AiSinkError> {
            self.deltas.push(delta);
            Ok(())
        }
    }

    fn write_archive(path: &std::path::Path, entry: &str) {
        let payload = b"#!/bin/sh\n";
        let mut builder = tar::Builder::new(
            zstd::Encoder::new(fs::File::create(path).unwrap(), 0)
                .unwrap()
                .auto_finish(),
        );
        let mut header = tar::Header::new_gnu();
        header.set_size(payload.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder
            .append_data(&mut header, entry, &payload[..])
            .unwrap();
        builder.into_inner().unwrap();
    }

    fn runtime(endpoint: &str) -> (OllamaRuntime, TempDir) {
        let directory = tempdir().unwrap();
        let runtime = OllamaRuntime::new(directory.path().join("ollama"), Some(endpoint)).unwrap();
        (runtime, directory)
    }

    fn serve_once(content_type: &'static str, body: String) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 16 * 1024];
            let _ = stream.read(&mut request).unwrap();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len(),
            )
            .unwrap();
        });
        (format!("http://{address}"), server)
    }
}
