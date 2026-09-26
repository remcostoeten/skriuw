---
title: "ADR-0046: Per-account local workspaces"
---

- Status: accepted
- Date: 2026-09-18

## Context

A cloud workspace id is derived from the account: `sha256("skriuw-sync-workspace-v1\0" + userId)`,
computed in `services/sync/src/provision.ts`. It is stable for an account and unique
between accounts, so the account that owns a workspace is never ambiguous.

An installation, however, had exactly one local store. The first account to
sign in wrote its workspace id into `sync_connection`, and from then on that
store belonged to that account permanently. Signing in with a second account
provisioned a different id, and `connect` refused:

> This local workspace is linked to another cloud workspace. Sign back into its
> original account and cloud environment, or open a fresh local workspace
> before linking a different account.

The guard is correct — pushing one account's notes into another account's
workspace would be a privacy failure, not a merge — but it was also the only
outcome. The workspace could not be un-branded, so the user's choices were to
abandon the other account or to destroy the local workspace by hand. The same
dead end appears without any second account: rebuilding the auth database
changes a user's id, and every existing installation of that same person is
then permanently locked out of sync.

Two more things made it worse than it looked. The browser reported the refusal
as `authenticationRequired`, whose description is "your cloud session ended;
sign in again to reconnect" — so the true reason never reached the user, and
the offered action could not have fixed it. And `authenticationRequired`
suppressed the Sign out control, leaving the account surface with no way to
leave the account it was displaying.

## Decision

An installation holds one local workspace **per cloud account**, and routing
between them is automatic.

A machine-local registry maps a cloud workspace id to the storage that holds
it. It records routing only; what lives inside a workspace stays owned by the
workspace database, and the registry never duplicates it.

- Desktop: `workspaces.json` in the app data directory, mapping each id to a
  directory under the storage base. `database_path` resolves it before anything
  opens the database.
- Browser: `skriuw.workspace-slots.v1` in local storage, mapping each id to the
  SQLite database name and OPFS blob directory the tab opens.

Sign-in resolves the route before sync connects, in `connectSyncForCurrentSession`,
using the workspace id that `/v1/sync/state` already returns without side
effects. Three outcomes:

| local state | outcome | effect |
| --- | --- | --- |
| never signed in | `claimed` | the existing workspace becomes this account's, in place |
| owned by this account | `active` | connect, unchanged |
| owned by another account | `switched` | route to this account's own storage and reopen |

`claimed` is what keeps a first sign-in from losing the notes someone wrote
before they had an account: nothing moves, the store is simply recorded as
theirs and its contents become their first synced content.

`switched` creates the new storage empty and lets sync rehydrate it. The
previous account's storage is left untouched on disk and is reached again by
signing back into it — switching accounts is reversible and lossless in both
directions. The desktop restarts and the browser reloads, because every
component is bound to the store it opened at startup and the storage worker
holds exclusive OPFS handles.

Both registries refuse any identity that is not `w_` plus a lowercase SHA-256
digest, and refuse to read back any directory or name they would not have
written themselves. The id reaches them from the renderer and is used to build
a path, so it is validated at that boundary. An unreadable or tampered registry
degrades to the pre-registry default rather than failing to open a workspace:
losing the route must never mean losing access to the notes.

The sync guard stays exactly as it is. It is now unreachable in normal use, and
that is the point — it remains the backstop that keeps a routing bug from
becoming a cross-account write.

## Consequences

- Signing into a second account is an ordinary action with no prompt, no
  reset, and no data loss. The conflict state has no path to it.
- An account whose cloud user id changes is routed to fresh storage and
  rehydrates from the cloud instead of dead-ending.
- Storage grows with the number of accounts used on one installation. Nothing
  reclaims a workspace whose account is no longer used; "Clear all data"
  removes every account's storage, which is why it enumerates blob directories
  rather than deleting one known name.
- `SKRIUW_DB` bypasses the registry entirely. A pinned database is a single
  fixed workspace by definition, so tests and packaging runs never restart into
  a different directory.
- Desktop switching costs a process restart. Making it seamless would mean
  rebuilding `AppState` and every component bound to the database path at
  runtime, which buys nothing for an action that happens when an account
  changes.
