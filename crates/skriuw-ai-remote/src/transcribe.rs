//! Speech-to-text through the same bring-your-own-key adapters as
//! completions. Each provider keeps its own request syntax behind the
//! domain-owned [`AiTranscribe`] seam: Groq takes the recording as a
//! `multipart/form-data` upload to its Whisper endpoint, Gemini takes it as
//! base64 `inlineData` on an ordinary `generateContent` call.

use std::{io::Read, time::Duration};

use base64::Engine;
use reqwest::{Url, blocking::multipart};
use serde_json::{Value, json};
use skriuw_domain::{
    AiCancellation, AiProviderError, AiProviderErrorCategory, AiRecoveryAction, AiTranscribe,
    AiTranscriptionModel, AiTranscriptionRequest, AiTranscriptionTerminal, MAX_AI_TRANSCRIPT_BYTES,
};

use crate::{RemoteAiProvider, RemoteProviderKind};

const TRANSCRIPTION_TIMEOUT: Duration = Duration::from_secs(120);
/// The transcript plus provider JSON framing. Larger bodies are cut off and
/// refused as malformed rather than buffered without bound.
const MAX_TRANSCRIPTION_RESPONSE_BYTES: u64 = 2 * 1024 * 1024;

/// The repository-owned speech-to-text catalogue, mirroring how completion
/// models ship: there is no discovery request, an entry exists exactly when an
/// adapter mapping for it exists.
pub fn ai_transcription_models() -> Vec<AiTranscriptionModel> {
    fn model(provider_id: &str, model_id: &str, label: &str) -> AiTranscriptionModel {
        AiTranscriptionModel {
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            label: label.into(),
        }
    }
    vec![
        model(
            crate::GROQ_PROVIDER_ID,
            "whisper-large-v3-turbo",
            "Whisper Large v3 Turbo",
        ),
        model(
            crate::GROQ_PROVIDER_ID,
            "whisper-large-v3",
            "Whisper Large v3",
        ),
        model(
            crate::GEMINI_PROVIDER_ID,
            "gemini-2.5-flash",
            "Gemini 2.5 Flash",
        ),
        model(
            crate::GEMINI_PROVIDER_ID,
            "gemini-2.5-flash-lite",
            "Gemini 2.5 Flash-Lite",
        ),
    ]
}

fn supports_transcription_model(kind: RemoteProviderKind, model_id: &str) -> bool {
    ai_transcription_models()
        .iter()
        .any(|model| model.provider_id == kind.id() && model.model_id == model_id)
}

fn transcription_endpoint(kind: RemoteProviderKind, base: &Url, model_id: &str) -> Option<Url> {
    match kind {
        RemoteProviderKind::Gemini => base
            .join(&format!("v1beta/models/{model_id}:generateContent"))
            .ok(),
        RemoteProviderKind::Groq => base.join("openai/v1/audio/transcriptions").ok(),
    }
}

fn gemini_transcription_body(request: &AiTranscriptionRequest) -> Value {
    let language_hint = request
        .language
        .as_deref()
        .map(|language| format!(" The speech is in \"{language}\"."))
        .unwrap_or_default();
    let instruction = format!(
        "Transcribe this audio recording. Reply with the verbatim transcript only: \
         no preamble, no commentary, no timestamps, no speaker labels.{language_hint}"
    );
    json!({
        "contents": [{
            "role": "user",
            "parts": [
                {
                    "inlineData": {
                        "mimeType": request.mime_type,
                        "data": base64::engine::general_purpose::STANDARD.encode(&request.audio),
                    }
                },
                { "text": instruction },
            ]
        }],
        "generationConfig": { "temperature": 0 },
    })
}

fn recording_filename(mime_type: &str) -> &'static str {
    match mime_type {
        "audio/ogg" => "recording.ogg",
        "audio/mp4" => "recording.m4a",
        "audio/mpeg" => "recording.mp3",
        "audio/wav" => "recording.wav",
        _ => "recording.webm",
    }
}

fn groq_transcription_form(request: &AiTranscriptionRequest) -> Result<multipart::Form, ()> {
    let part = multipart::Part::bytes(request.audio.clone())
        .file_name(recording_filename(&request.mime_type))
        .mime_str(&request.mime_type)
        .map_err(|_| ())?;
    let mut form = multipart::Form::new()
        .part("file", part)
        .text("model", request.model_id.clone())
        .text("response_format", "json")
        .text("temperature", "0");
    if let Some(language) = &request.language {
        form = form.text("language", language.clone());
    }
    Ok(form)
}

/// Pulls the transcript out of one provider's documented response shape.
/// `None` means the body was not that shape and the response is malformed.
fn parse_transcript(kind: RemoteProviderKind, body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    if value.get("error").is_some() {
        return None;
    }
    match kind {
        RemoteProviderKind::Gemini => {
            let parts = value
                .get("candidates")?
                .as_array()?
                .first()?
                .get("content")?
                .get("parts")?
                .as_array()?;
            let mut transcript = String::new();
            for part in parts {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    transcript.push_str(text);
                }
            }
            Some(transcript)
        }
        RemoteProviderKind::Groq => value.get("text").and_then(Value::as_str).map(str::to_owned),
    }
}

impl RemoteAiProvider {
    fn transcription_error(
        &self,
        category: AiProviderErrorCategory,
        message: &str,
        recovery_action: AiRecoveryAction,
    ) -> AiTranscriptionTerminal {
        AiTranscriptionTerminal::ProviderError(AiProviderError::new(
            self.kind().id(),
            category,
            message,
            recovery_action,
        ))
    }
}

impl AiTranscribe for RemoteAiProvider {
    fn transcribe(
        &self,
        request: &AiTranscriptionRequest,
        cancellation: &AiCancellation,
    ) -> AiTranscriptionTerminal {
        if request.validate().is_err()
            || request.provider_id != self.kind().id()
            || !supports_transcription_model(self.kind(), &request.model_id)
        {
            return self.transcription_error(
                AiProviderErrorCategory::RejectedRequest,
                "the transcription request is not valid for this provider",
                AiRecoveryAction::ReduceRequest,
            );
        }
        if cancellation.is_cancelled() {
            return AiTranscriptionTerminal::Cancelled;
        }
        // Resolving the credential first means an unconfigured or unconsented
        // provider terminalizes before any socket is opened.
        let credential = match self.credentials().resolve(self.kind().id()) {
            Ok(credential) => credential,
            Err(error) => {
                return AiTranscriptionTerminal::ProviderError(
                    error.into_provider_error(self.kind().id()),
                );
            }
        };
        let Some(url) = transcription_endpoint(self.kind(), self.base_url(), &request.model_id)
        else {
            return self.transcription_error(
                AiProviderErrorCategory::InternalFailure,
                "provider endpoint could not be built",
                AiRecoveryAction::None,
            );
        };
        let builder = self
            .kind()
            .authorize(self.client().post(url), &credential)
            .timeout(TRANSCRIPTION_TIMEOUT);
        let builder = match self.kind() {
            RemoteProviderKind::Gemini => builder.json(&gemini_transcription_body(request)),
            RemoteProviderKind::Groq => {
                let Ok(form) = groq_transcription_form(request) else {
                    return self.transcription_error(
                        AiProviderErrorCategory::InternalFailure,
                        "the recording could not be packaged for upload",
                        AiRecoveryAction::None,
                    );
                };
                builder.multipart(form)
            }
        };
        let response = match builder.send() {
            Ok(response) => response,
            Err(error) if error.is_timeout() => return AiTranscriptionTerminal::Timeout,
            Err(error) => {
                return AiTranscriptionTerminal::ProviderError(self.transport_error(&error));
            }
        };
        let status = response.status();
        // The body is drained under a bound either way: an error body can echo
        // the request and must not reach the renderer.
        let mut body = Vec::new();
        let _ = response
            .take(MAX_TRANSCRIPTION_RESPONSE_BYTES)
            .read_to_end(&mut body);
        if !status.is_success() {
            return AiTranscriptionTerminal::ProviderError(self.status_error(status));
        }
        if cancellation.is_cancelled() {
            return AiTranscriptionTerminal::Cancelled;
        }
        let Some(transcript) = std::str::from_utf8(&body)
            .ok()
            .and_then(|body| parse_transcript(self.kind(), body))
        else {
            return self.transcription_error(
                AiProviderErrorCategory::MalformedResponse,
                "the provider returned malformed transcription data",
                AiRecoveryAction::Retry,
            );
        };
        if transcript.len() > MAX_AI_TRANSCRIPT_BYTES {
            return self.transcription_error(
                AiProviderErrorCategory::MalformedResponse,
                "the provider returned an oversized transcript",
                AiRecoveryAction::ReduceRequest,
            );
        }
        AiTranscriptionTerminal::Done {
            transcript: transcript.trim().to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::Arc,
        thread,
    };

    use skriuw_domain::{
        AiCancellation, AiCredential, AiCredentialError, AiCredentialSource,
        AiProviderErrorCategory, AiRecoveryAction, AiTranscribe, AiTranscriptionRequest,
        AiTranscriptionTerminal,
    };

    use super::ai_transcription_models;
    use crate::{GEMINI_PROVIDER_ID, GROQ_PROVIDER_ID, RemoteAiProvider, RemoteProviderKind};

    const KEY: &str = "sk-test-provider-key";

    struct StoredKey;

    impl AiCredentialSource for StoredKey {
        fn resolve(&self, _provider_id: &str) -> Result<AiCredential, AiCredentialError> {
            AiCredential::new(KEY)
        }
    }

    struct RefusedKey;

    impl AiCredentialSource for RefusedKey {
        fn resolve(&self, _provider_id: &str) -> Result<AiCredential, AiCredentialError> {
            Err(AiCredentialError::Missing)
        }
    }

    fn request(provider_id: &str, model_id: &str) -> AiTranscriptionRequest {
        AiTranscriptionRequest {
            request_id: "request-1".into(),
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            mime_type: "audio/webm".into(),
            language: Some("en".into()),
            audio: vec![0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02],
        }
    }

    fn serve_once(status_line: &'static str, body: String) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buffer = vec![0u8; 256 * 1024];
            let read = stream.read(&mut buffer).expect("read request");
            write!(
                stream,
                "HTTP/1.1 {status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len(),
            )
            .expect("write response");
            String::from_utf8_lossy(&buffer[..read]).into_owned()
        });
        (format!("http://{address}/"), server)
    }

    fn build_provider(
        kind: RemoteProviderKind,
        base_url: &str,
        credentials: Arc<dyn AiCredentialSource>,
    ) -> RemoteAiProvider {
        RemoteAiProvider::with_base_url(kind, base_url, credentials).expect("provider")
    }

    #[test]
    fn ships_a_valid_transcription_catalogue_for_shipped_adapters() {
        let models = ai_transcription_models();

        assert!(!models.is_empty());
        for model in &models {
            assert_eq!(model.validate(), Ok(()));
            assert!(
                RemoteProviderKind::from_id(&model.provider_id).is_some(),
                "{} has no adapter",
                model.provider_id
            );
        }
    }

    #[test]
    fn uploads_groq_recordings_as_multipart_and_parses_the_transcript() {
        let (base, server) = serve_once("200 OK", "{\"text\":\" hello world \"}".to_owned());
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));

        let terminal = provider.transcribe(
            &request(GROQ_PROVIDER_ID, "whisper-large-v3-turbo"),
            &AiCancellation::new(),
        );

        assert_eq!(
            terminal,
            AiTranscriptionTerminal::Done {
                transcript: "hello world".into(),
            }
        );
        let captured = server.join().expect("server");
        assert!(captured.contains("POST /openai/v1/audio/transcriptions"));
        assert!(captured.contains("authorization: Bearer"));
        assert!(captured.contains("multipart/form-data"));
        assert!(captured.contains("whisper-large-v3-turbo"));
        assert!(captured.contains("filename=\"recording.webm\""));
    }

    #[test]
    fn sends_gemini_recordings_inline_and_parses_the_transcript() {
        let body = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"hello \"},{\"text\":\"world\"}]}}]}";
        let (base, server) = serve_once("200 OK", body.to_owned());
        let provider = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));

        let terminal = provider.transcribe(
            &request(GEMINI_PROVIDER_ID, "gemini-2.5-flash"),
            &AiCancellation::new(),
        );

        assert_eq!(
            terminal,
            AiTranscriptionTerminal::Done {
                transcript: "hello world".into(),
            }
        );
        let captured = server.join().expect("server");
        assert!(captured.contains("POST /v1beta/models/gemini-2.5-flash:generateContent"));
        assert!(captured.contains("x-goog-api-key"));
        assert!(captured.contains("inlineData"));
        assert!(captured.contains("audio/webm"));
    }

    #[test]
    fn never_opens_a_socket_without_a_credential() {
        let provider = build_provider(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(RefusedKey),
        );

        let terminal = provider.transcribe(
            &request(GROQ_PROVIDER_ID, "whisper-large-v3-turbo"),
            &AiCancellation::new(),
        );

        let AiTranscriptionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MissingCredential);
        assert_eq!(error.recovery_action, AiRecoveryAction::ConfigureCredential);
    }

    #[test]
    fn refuses_a_model_the_provider_does_not_transcribe_with() {
        let provider = build_provider(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(StoredKey),
        );

        let terminal = provider.transcribe(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &AiCancellation::new(),
        );

        let AiTranscriptionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::RejectedRequest);
    }

    #[test]
    fn maps_rejected_keys_without_echoing_the_body() {
        let (base, server) = serve_once(
            "401 Unauthorized",
            format!("{{\"error\":\"{KEY} is invalid\"}}"),
        );
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));

        let terminal = provider.transcribe(
            &request(GROQ_PROVIDER_ID, "whisper-large-v3-turbo"),
            &AiCancellation::new(),
        );

        let AiTranscriptionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::InvalidCredential);
        assert!(!error.message.contains(KEY));
        server.join().expect("server");
    }

    #[test]
    fn fails_visibly_on_malformed_transcription_data() {
        let (base, server) = serve_once("200 OK", "not json".to_owned());
        let provider = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));

        let terminal = provider.transcribe(
            &request(GEMINI_PROVIDER_ID, "gemini-2.5-flash"),
            &AiCancellation::new(),
        );

        let AiTranscriptionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
        server.join().expect("server");
    }

    #[test]
    fn stops_before_sending_when_the_request_is_already_cancelled() {
        let provider = build_provider(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(StoredKey),
        );
        let cancellation = AiCancellation::new();
        cancellation.cancel();

        let terminal = provider.transcribe(
            &request(GROQ_PROVIDER_ID, "whisper-large-v3-turbo"),
            &cancellation,
        );

        assert_eq!(terminal, AiTranscriptionTerminal::Cancelled);
    }
}
