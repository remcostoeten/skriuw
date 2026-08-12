# ADR-0014: Bounded failure diagnostics

- Status: accepted
- Date: 2026-07-20

## Context

Runtime, storage, history, backup, recovery, and integrity failures currently surface through unrelated error enums and broad backend strings. Those types are useful inside their owning crate, but a desktop shell and future web adapter need stable failure categories without learning SQLite, Git, filesystem, or worker details. History retry text is durable operational state, so an unbounded source error can also grow the database or carry control characters into later output.

## Decision

`skriuw-storage` owns a backend-neutral `Diagnostic` projection with two stable dimensions:

- Context: `runtime`, `storage`, `history`, `backup`, `recovery`, or `integrity`.
- Category: `unavailable`, `invalid_input`, `not_found`, `conflict`, `already_exists`, `backend`, or `internal`.

Contexts identify the user operation or subsystem boundary; categories identify the response class. They are not localized prose and may be used by shell adapters for presentation and recovery actions. Existing typed errors remain the control-flow contract inside Rust. Each owning error type explicitly maps itself to a diagnostic instead of relying on string parsing.

Diagnostic messages are valid UTF-8, collapse control and repeated whitespace, and contain at most 1,024 bytes without splitting a code point. Empty input becomes `operation failed`. Display is deterministic as `<context>.<category>: <message>`.

Public diagnostic mappings redact backend details. Storage backend messages, Git errors, database details, entity IDs, and filesystem paths remain in their owning typed errors and are not copied into the safe runtime, storage, history, backup, recovery, or integrity projection. The native CLI maps backup, restore, import, and integrity failures at their explicit boundary so those commands do not print adapter internals accidentally.

The history worker creates a separate local retry diagnostic from the materializer error. The queue accepts the bounded `Diagnostic` value rather than an arbitrary string, and SQLite persists its deterministic display in `history_outbox.last_error`. This local operational field may retain bounded backend detail for repair, is cleared on the next claim, and never enters bootstrap snapshots or portable archives.

No telemetry transport, user-facing localization, automatic upload, log file, or UI presentation is introduced. A future observability slice may carry the stable context and category but must define consent, retention, and redaction separately.

## Consequences

- Shell and web adapters can branch on stable enums instead of parsing error prose.
- Low-level errors remain actionable inside native code while portable callers receive redacted summaries.
- Durable retry diagnostics have a deterministic format and size ceiling.
- Adding a context or category is an architecture change; changing a message is not a protocol change.
- Diagnostics describe failures only and do not retry, recover, rotate backups, or replace typed errors.
