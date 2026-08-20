# Skriuw v2 cloud

This package contains the new v2-only cloud sync data plane. It does not import
or reuse any implementation from `apps/` or `packages/`.

One SQLite-backed Durable Object owns the ordered operation log for one
workspace. Better Auth provides email/password identity on `/api/auth/*`, with
accounts and sessions stored in D1. `POST /v1/sync/provision` derives one private
workspace from the authenticated account and registers a bounded device ID;
D1-owned membership is checked again on every push and pull. Signing in does
not enable sync by itself—the desktop user must explicitly connect it.

For local development, copy `.dev.vars.example` to `.dev.vars`, replace the
secret, and apply the D1 migrations before starting Wrangler. Production uses
the D1 database `skriuw-v2-auth`, Worker
`https://skriuw-v2-cloud.remcostoeten.workers.dev`, and web app origin
`https://skriuw.com` (the `/app` path is not part of an origin). The desktop
origins are also allowlisted for Tauri. Never put `BETTER_AUTH_SECRET` in
`wrangler.jsonc`; install or rotate it with `wrangler secret put`.

`BETTER_AUTH_API_KEY` is optional and connects the deployment to the Better
Auth Infrastructure dashboard (`dash.better-auth.com`), which reads accounts,
sessions, and auth events from `/api/auth/dash/*`. It also enables `sentinel()`,
which scores sign-in attempts for credential stuffing and answers a suspicious
attempt with a proof-of-work challenge that the desktop client's
`sentinelClient()` solves. Without the key neither plugin is mounted and nothing
leaves the Worker. It is a secret: install it with
`wrangler secret put BETTER_AUTH_API_KEY`, never in `wrangler.jsonc`.

The canonical wire types and bounds live in `skriuw-domain`; committed JSON
Schemas, the generated
[`WorkspaceOperation` policy](../docs/specs/workspace-operation-sync-policy-v1.md),
and the golden fixture bridge the Rust and Workers implementations.

## Commands

```bash
bun install --frozen-lockfile
bunx wrangler d1 migrations apply skriuw-v2-auth --local
bun run check
bun run deploy:dry
```

Production deployment:

```bash
bunx wrangler d1 migrations apply skriuw-v2-auth --remote
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler deploy
```

The `preview` environment is a verification-only deployment at
`https://skriuw-v2-cloud-preview.remcostoeten.workers.dev`. It owns its own D1
database (`skriuw-v2-auth-preview`), R2 bucket
(`skriuw-v2-sync-content-preview`), Durable Object storage, and
`BETTER_AUTH_SECRET`, so end-to-end runs never touch production accounts or
workspaces. It is also the only deployment that trusts the browser dev origin
`http://localhost:5183`; production trusts `https://skriuw.com` and the Tauri
origins alone, and that list must never be widened to make a test pass. Every
command takes `--env preview`:

```bash
bunx wrangler d1 migrations apply skriuw-v2-auth-preview --remote --env preview
bunx wrangler secret put BETTER_AUTH_SECRET --env preview
bunx wrangler deploy --env preview
```

See [the cloud sync master tracker](../docs/specs/cloud-sync-master.md) for the
architecture, completed work, and remaining delivery sequence. The
[authentication and authorization contract](../docs/specs/cloud-sync-authentication.md)
documents route shapes, roles, stable errors, revocation behavior, and local
setup.
