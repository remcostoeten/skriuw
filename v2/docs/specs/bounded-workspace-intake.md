# Bounded workspace intake

Status: implemented August 2026.

Workspace operations and archives are local inputs, but they still cross a trust seam before entering recursive document processing, the runtime queue, SQLite, FTS, and history projections.

The domain contract enforces these deliberately generous ceilings:

- 100,000 operations in one atomic group.
- 512 MiB serialized bytes across one atomic operation group.
- 128 MiB canonical document JSON.
- 128 MiB canonical Markdown.
- 1,000,000 JSON values in one document.
- 128 levels of JSON nesting.

The limits admit the existing provider-import intake ceiling and scale fixtures while bounding queue memory and document traversal. The runtime validates an operation group before enqueueing it; storage validates the same domain contract again before mutation. Archives apply identical document limits before opening a replacement transaction. Rejections use the existing bounded diagnostic projection and never partially mutate storage.

Raising a ceiling is backward-compatible but requires representative memory measurements. Lowering one can make an archive or operation accepted by an earlier release invalid and therefore requires an ADR plus compatibility fixtures.
