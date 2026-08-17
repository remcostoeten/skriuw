# Ollama runtime contract

## Scope

The Ollama adapter provides the first concrete implementation of the
provider-neutral AI seam. AI remains disabled by default. Opening other
settings sections, startup, typing, saving, navigation, and command-palette
opening perform no Ollama filesystem, process, or network work.

## Ownership

The adapter probes only a loopback HTTP endpoint, defaulting to
`127.0.0.1:11434`. `SKRIUW_OLLAMA_ENDPOINT` may select another loopback port.
An override that is not a loopback HTTP endpoint is refused, reported in the
runtime detail, and replaced by the default; it never prevents Skriuw from
starting. An already reachable server is external and unmanaged. Skriuw may use
it but does not stop, replace, or update it.

When no server is reachable, Skriuw can start an available binary as a managed
child. Managed children stop during app shutdown. An exited child becomes a
visible failed state and can be restarted explicitly.

## Installation

Linux and macOS installation downloads the matching archive from the latest
official GitHub release into a temporary directory under the app data area.
The release asset must carry a valid SHA-256 digest and the downloaded bytes
must match it before extraction. The archive must contain an Ollama executable;
the executable is copied through a pending sibling and atomically renamed into
the app-owned `ollama/bin` directory. Cancellation or any failed validation
leaves no published binary.

Windows links to Ollama's official installer. Skriuw does not elevate privileges
or run a downloaded installer.

## API boundary

The adapter uses Ollama's typed loopback API:

- `GET /api/version` for reachability and version;
- `GET /api/tags` for bounded installed-model metadata;
- `POST /api/pull` for newline-delimited progress;
- `DELETE /api/delete` for model removal; and
- `POST /api/generate` for newline-delimited completion events.

Every response is size-bounded and deserialized into a closed Rust type.
Single-body responses are bounded as a whole. Newline-delimited streams are
bounded per event, so a long-running pull of a large model over a slow link is
not truncated, with a stream-wide backstop against a runaway peer. Completion
streams stay bounded by the requested output limit. Malformed responses fail
visibly. Model and operation identifiers are bounded and reject traversal-shaped
values. Pull and completion cancellation share the domain cancellation
primitive; closed renderer channels cancel native work. An operation identifier
that is already in flight is rejected rather than shadowing the active one.

## Renderer behavior

The AI settings chunk is dynamically imported only after opt-in. Its runtime
rail reports not installed, installed but stopped, running, failed, and
unsupported states. Running copy distinguishes app-managed from external
services. Model pull progress uses a named progress bar and a polite live
region. Model deletion is armed inline before the destructive request.
