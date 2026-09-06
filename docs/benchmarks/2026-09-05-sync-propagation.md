# Sync propagation (2026-09-05)

## In-process two-coordinator measurement

Method: `crates/skriuw-sync/tests/propagation_latency.rs`
(`cargo test -p skriuw-sync --test propagation_latency -- --nocapture`; a
bounded `#[test]` that also asserts p95 < 2 s). Two real SQLite workspace
files in a temporary directory, one `SyncCoordinator` thread per file with
its own connection, the deterministic `FakeServer`/`FakeTransport` pair from
the crate's test support standing in for the Cloudflare service, and the wake
channel wired the way the service wires it: a push accepted from device A
calls `notify_remote_change` on device B's coordinator. The measured span is
`apply_operations` on A's interactive connection (plus `notify_local_commit`)
until B's `workspace_observer` receives the `RemoteChangeSet` for the note,
which covers A's push cycle, the wake, B's pull cycle, and B's apply. 100
sequential `SaveDocument` edits on one note after one seeding `CreateNote`;
every reported change names exactly that note and no structure change, and B's
final body equals the last edit. Hardware: Intel Core i7-10700F, Linux 7.1,
rustc 1.95, unloaded machine, no warm-up discarded.

| Build | p50 | p95 | max |
| --- | --- | --- | --- |
| debug (`cargo test`) | 4.98 ms | 8.30 ms | 11.02 ms |
| release (`cargo test --release`) | 0.82 ms | 0.94 ms | 1.08 ms |

Reading: with network time removed, the two coordinators, four SQLite
transactions (A's claim and acknowledgement, B's apply and cursor advance),
and the thread hand-offs cost about a millisecond end to end, so the
propagation budget is spent almost entirely on the network round trips and the
service. The in-process figure is the floor, not a prediction.

## Renderer measurement

Method: a unit-level micro-benchmark, not the headless-Chrome harness. The
"remote change while typing" harness phase was not added; the numbers below
time the store operations the renderer runs on a remote change, in Node
(tsx), on synthetic workspaces of 1,000 and 5,000 notes (20 paragraphs per
document, one folder per 50 notes), 50 rounds each, with `nodes` and
`documents` selector subscriptions attached. Keystroke P95 under a concurrent
remote apply was therefore not measured in a browser; what is measured is the
main-thread cost the store adds per reconcile. Script:
`app/performance/remote-reconcile-bench.ts` (`bun --cwd=app x tsx
performance/remote-reconcile-bench.ts <notes> <rounds>`). Hardware: Intel Core
i7-10700F, Linux 7.1, Node 24 (tsx), unloaded machine, no warm-up discarded.

| Operation | 1,000 notes p50 / p95 / max | 5,000 notes p50 / p95 / max |
| --- | --- | --- |
| `applyRemoteDocuments` (delta of 3 notes) | 0.26 / 1.83 / 2.94 ms | 1.33 / 2.57 / 10.74 ms |
| `replaceFromSnapshot`, tree unchanged (identity-preserving) | 1.81 / 4.76 / 10.23 ms | 13.22 / 36.63 / 37.96 ms |
| `replaceFromSnapshot`, one node retitled (derive) | 1.83 / 2.75 / 3.49 ms | 12.58 / 36.47 / 40.33 ms |
| `createInitialState` from a full snapshot (reference) | 3.12 / 24.85 / 28.62 ms | 16.82 / 96.74 / 106.63 ms |

Subscriber wake-ups over all 200 rounds: 200 — the `nodes` selector never
fired on the delta path or on the unchanged-tree snapshot path (50 + 50
`documents` wake-ups), and fired once per round only when a node record
changed (50 `nodes` + 50 `documents`). Unchanged `DocumentRecord`, node and
metadata objects keep their identity across both paths, so row and editor
subscribers see no change.

Reading: the delta path stays well inside the 8 ms keystroke budget at 5,000
notes; the snapshot path does not (its cost is dominated by
`createInitialState` re-parsing the snapshot, which the identity pass then
mostly discards), which is why document-only remote changes must arrive as
`{ noteIds }` deltas and the snapshot path is reserved for structural or full
changes. The IPC/worker read cost, JSON transfer, and the ProseMirror
transaction the editor dispatches on the active note are not included; the
editor's block-level diff and `ReplaceStep` application is covered only by
correctness tests.

## Real Cloudflare deploy

Unverified. No measurement was taken against the deployed service; the
end-to-end figure adds two HTTPS round trips (push, pull), the Durable
Object's `workspaceChanged` broadcast, and the WebSocket wake on the peer,
none of which the in-process harness models.
