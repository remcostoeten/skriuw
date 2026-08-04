# Cloud sync authentication and authorization boundary

Status: provider-independent boundary implemented; production access disabled.

This specification defines the v2 Worker trust boundary for sync protocol v1.
It does not select an account provider or create a membership database. The
current product configuration contains neither decision, so the deployed Worker
must continue to return `sync_authentication_not_configured` without resolving a
workspace Durable Object.

## Provider and membership decision

No production identity issuer, credential format, or server-owned membership
store has been selected for v2. v1 authentication is not an option and is not a
dependency. Test credentials and the deterministic in-memory membership adapter
exist only inside the Workers test suite and are never production behavior.

The production blocker has two parts:

1. select and configure an identity provider adapter that validates signed or
   opaque bearer credentials, including issuer/audience, expiry, not-before,
   and provider revocation behavior;
2. select and configure a server-owned workspace, membership, role, and device
   registry with removal and workspace-deletion semantics.

There are intentionally no accepted secret names or `.dev.vars` values yet.
Adding a generic shared secret, a test token, or caller-provided membership
claims would not satisfy this decision. A provider selection must add its exact
binding and secret names, generated Wrangler types, rotation procedure, and
production-shaped integration tests in the same change.

## Trusted flow

For a recognized push or pull route, the Worker performs these steps in order:

1. require a configured credential verifier and membership source;
2. parse one bounded `Authorization: Bearer <credential>` header;
3. ask the verifier for a typed trusted subject, session ID, and expiry;
4. reject invalid verifier output and sessions expired at the Worker clock;
5. validate the workspace path identifier;
6. look up the trusted subject and requested workspace in the server-owned
   membership source;
7. enforce the membership role and, for push, the registered device ID;
8. validate method, query or bounded JSON body, protocol version, envelope,
   generated operation schema, operation replication policy, identifiers,
   sequences, and size limits;
9. only then derive and invoke the workspace Durable Object.

The request body cannot supply a user, role, membership, or workspace claim.
Unexpected top-level fields are rejected. `deviceId` is a protocol sequencing
identity, not a credential, and a push device must be present in the
server-owned membership record.

## Roles

| Role | Pull | Push |
| --- | --- | --- |
| `owner` | allowed | allowed |
| `editor` | allowed | allowed |
| `viewer` | allowed | denied |

Non-members, removed members, deleted workspaces, and guessed workspace IDs all
return the same `workspace_access_denied` response. The response does not reveal
whether the workspace exists or why access is absent.

## Routes and current exposure

The guarded route shapes are:

- `POST /v1/workspaces/{workspaceId}/push`
- `GET /v1/workspaces/{workspaceId}/pull?syncProtocolVersion=1&afterServerSequence={cursor}&limit={limit}`

The production entry point supplies an unavailable access configuration, so
both routes remain disabled and return HTTP 503. Tests inject the deterministic
credential and membership adapters through the same handler and prove the
complete ordering, validation, authorization, and Durable Object integration.
`GET /health` reports only `{ "status": "ok", "publicSync": false }`.

## Stable public errors

Responses contain only `{ "error": "<code>" }` and `Cache-Control: no-store`.
Credential failures also return a generic Bearer challenge.

| HTTP | Codes |
| --- | --- |
| 400 | `invalid_request`, `invalid_workspace_identifier`, `sync_rejected`, `device_local_operation`, `unsupported_operation` |
| 401 | `credential_missing`, `credential_malformed`, `credential_invalid`, `credential_expired`, `credential_revoked` |
| 403 | `workspace_permission_denied`, `device_not_authorized` |
| 404 | `workspace_access_denied`, `not_found` |
| 405 | `method_not_allowed` |
| 413 | `request_too_large` |
| 500 | `internal_error` |
| 503 | `sync_authentication_not_configured`, `sync_authorization_not_configured`, `sync_security_configuration_invalid`, `sync_authentication_unavailable`, `sync_authorization_unavailable`, `sync_service_unavailable` |

Provider responses, exception text, credentials, workspace identifiers,
operation content, and note content never enter public errors or structured
security logs. Logs contain only event, stable code, status, route kind, and
HTTP method.

## Expiry, removal, deletion, and revocation

The Worker adds no expiry tolerance: an identity with `expiresAt <= now` is
expired. A future provider adapter may allow at most 30 seconds of clock
tolerance while verifying provider `nbf` and equivalent claims; it may not
extend the expiry returned to the Worker.

Credential verification and membership lookup run on every request. There is
no authorization cache, so credential revocation, membership removal, device
removal, and workspace deletion take effect on the next request. A provider
adapter must consult a revocation-capable source on every verification or prove
that the credential itself has a sufficiently short, explicitly approved
validity bound. Key rotation must preserve verification only for credentials
that remain valid under provider policy; emergency key or session revocation
must fail closed immediately.

## Local verification

No credentials are needed because production routes are disabled. Run:

```bash
cd v2/cloud
bun install --frozen-lockfile
bun run check
bun run deploy:dry
```

The suite covers missing, malformed, invalid, expired, and revoked credentials;
provider failures; all roles; membership and device removal; guessed and
cross-workspace access; malformed and oversized requests; protocol and
operation-policy rejection; ordered/idempotent log behavior; workspace
isolation; and sanitized errors and logs.
