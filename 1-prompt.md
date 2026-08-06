# Execute the first remaining v2 cloud-sync assignment

Work in `/home/remcostoeten/dev/skriuw`.

Read and follow the repository `AGENTS.md`, then read `2.md` completely and
execute it. Treat `2.md` as the detailed task contract and this prompt as its
execution wrapper.

Do not stop after analysis or planning. Inspect the current repository state,
implement the authorized scope, add tests and documentation, run the required
verification, and provide the complete handoff. Continue through ordinary
test failures and implementation problems until the objective is genuinely
complete or an external prerequisite makes further safe progress impossible.

## Repository safety

This repository has an intentional dirty working tree containing unfinished v2
browser, cloud, sync-contract, and SQLite work. Preserve every existing change.

Before editing:

1. Run `git status --short`.
2. Inspect the current diff and relevant untracked v2 files.
3. Determine which changes already implement part of `2.md`.
4. Read current code, tests, ADRs, specifications, and generated contracts
   instead of relying on stale prompt descriptions.

Do not reset, revert, discard, overwrite, stage, commit, or push unrelated
work. Never use destructive Git commands. Do not edit, delete, stage, or include
`release-notes-v2-v0.29.0.txt`. Do not modify anything under legacy `apps/` or
`packages/`. Keep all implementation within v2.

## Current prerequisite state

The current dirty tree is expected to contain:

- exhaustive `WorkspaceOperation` replication policy and generated contracts;
- an internal Cloudflare Worker and SQLite-backed Durable Object ordered log;
- optional native SQLite connection and transactional outbound queue;
- inbound cursor advancement, received-operation idempotency, local-echo
  handling, and durable semantic conflict records.

Verify these claims through code and tests. Do not reimplement completed work.
Do not expose public sync routes if their storage/protocol prerequisites are
missing or failing.

## Primary goal

Complete `2.md`: authenticate and authorize the v2 cloud sync API.

The finished boundary must:

- resolve identity from trusted credentials;
- authorize that identity using server-owned workspace membership;
- authenticate before resolving or invoking a workspace Durable Object;
- reject caller-supplied identity or membership claims as authority;
- expose bounded versioned push/pull routes only when production-shaped auth
  and authorization are configured and tested;
- fail closed when credentials, membership, secrets, or configuration are
  missing, invalid, expired, revoked, or insufficient;
- preserve operation-policy, field-validation, size, sequence, idempotency,
  cursor, and workspace-isolation guarantees;
- return stable safe errors without leaking credentials, private workspace
  existence, operation content, or note content.

Do not borrow v1 authentication or membership code. Do not invent production
credentials. If the repository contains no concrete auth-provider or membership
decision, inspect all available configuration and documentation first. Then
implement the narrow provider-independent boundary, production-shaped adapter
contract, deterministic test adapter, fail-closed configuration, route guards,
and complete security tests that can be done safely. Keep public routes disabled
and report the exact external product/configuration decision still required.
Do not substitute a mock provider as production behavior.

## Optional subagents

You are the integration owner. You may spawn subagents only for concrete,
bounded, non-overlapping work after you understand the current code and have
fixed the interfaces.

Suggested assignments:

- A read-only security reviewer to threat-model identity, membership,
  revocation, cross-workspace access, and information leakage.
- A read-only inventory agent to map current Worker routes, Durable Object
  calls, configuration, generated contracts, and existing tests.
- A test-focused implementation agent to add isolated authorization/error
  cases after you define the route and adapter contracts.

Prefer Codex Sol for repository implementation. Terra may handle bounded
inventories or test enumeration. An Opus/Fable-class reviewer may be used if
the executing environment actually exposes one; otherwise use Codex Sol. Do not
invent unavailable model identifiers.

Only one agent may edit Worker routing, Durable Object integration, generated
contracts, or cloud configuration. Do not let subagents edit overlapping files
or independently design competing auth interfaces. Review every subagent result
yourself and run all final checks as the lead. Subagent completion does not mean
the assignment is complete.

## Required quality bar

Use narrow explicit modules and stable typed errors. Validate every external
trust boundary. Keep secrets and private content out of source, fixtures,
diagnostics, and logs. Avoid speculative dependencies and generic wrappers.

At minimum, tests must cover:

- missing, malformed, expired, and revoked credentials;
- member, non-member, removed-member, and role-restricted access;
- cross-workspace access and guessed workspace identifiers;
- absent or invalid configuration failing closed;
- malformed requests, unknown protocol versions, invalid operations, and
  oversized bodies;
- retries, exact duplicates, conflicting duplicates, sequence gaps, ordered
  pull, and workspace isolation remaining correct;
- safe public error responses and sanitized structured logging.

Update canonical v2 documentation only where implementation and tests prove the
new behavior. Do not commit agent handoffs, generated audits, or temporary plans
as product documentation. Regenerate contracts through the repository generator
if canonical Rust wire types change; never hand-edit generated files.

## Scope limits

Do not implement:

- desktop or browser account UI;
- the desktop background coordinator in `3.md`;
- browser OPFS storage;
- conflict merging or resolution UI;
- R2 chunks or checkpoints;
- deployment or production resource creation.

Do not make network work part of typing, navigation, search, export, recovery,
or local-only startup.

## Verification

Run focused tests while iterating. Before handoff, run every applicable command
below from the specified directory:

```bash
cd /home/remcostoeten/dev/skriuw/v2
./scripts/generate.sh
./scripts/check.sh
./scripts/check-wasm.sh

cd /home/remcostoeten/dev/skriuw/v2/cloud
bun run deploy:dry

cd /home/remcostoeten/dev/skriuw
git diff --check
git status --short
```

Use the repository's Cloudflare/Wrangler instructions before running Wrangler
or changing its configuration. Do not claim a command passed unless it actually
completed successfully. If a check fails because of a preserved unrelated
change, isolate and report the evidence rather than modifying unrelated work.

## Completion and handoff

Finish with a concise evidence-backed report containing:

- the authentication provider/configuration decision;
- the trusted identity and membership authorization flow;
- public route status and why it is enabled or still disabled;
- stable error and revocation behavior;
- files changed;
- tests and verification commands run with exact results;
- subagents used and how their output was validated;
- remaining external prerequisites, security assumptions, and risks;
- whether `3.md` is now unblocked.

Do not recommend starting `3.md` production integration unless authenticated
and authorized push/pull routes genuinely pass the required tests. If blocked,
name the precise missing authority, credential, provider choice, or external
configuration instead of claiming completion.
