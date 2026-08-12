# ADR-0018: Read-only Git history integrity and cache rebuild

- Status: accepted
- Date: 2026-07-21

## Context

Git history is an asynchronous projection of SQLite document revisions. Cached history headers can be rebuilt, but rebuilding from malformed Git state could replace a useful cache with incomplete or ambiguous data. Opening the existing materializer is unsuitable for verification because it creates directories and initializes missing repositories.

## Decision

The native Git adapter owns a separate read-only history reader. It opens one exact existing non-bare repository without searching parent directories, requires a worktree, and never creates, initializes, repairs, fetches, resets, checks out, or writes repository state. Missing, non-repository, unreadable, bare, and worktree-less inputs fail explicitly. An existing valid repository without `refs/heads/history` is healthy empty history.

Integrity inspection starts only at `refs/heads/history` and visits every reachable commit deterministically. Healthy history is one linear chain: its root has no parent and every later commit has exactly one parent. Merge commits and unreadable ancestry are issues. Every commit must contain exactly one valid `Skriuw-Outbox`, `Skriuw-Note`, `Skriuw-Revision`, and `Skriuw-Created-At` trailer. Identifiers use the existing bounded safe-character rule, revisions are positive, and timestamps are non-negative. Outbox IDs and note-revision pairs must be unique.

Each commit must resolve `notes/<note-id>.md` in its own tree to a readable blob containing UTF-8 Markdown. Inspection returns typed deterministic commit and distinct-note counts plus typed issues. Public diagnostics expose only stable integrity categories and issue counts; paths, object IDs, libgit2 text, and repository internals remain inside the adapter.

Cache rebuild enumerates and validates the complete owned history before opening or changing SQLite. Only validated backend-neutral headers cross the adapter boundary. SQLite then replaces `history_cache` through the existing single-transaction `replace_history_headers` capability. Any Git failure leaves the old cache untouched, and any SQLite failure rolls back the delete and all inserts. Valid empty history replaces the cache with an empty cache. Markdown remains lazy and never enters `history_cache`.

Integrity and rebuild run only through explicit calls and CLI commands. They do not run during startup, bootstrap, save, history materialization, navigation, or version-header rendering.

## Consequences

- Repository checking cannot accidentally create or repair the target.
- Retry and cache identities cannot become ambiguous through duplicate outbox IDs or note revisions.
- Cache publication happens only after complete Git validation and remains atomic.
- Git and libgit2 types stay inside the native adapter; portable history and storage contracts remain backend-neutral.
- Only `refs/heads/history` is owned or scanned. Other refs are irrelevant.
- Historical Markdown reads remain per-version and lazy.
