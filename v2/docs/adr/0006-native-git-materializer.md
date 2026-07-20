# ADR-0006: Native Git history materializer

- Status: accepted
- Date: 2026-07-20

## Context

Desktop history needs durable Markdown diffs without requiring users to install Git and without introducing filesystem or native-library dependencies into portable crates. History processing is outside navigation and editing paths.

## Decision

Use `git2` with vendored libgit2 inside the native-only `skriuw-history-git` adapter. Enable local repository support only; exclude network, HTTPS, SSH, and credential features. Materialize each note at `notes/<stable-id>.md` on a dedicated `history` branch.

Commit messages contain the history outbox ID, note ID, and revision. A retry whose outbox ID matches the branch head returns the existing commit instead of creating a duplicate. The generic history worker remains unaware of Git.

## Consequences

- End users do not need a Git executable or system libgit2 installation.
- Native builds gain vendored C compilation time and binary size.
- Git work never enters renderer, navigation, editing, or portable web crates.
- Browser builds select another `HistoryMaterializer` and do not compile this adapter.
- Repository rebuild and history-reading APIs remain separate follow-up work.
