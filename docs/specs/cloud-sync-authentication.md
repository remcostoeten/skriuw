# Cloud sync authentication and authorization boundary

Status: production account identity and private-workspace authorization implemented.

This specification defines the v2 Worker trust boundary for sync protocol v1.
Better Auth supplies v2 account identity through email/password sessions stored
in D1. The Worker validates each bearer through Better Auth, then consults the
server-owned D1 workspace membership and device registry before resolving a
workspace Durable Object.

## Provider and membership decision

The production identity provider is Better Auth with its email/password and
bearer plugins. Accounts, credential hashes, sessions, and verification records
live in the `skriuw-v2-auth` D1 database. The production Worker is
`https://skriuw-v2-cloud.remcostoeten.workers.dev`; `https://skriuw.com` and
`http://localhost:5183` are the trusted browser origins for the deployed app
and local development. v1 authentication is not a dependency. Test credentials
and the deterministic in-memory membership adapter remain test-only behavior.

`POST /v1/sync/provision` accepts only a bounded `deviceId`. It derives a stable,
opaque private workspace ID from the trusted Better Auth subject and atomically
creates the owner membership and device registration. Request bodies cannot
choose a workspace, user, or role. The first release provisions one owner-only
workspace per account; sharing and membership management are later work.

`BETTER_AUTH_SECRET` is a Wrangler secret and must never be committed.
`BETTER_AUTH_URL` and `AUTH_TRUSTED_ORIGINS` are non-secret Worker variables.
Local values live in ignored `.dev.vars`; the committed example documents their
shape. Caller-provided membership claims remain untrusted and cannot satisfy the
membership decision.

## Account routes and deployment

Better Auth owns `/api/auth/*`. OAuth and password reset are not advertised
because v2 has no provider credentials or outbound email delivery. The Account
settings section lazy-loads the auth UI so account checks do not enter the local
workspace startup path. Native bearer tokens are stored in the operating-system
credential vault. The browser runtime has no vault access, so it persists its
bearer token in `localStorage` (`app/src/features/auth/session-store.ts`): the stored
value survives reloads, a sign-out in one tab is honored everywhere, malformed
values are cleared and treated as signed-out, and browsers that block storage
fall back to a page-lifetime in-memory session. HttpOnly cookies are not an
alternative here because the Worker is a separate origin from the app host and
the API is bearer-authenticated.

Production provisioning and rotation use Wrangler:

```bash
cd cloud
bunx wrangler d1 migrations apply skriuw-v2-auth --remote
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler deploy
```

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

- `POST /v1/sync/provision` (body read through a bounded reader before
  parsing)
- `GET /v1/sync/state`
- `POST /v1/workspaces/{workspaceId}/push`
- `GET /v1/workspaces/{workspaceId}/pull?syncProtocolVersion=1&afterServerSequence={cursor}&limit={limit}`
- the chunk, checkpoint, and acknowledge routes in
  [sync content operations](sync-content-operations.md)

The production entry point supplies Better Auth verification plus the D1
membership adapter. Tests inject deterministic adapters through the same
boundary and prove ordering, validation, authorization, and Durable Object
integration. `GET /health` reports only `{ "status": "ok", "publicSync": true }`.

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
| 410 | `log_truncated` — the pull cursor is below the workspace's compaction floor; the client rehydrates from the latest checkpoint |
| 413 | `request_too_large`, `quota_exceeded` — a chunk upload would take the workspace above its 2 GiB content quota |
| 500 | `internal_error` |
| 503 | `sync_authentication_not_configured`, `sync_authorization_not_configured`, `sync_security_configuration_invalid`, `sync_authentication_unavailable`, `sync_authorization_unavailable`, `sync_service_unavailable` |

Provider responses, exception text, credentials, workspace identifiers,
device identifiers, content digests, operation content, and note content never
enter public errors or structured security logs. Logs contain only event,
stable code, status, route kind, and HTTP method; the test suite spies the
console to keep it that way.

`GET /v1/sync/state` reports the workspace's `latestServerSequence`, the
latest checkpoint sequence, and `compactedThrough`, the compaction floor. A
client whose cursor is below `compactedThrough` will receive `log_truncated`
on its next pull and may start rehydration without a round trip.

## Expiry, removal, deletion, and revocation

The Worker adds no expiry tolerance: an identity with `expiresAt <= now` is
expired. A future provider adapter may allow at most 30 seconds of clock
tolerance while verifying provider `nbf` and equivalent claims; it may not
extend the expiry returned to the Worker.

Credential verification and membership lookup run on every request. There is
no authorization cache, so credential revocation, membership removal, device
removal, and workspace deletion take effect on the next request. The wake
channel is authorized at its handshake and additionally closed by a Durable
Object alarm scheduled for the earliest session expiry among its sockets, so
a revoked or expired session cannot keep receiving notifications.

Clients treat a 401 on any sync call as session expiry, not a transient
failure: the coordinator stops polling, the shell stops the wake listener and
clears the stored token, and the account surface offers "Sign in" regardless
of any cached user. The wake listener exits on a 401/403 handshake rather than
retrying with the same token. Session refresh extends the session's expiry
without rotating the token, so a device that syncs regularly keeps one valid
token; a device that stays away past expiry signs in again. A provider
adapter must consult a revocation-capable source on every verification or prove
that the credential itself has a sufficiently short, explicitly approved
validity bound. Key rotation must preserve verification only for credentials
that remain valid under provider policy; emergency key or session revocation
must fail closed immediately.

## Local verification

Account and sync routes fail closed when the Better Auth secret is absent. Run:

```bash
cd cloud
bun install --frozen-lockfile
bun run check
bun run deploy:dry
```

The suite covers missing, malformed, invalid, expired, and revoked credentials;
provider failures; all roles; membership and device removal; guessed and
cross-workspace access; malformed and oversized requests; protocol and
operation-policy rejection; ordered/idempotent log behavior; workspace
isolation; and sanitized errors and logs.
