# Skriuw v2 cloud

This package contains the new v2-only cloud sync data plane. It does not import
or reuse any implementation from `apps/` or `packages/`.

One SQLite-backed Durable Object owns the ordered operation log for one
workspace. The Worker now has a tested provider-independent authentication,
membership, role, device, validation, and safe-error boundary, but public sync
routes remain deliberately unavailable because v2 has not selected or
configured a production identity provider or server-owned membership store. Do
not treat the current Worker as a user-facing deployment and do not configure a
test adapter as production authentication.

The canonical wire types and bounds live in `skriuw-domain`; committed JSON
Schemas, the generated
[`WorkspaceOperation` policy](../docs/specs/workspace-operation-sync-policy-v1.md),
and the golden fixture bridge the Rust and Workers implementations.

## Commands

```bash
bun install --frozen-lockfile
bun run check
bun run deploy:dry
```

See [the cloud sync master tracker](../docs/specs/cloud-sync-master.md) for the
architecture, completed work, and remaining delivery sequence. The
[authentication and authorization contract](../docs/specs/cloud-sync-authentication.md)
documents route shapes, roles, stable errors, revocation behavior, local setup,
and the exact provider and membership decisions still required.
