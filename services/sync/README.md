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
[`WorkspaceOperation` policy](../../apps/docs/content/v2/specs/workspace-operation-sync-policy-v1.md),
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
node ../../scripts/verify-cloud-capabilities.mjs
```

## Deploy order

**The Worker ships first.** Clients read routes the Worker serves before they
can do anything with them, and the browser client deploys automatically from
`daddy` through Vercel, so a client change that needs a new route must not
reach `daddy` before the Worker that serves it. The order is:

1. deploy the Worker (production), then
2. merge the client change to `daddy`, then
3. tag the desktop release.

`.github/workflows/deploy-cloud.yml` automates step 1 for pushes to `daddy`
that touch `services/sync/`, but only once the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets exist; until then it skips with a
notice and the deployment stays manual. `.github/workflows/release-v2.yml`
refuses to publish a desktop release whose capabilities the deployed Worker
does not report.

`GET /health` is the capability report both checks read, and
`node scripts/verify-cloud-capabilities.mjs [base-url]` checks any deployment
from a workstation.

The `preview` environment is a verification-only deployment at
`https://skriuw-v2-cloud-preview.remcostoeten.workers.dev`. It owns its own D1
database (`skriuw-v2-auth-preview`), R2 bucket
(`skriuw-v2-sync-content-preview`), Durable Object storage, and
`BETTER_AUTH_SECRET`, so end-to-end runs never touch production accounts or
workspaces. Production trusts `https://skriuw.com`, the Tauri origins, and
`http://localhost:5183` for development against production. Every preview
command takes `--env preview`:

```bash
bunx wrangler d1 migrations apply skriuw-v2-auth-preview --remote --env preview
bunx wrangler secret put BETTER_AUTH_SECRET --env preview
bunx wrangler deploy --env preview
```

See [the cloud sync master tracker](../../apps/docs/content/v2/specs/cloud-sync-master.md) for the
architecture, completed work, and remaining delivery sequence. The
[authentication and authorization contract](../../apps/docs/content/v2/specs/cloud-sync-authentication.md)
documents route shapes, roles, stable errors, revocation behavior, and local
setup.
