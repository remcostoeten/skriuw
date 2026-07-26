# ADR-0024: Previewed and atomic provider import

- Status: accepted
- Date: 2026-07-26

## Context

Provider exports contain more than Markdown. They may carry folders, timestamps,
tags, typed properties, local assets, provider-specific links, and unsupported
records. Automatic source detection followed immediately by workspace mutation
does not give the user enough information to judge collisions or loss. Splitting
note creation from document saves can also leave an incomplete migration when
the second request fails, even though each individual storage request is atomic.

Imports remain local filesystem operations. Provider APIs, account credentials,
and network access are outside this feature.

## Decision

Provider import uses four phases:

1. Read a local directory or supported archive into a bounded source tree.
2. Detect and parse a provider into a pure import bundle.
3. Build and display a preview without changing workspace state.
4. Submit every canonical workspace operation in one storage request.

Detection is advisory. Preview identifies the selected provider, counts every
planned entity, lists warnings, and permits cancellation before mutation.
Adapters return structured diagnostics with severity and optional source paths.
Unsupported source content is retained losslessly when possible; otherwise the
preview and completion report identify each affected source.

Local image bytes may enter the content-addressed blob store before confirmation
of the SQLite transaction. Unreferenced blobs are safe and reclaimable. Note,
folder, reference, tag, property, image-record, and document writes commit in one
SQLite transaction. Any rejected operation rolls back the complete workspace
import.

Provider timestamps become canonical node timestamps when valid. Adapter tags
remain explicit import metadata and are associated through supported workspace
reference operations. Import must not silently discard tags solely because a
note uses lossless raw Markdown.

Apple Notes support targets its documented Markdown export. Skriuw does not read
Apple's private Notes database. Bear backup archives and ordinary ZIP exports
are accepted through bounded native extraction.

## Consequences

- Users see provider choice, scope, collisions, and loss before import.
- Cancellation before confirmation changes no workspace state.
- Workspace records never expose a half-created import.
- Adapters stay deterministic and testable without Tauri or storage.
- Archive extraction needs traversal, symlink, entry-count, and byte limits.
- Re-import creates another copy until a durable provider-identity contract is
  designed; preview states this behavior.
- Content-addressed blobs can outlive a failed import and require later garbage
  collection, but cannot corrupt canonical workspace state.
