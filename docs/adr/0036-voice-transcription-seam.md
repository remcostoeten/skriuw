# 0036 — Provider-agnostic voice transcription seam

## Status

Accepted, 2026-08-26.

## Context

Voice dictation turns a microphone recording into Markdown the writer can
insert. Speech-to-text differs from the completion seam in ADR-0033 in shape,
not in trust: the input is a bounded binary recording rather than a prompt,
the shipped provider endpoints are request/response rather than streams, and
the payload is more sensitive than any selection — it is the writer's voice.

The existing constraints stand unchanged: AI is off by default, nothing runs
on startup or an interaction hot path, credentials resolve only through the
consent-gated native store, and no provider-specific syntax may enter
`skriuw-domain` or the renderer. The renderer also must not talk to a
provider itself — the webview's CSP has no provider hosts in `connect-src`,
and keeping it that way is part of the credential boundary.

Widening `AiCompletionRequest` with an audio field was rejected: the request
is `deny_unknown_fields`, centrally validated, and recorded in run history;
recordings must never be able to reach any of those paths.

## Decision

### A second narrow use case, not a wider one

`skriuw-domain` owns an `AiTranscribe` trait beside `AiComplete`:
`transcribe(&AiTranscriptionRequest, &AiCancellation) -> AiTranscriptionTerminal`.
The request carries an opaque request ID, provider ID, model ID, a container
MIME type from a closed allowlist, an optional bounded language hint, and the
recording bytes. It is deliberately not serializable, so a recording cannot
enter a contract, an event, a log line, or run history by accident. Audio is
bounded by the smallest limit among shipped adapters (25 MB), so a recording
either transcribes everywhere or is refused before any bytes leave.

Transcription is not streamed: the terminal carries the whole bounded
transcript, and there is no delta sink. The transcript itself is bounded, and
oversized or undocumented response shapes terminalize as malformed rather
than being truncated.

### Adapters translate syntax behind the seam

`skriuw-ai-remote` implements `AiTranscribe` for the same adapters that
implement `AiComplete`. Groq uploads the recording as `multipart/form-data`
to its Whisper endpoint; Gemini sends base64 `inlineData` on an ordinary
`generateContent` call with a fixed transcription instruction. Both resolve
their key through `AiCredentialSource` before any socket opens, reuse the
completion seam's status and transport error projections, and drain error
bodies under a bound without forwarding them. A speech-capable local adapter
(for example whisper.cpp) is a future implementation of the same trait, not a
new seam.

The speech-to-text catalogue is a repository-owned list separate from the
completion catalogue: transcription is priced per audio minute, so reusing
the token-priced completion catalogue would fabricate prices. An entry exists
exactly when an adapter mapping ships.

### The shell stages bytes; the provider call leaves the main thread

Raw-body IPC commands are synchronous in Tauri, while a provider request must
not run on the main thread. The shell therefore accepts the recording in a
synchronous raw-bytes command that parks it in a bounded in-memory staging
queue, and an async command consumes the staged bytes on a blocking worker.
Staged recordings are consumed exactly once whatever the outcome, and the
queue evicts its oldest entry rather than growing, so an abandoned recording
cannot pin audio in process memory. Recordings never touch SQLite, the blob
store, disk, sync, archives, or run history.

On Linux, WebKitGTK's default answer to a `getUserMedia` permission request
is denial, so the shell answers the webview's permission-request signal and
grants only audio-only capture; camera and combined requests stay denied.

### Formatting reuses the completion seam

Turning a transcript into cleaned or structured Markdown is an ordinary
completion: the dictation surface fires the existing `AiComplete` path with a
built-in prompt (`clean-transcript`, `structure-transcript`) and a
`voice:<mode>` origin, so it inherits streaming, cancellation, model
selection, prompt shadowing, and run history without new machinery — and the
formatting step is provider-agnostic for free. When formatting fails, the raw
transcript is offered instead; dictated words are never lost to a provider
error. The result enters the document through the same preview-then-one-
transaction rule as editor actions.

## Consequences

Adding a transcription vendor means one `AiTranscribe` implementation and a
catalogue entry; nothing else moves. The recording's lifetime is memory-only
and single-use, which recovery and privacy reasoning can rely on, but also
means an interrupted transcription requires re-recording unless the surface
kept the bytes. Because blocking uploads cannot be aborted mid-flight,
cancellation is only observed before the request and before the result is
returned; a cancelled upload finishes on the wire and its result is
discarded. Run history does not yet record transcription runs — extending the
recorder with a duration-priced run shape is deferred until usage justifies
it.
