# ADR-0056: Account deletion purges cloud data before local reset

- Status: accepted
- Date: 2026-10-06

## Decision

Account & sync offers a guarded account deletion action. The authenticated
Worker records a deletion tombstone before purging the account's sync Durable
Object, R2 chunks, memberships, devices, workspace metadata, and shared notes.
The tombstone denies later sync authorization and provisioning. Auth records are
deleted only after the cloud purge succeeds. A failed purge can be retried with
the still-valid session; the tombstone remains in force during retries.

After cloud deletion succeeds, the client clears its local Skriuw storage and
session. Desktop removes every registered account workspace, the active local
workspace, and the workspace registry. Browser removes its Skriuw OPFS data,
workspace slots, and local session state.

Deletion cannot reach devices that are offline. Their local workspace copies
remain on those devices and are not synchronized after the cloud account is
deleted.

## Consequences

- Purging is idempotent, so a retry can finish after a partial cloud failure.
- A deleted account's prior ID cannot provision or access its workspace again.
- Local reset happens after cloud purge; an error during local file deletion
  may require the existing Data & recovery reset action.
- Other devices must be cleared locally when they next become available.
