# ADR-0006: Native Git history materializer

- Status: accepted
- Date: 2026-07-20

## Context

Desktop history needs durable Markdown diffs without requiring users to install Git and without introducing filesystem or native-library dependencies into portable crates. History processing is outside navigation and editing paths.

## Decision

Use `git2` with vendored libgit2 inside the native-only `skriuw-history-git` adapter. Enable local repository support only; exclude network, HTTPS, SSH, and credential features. Materialize each note at `notes/<stable-id>.md` on a dedicated `history` branch.

Commit messages contain the history outbox ID, note ID, and revision. A retry whose outbox ID matches the branch head returns the existing commit instead of creating a duplicate. The generic history worker remains unaware of Git.

The adapter exposes backend-neutral header listing and individual-version reads. Header listing rebuilds the SQLite cache atomically. Historical Markdown is read from the selected commit only when requested.

Desktop orchestration processes at most 64 items before yielding and checks
shutdown between every item. Each item still completes its Git commit and
matching SQLite cache acknowledgement independently.

## Consequences

- End users do not need a Git executable or system libgit2 installation.
- Native builds gain vendored C compilation time and binary size.
- Git work never enters renderer, navigation, editing, or portable web crates.
- Browser builds select another `HistoryMaterializer` and do not compile this adapter.
- Corrupt commit metadata fails cache rebuild without replacing the previous cache.
