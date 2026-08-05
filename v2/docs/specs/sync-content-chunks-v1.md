# Content-addressed chunk transport v1

Status: implemented. Wire contract, protocol admission, authorized R2 transfer,
versioned checkpoints, and retention are in place; see
[content operations](sync-content-operations.md) for running them.

Sync protocol v1 rejects any operation whose serialized form exceeds the
bounded inline ceiling rather than truncating it. This specification defines
the content-addressed transport that carries those operations, and the sync
protocol version that admits them.

## Versions

| Artifact | Version | Source |
| --- | --- | --- |
| Content manifest | 1 | `CONTENT_MANIFEST_VERSION` |
| Workspace sync protocol | 2 | `WORKSPACE_SYNC_PROTOCOL_VERSION` |
| Accepted sync protocols | 1, 2 | `SUPPORTED_SYNC_PROTOCOL_VERSIONS` |
| Workspace Durable Object schema | 2 | `_sql_schema_migrations` |

Protocol 1 remains accepted for inline-only batches so already-deployed
clients keep working. Chunked payloads require protocol 2
(`MIN_CHUNKED_CONTENT_PROTOCOL_VERSION`). The Worker upgrades a parsed
protocol-1 request to the protocol-2 shape and always answers with
version 2; parsing is idempotent, so a parsed request can be re-validated.

## Canonical bytes and hashing

- The only accepted algorithm is SHA-256, serialized as 64 lowercase
  hexadecimal characters. Uppercase, short, and non-hexadecimal digests are
  rejected. This matches the existing image `content_hash` convention.
- Content is split at a fixed `CANONICAL_CHUNK_BYTES` (1 MiB) boundary. Every
  chunk except the last must be exactly that length. Fixed boundaries make the
  manifest for a given byte string deterministic across clients, so
  deduplication is exact and a client cannot choose adversarial boundaries to
  produce a different manifest for identical content.
- A manifest carries both per-chunk digests and a `contentDigest` over the
  whole byte string. Verifying reassembled content checks length, every chunk
  digest, and the whole-content digest, so matching chunks with a forged
  content digest are rejected.
- Digests are always verified from received bytes. Nothing trusts a digest
  supplied by a client, a filename, or an object key.

## Bounds

| Bound | Value |
| --- | --- |
| Canonical chunk size | 1 MiB |
| Chunks per manifest | 256 |
| Total content | 256 MiB |
| Mime type | 128 bytes, `application`/`image`/`text`/`audio`/`video` subtype |

The image-only `validate_mime_type` used by `AttachImage` is unchanged;
content manifests use their own bounded validator so archive and image
validation are not weakened.

## Wire shape

`ClientSyncOperation` and `ReplicatedWorkspaceOperation` carry a tagged
payload instead of a bare envelope:

```json
{ "form": "inline", "operation": { "protocolVersion": 1, "operation": {} } }
{ "form": "chunked", "manifest": { "manifestVersion": 1, "kind": "operation_envelope" } }
```

A chunked sync operation must carry a manifest whose `kind` is
`operation_envelope`; asset manifests are rejected on that path. Unknown
payload forms, unknown algorithms, unknown manifest versions, and unknown
object fields are rejected with stable errors rather than ignored.

`AttachImage` remains `unsupported_sync_protocol_v1` in the
[operation policy](workspace-operation-sync-policy-v1.md). Asset manifests are
defined here but no operation references them yet.

## Canonical sources

- Rust owns the contract: `skriuw-domain::chunk` and `skriuw-domain::sync`.
- The generated [content manifest schema](../../contracts/generated/content-manifest.schema.json)
  is committed and drift-checked.
- [`sync-push-v1.json`](../../contracts/fixtures/sync-push-v1.json) is retained
  as the legacy golden request that exercises the Worker upgrade shim.
  [`sync-push-v2.json`](../../contracts/fixtures/sync-push-v2.json) is the
  current golden request and carries one inline and one chunked operation.
- The Worker mirrors these rules in `cloud/src/contracts.ts` because it cannot
  execute the Rust validator.

## Client behavior

Locally queued operations are always inline: the SQLite outbox stores the
envelope, and externalization happens at push time. An operation above the
inline ceiling is still enqueued, and is claimed alone so it is never measured
against the inline batch bounds — once externalized it is a small manifest.

`externalize_oversized_operations` uploads every missing chunk before the push,
so the server never receives a manifest whose content is absent.
`resolve_chunked_operations` downloads and verifies content on pull and hands
the local apply path a complete envelope. The apply path itself still rejects a
chunked payload with a stable error, so an unresolved operation can never reach
domain validation as partial state. That keeps SQLite the interaction store and
keeps network work off the apply path.

Content above the 256 MiB manifest ceiling is still blocked locally as
`operation_too_large` rather than truncated.

## Durable Object storage

Schema 2 renames `sync_operations.operation_json` to `payload_json` and
rewrites every existing row into an inline payload, so an already-deployed
ordered log upgrades without losing entries or re-assigning server sequences.
An object at a newer schema than the running service still refuses to start.

## Checkpoints

A checkpoint is a validated `WorkspaceArchive` stored as chunked content plus
the server sequence it was taken at. `WorkspaceCheckpoint::build` produces the
record and its canonical bytes; `verify_content` re-verifies length, every
chunk digest, the whole-content digest, the declared archive version, and full
archive validation before any state is replaced.

Publication is atomic from a client's perspective: the Worker only writes the
record after confirming every referenced chunk is stored, so an incomplete
checkpoint is never discoverable as current. Checkpoint generation picks no
conflict winners — a client that still holds unresolved conflicts cannot export
a portable archive at all, which is the same fail-closed rule the local export
path already enforces.

Hydration is refused unless the device has an active connection, a zero pull
cursor, and an empty outbox, so it can never discard pending local work. After
hydrating, the device sets its cursor to the checkpoint sequence and pulls only
the ordered tail.

## Open work

- Checkpoint publication and hydration are not driven by the coordinator yet:
  the storage and Worker sides exist, but no client automatically publishes a
  checkpoint or hydrates from one on first connect.
- Asset manifests are defined but no operation references them; `AttachImage`
  stays unsupported.
- Representative large-workspace memory and latency measurements.
