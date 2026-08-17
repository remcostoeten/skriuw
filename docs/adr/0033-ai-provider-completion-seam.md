# 0033 — Provider-agnostic AI completion seam

## Status

Accepted, 2026-08-16.

## Context

AI features need one completion path before local or remote providers, settings,
or editor actions are added. That path must stream partial output without
letting HTTP clients, provider SDKs, credentials, operating-system services, or
Tauri enter `skriuw-domain`. It must also preserve the standing local-first
promise: AI is off by default, no AI work runs on startup or an interaction hot
path, and text leaves the device only after an explicit action and disclosure.

Streaming introduces a lifecycle that a request/response command cannot model.
A surface can disappear while a provider is still producing output, and a
timeout can race with user cancellation or provider completion. Treating cancel
as a renderer-only state would leave the underlying request running and could
deliver text to a replacement surface.

Remote providers add a separate trust boundary. A completion request must
select a provider without carrying its credential, and Linux cannot be assumed
to have a reachable, unlocked Secret Service collection. Credential fallback
must therefore be explicit and weaker storage must never be selected silently.

## Decision

### One domain-owned completion use case

`skriuw-domain` owns a single `AiComplete`-style use-case trait and the types
that cross it. Provider adapters implement that trait; features do not call an
adapter, SDK, or HTTP client directly.

The request contains an opaque request ID, provider ID, model ID, system prompt,
user prompt, and a closed set of provider-neutral generation parameters. It has
no credential field and no untyped provider-options map. Provider and model IDs,
prompt bytes, requested output, overall duration, and retry count are validated
against central finite limits before an adapter starts. Adapters may impose a
stricter provider limit but may not relax the application limit.

The seam accepts a cancellation capability and an incremental event sink. An
adapter sends ordered text deltas and returns one terminal outcome. The domain
types use only domain and standard-library concepts; asynchronous runtimes,
network streams, Tauri channels, keyrings, and provider response types remain in
adapters and shells. Completion is run away from renderer and storage runtime
threads.

The transport contract exposed to the renderer is generated from the Rust
types and consists of:

- ordered `delta` events carrying request ID, sequence, and bounded UTF-8 text;
- one `done` terminal carrying bounded usage information when the provider
  supplies it;
- one `cancelled`, `timeout`, or `provider_error` terminal;
- typed, bounded provider errors with a stable category, provider ID, safe
  message, and recovery action.

Error categories distinguish at least unavailable provider, missing or invalid
credential, quota exhausted, rate limited, rejected request, transport failure,
malformed response, and internal failure. Adapter details, response bodies, and
credentials never enter the safe error projection. Existing bounded-diagnostic
rules in ADR-0014 apply at the shell boundary.

Retries are zero by default. A configured retry remains centrally bounded and
is allowed only before the first delta for a retryable failure. Cancellation,
timeout, authentication failure, quota failure, invalid input, and malformed
output are not retried. Once output has streamed, retrying would risk duplicated
or discontinuous text and is forbidden.

A deterministic fake adapter is a permanent implementation of the same seam.
It can schedule tokens and inject cancellation races, timeout, malformed output,
provider failure, and late completion without network or credentials. Tests use
the public seam and renderer event contract rather than adapter internals.

### Shell-owned streaming and cancellation

The desktop shell lazily creates the completion service on the first explicit
AI request. It registers each unique request ID with its cancellation handle
and Tauri streaming channel, runs the adapter off the renderer thread, and
removes the registration after terminalization. Starting AI does not use the
serialized workspace storage queue.

Cancellation is end to end:

- renderer cancellation, surface unmount, opt-out, app shutdown, or failed
  channel delivery signals the registered request;
- the adapter must connect that signal to the underlying transport so sockets,
  response streams, subprocess work, and token production stop;
- cancellation and the overall deadline are observed while waiting and while
  emitting, not only between provider calls;
- the first terminal transition wins when success, failure, cancellation, and
  timeout race; later deltas and terminal attempts are discarded;
- cancel and timeout never publish `done`, and cancel requests are idempotent.

The renderer also keys every consumer by request ID and rejects out-of-order
sequences. Unmount removes the consumer before requesting cancellation, so an
already queued or deliberately late fake-provider result cannot mutate a new
surface. A bridge delivery failure is cancellation, not a reason to keep the
provider running.

The overall deadline begins when the shell accepts the request and ends only at
a terminal transition. Provider connect and read timeouts may be shorter, but
cannot extend that deadline. Response-byte accounting covers all received
deltas before renderer delivery; crossing the bound aborts the transport and
terminates as a typed provider error.

### Credential ownership and storage tiers

Credentials belong to the native credential adapter, never to the domain seam,
provider request contracts, or renderer state. The renderer may submit a newly
entered key once to a native save or test operation and may later learn only
whether a key exists, its storage tier, and the consent state. It cannot read a
stored key back.

Key bytes never enter SQLite, settings files, workspace archives, exports,
backups, sync payloads, logs, diagnostics, crash reports, generated contracts,
or completion events. Provider adapters resolve a key through a native
credential capability only when an explicitly consented remote request starts
and keep it for no longer than that operation requires. Removing a provider or
revoking consent cancels its active requests and removes its credential from
the active tier.

macOS uses Keychain and Windows uses Credential Manager. Linux detection runs
only when the opt-in-gated provider settings surface opens and resolves to
exactly one state:

| State | Detection | Required UI |
| --- | --- | --- |
| `vault-ok` | Secret Service is reachable and the default collection is unlocked | Enable normal entry and show “Stored in your system keyring” |
| `vault-locked` | Secret Service is reachable and the collection is locked | Disable entry; show “Your keyring is locked”, Unlock through the service prompt, and Retry |
| `vault-no-collection` | Secret Service is reachable with no default collection | Offer to create a default collection, then proceed as `vault-ok` |
| `vault-absent` | The session bus has no `org.freedesktop.secrets` service | Show the explicit fallback chooser |
| `vault-blocked` | A Snap build lacks the `password-manager-service` connection | Show the `snap connect` command and the explicit fallback chooser |

For `vault-absent` and `vault-blocked`, nothing is persisted until the user
chooses one of these tiers:

1. **Session-only (recommended default).** Rust-side memory holds the key until
   process exit; the user re-enters it each launch and zero key bytes persist.
2. **Encrypted file.** A per-file salt and Argon2id-derived key protect an
   authenticated XChaCha20-Poly1305 envelope at
   `$XDG_DATA_HOME/skriuw/secrets.enc`. The passphrase is held only in
   Rust-side memory for the session. A forgotten passphrase loses only the
   stored keys, which can be re-entered.
3. **Plaintext file (explicitly discouraged).** Before consent the UI shows
   this disclosure verbatim:

   > Keys will be stored at `$XDG_DATA_HOME/skriuw/keys.json` in **plain text** (JSON, mode 600). Anyone with access to your files can read them.

   Confirmation uses the armed destructive-button convention. The file is
   created with mode `600` and is excluded from backups, archives, exports, and
   diagnostics, with tests proving every exclusion.
4. **Install a keyring instead.** Show guidance for gnome-keyring, KWallet, and
   KeePassXC Secret Service integration, followed by Re-detect.

Encrypted and plaintext fallback files are native device state, not workspace
state. Their directories and files are created with restrictive permissions,
and temporary writes use create-new plus atomic replacement without exposing a
second plaintext copy.

Tier transitions are explicit. If a vault becomes available, one-click
migration writes and reads back the vault value before removing the fallback
file through the platform's strongest available secure-deletion procedure; a
deletion failure remains visible and does not claim migration success.
Filesystems and solid-state media can make physical overwrite guarantees
impossible, so secure deletion includes verified logical removal and must not
promise forensic erasure the platform cannot provide. If a vault later
disappears, keys become unavailable and the UI offers re-entry or an explicit
fallback choice. The application never automatically downgrades to a weaker
tier.

### Privacy disclosure and consent

No remote completion can start unless the user has enabled AI, explicitly
selected the action, configured a credential, and accepted the current
provider-specific disclosure. Consent is per provider, versioned, revocable,
and device-local. A materially changed disclosure requires consent again.

Before first use, the disclosure identifies:

- the provider and destination receiving the request;
- that the selected system prompt, user prompt, explicitly selected note or
  workspace context, model ID, and generation parameters leave the device;
- that the request uses the user's credential and is subject to the provider's
  retention, training, account, billing, and abuse-monitoring policies;
- that Skriuw cannot delete copies retained by the provider; and
- whether locally recorded completion history or token usage is enabled.

The request preview must match the data actually sent. Adapters may translate
the common request into provider syntax but may not add note content, workspace
metadata, user identity, or hidden prompts outside the disclosed request.
Revocation prevents new requests immediately, cancels active requests, and
deletes the native credential. A provider endpoint outside loopback is remote
for this policy even when it uses an otherwise local-provider adapter.

Local loopback providers do not require remote-provider consent, but they still
run only after opt-in and an explicit action. No provider discovery,
credential detection, model request, module initialization, or network call
runs on startup, typing, save, note navigation, or command-palette open.

### Telemetry policy

Skriuw sends no AI analytics or telemetry. Prompts, selected context, output
deltas, credentials, provider response bodies, and per-request content are
never logged or uploaded by Skriuw. A provider's own handling of a consented
remote request is part of the disclosure, not Skriuw telemetry.

Typed terminal categories, bounded timings, and provider-reported token counts
may exist in memory to drive the active UI. A later user-facing local history
or token-accounting feature may persist them only through an explicit product
contract; local accounting is not an upload channel and may not include key
material or undisclosed content. Operational diagnostics remain bounded and
redacted under ADR-0014.

Adding any telemetry transport, automatic crash attachment containing AI
metadata, or remote observability requires a separate architecture decision and
separate opt-in consent. It cannot be bundled with AI enablement or provider
consent.

## Consequences

- Every completion feature shares one provider-neutral lifecycle and generated
  event contract; provider-specific behavior stays in adapters.
- Domain tests can prove streaming, timeout, cancellation, malformed output,
  and late-result handling with the fake adapter and no network.
- Remote credentials cannot leak through portable or synchronized domain data,
  but native settings must represent vault availability and weaker-tier choices
  without storing the key itself.
- Cancellation requires cooperation from every adapter and an abortable
  transport. An adapter that merely stops forwarding deltas does not satisfy
  the seam.
- The Linux fallback matrix creates additional implementation and verification
  work, including vault-state fixtures, exclusion tests, and explicit migration
  failures.
- The initial bridge is desktop-specific, while the domain request, event, and
  error contracts remain suitable for a future browser adapter with its own
  credential decision.
- The dormant service and dynamically loaded renderer surfaces add zero work to
  startup, typing, save, and navigation paths; representative traces must keep
  proving that invariant.
