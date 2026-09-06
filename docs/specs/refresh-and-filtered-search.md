# Renderer refresh recovery and filtered search

## Sync refresh

A failed canonical read retains its complete change set and merges incoming
reports. The reconciler releases the commit gate before retries at 250 ms, 1 s,
and 4 s. Exhaustion leaves work pending, reports an actionable refresh notice,
and allows an explicit retry or subsequent sync report to restart the drain.
There is no unbounded retry loop. `settled()` waits for active work, including
scheduled retries, but does not imply an exhausted pending change was applied.
Disposal cancels retry timers and prevents in-flight reads from updating the
renderer after session teardown. Disposing a pending window-close attempt also
prevents its delayed completion from closing a replacement session.

## Filtered full-text search

The renderer resolves relationship operators to candidate note IDs, then passes
`noteIds` through the desktop or browser search boundary. `null` means unrestricted;
an empty array means no candidates. SQLite applies the candidate constraint
before BM25 ordering and the result limit, preserving trash-ancestor exclusion.
A candidate outside the old global over-fetch window must still be returned.

The storage port supplies an explicit filtered-search capability. Adapters without
that capability reject nonempty filtered requests instead of returning incomplete
results. Both deployed adapters use the same SQLite implementation. Browser
requests that omit `noteIds` remain unrestricted for compatibility.

The request remains bounded: 100,000 candidate IDs and results maximum; each
candidate ID must be nonempty and at most 256 bytes. These reads run on search
interaction, never note navigation. Renderer result filtering remains a final
check against its current relationship projection.
