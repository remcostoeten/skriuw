# ADR-0023: Lossless and reference-safe Markdown transfer

- Status: accepted
- Date: 2026-07-25

## Context

Markdown is both a portable interchange format and the readable projection stored beside each structured document. Ordinary Markdown labels do not carry Skriuw IDs. Import previously treated a wiki-link label as an ID, which broke backlinks and could create dangling references. Frontmatter and footnotes were parsed through a CommonMark-only schema and silently rewritten. Remote image syntax could also create a live network resource when a note opened.

## Decision

Markdown export remains ordinary readable Markdown without embedded Skriuw metadata. Note references serialize as `[[current title]]`, with the current title resolved from the stable target ID at export time.

The rich editor uses `@` as the single note-link authoring trigger. The bracketed form is an interchange representation for raw Markdown and provider imports, not a second completion path.

Import allocates every note ID before resolving references. A wiki-link becomes a structured reference only when its exact label identifies one imported or existing note. Ambiguous and unresolved labels stay literal source text. Note creation completes before reference-bearing document saves, so forward links and cycles never depend on operation order.

Frontmatter and footnote syntax select a lossless raw-source document. The exact source, including line endings and trailing whitespace, remains canonical Markdown and opens in raw mode. Structured rendering is deferred until the schema supports those constructs without loss.

Relative image sources import into the workspace blob store. URI, absolute, and fragment sources remain serializable image nodes but render as blocked placeholders without a `src` attribute. Import reports how many remote images were blocked.

Raw editor reconciliation accepts same-note canonical updates only while local input is clean. Dirty local source is never replaced by a history restore, acknowledgement, or external snapshot.

## Consequences

- Exported Markdown stays readable in other tools.
- Renames are reflected in later exports without changing stored reference identity.
- Duplicate titles require user disambiguation and cannot silently target the wrong note.
- Unsupported syntax remains editable as raw source but does not receive partial rich rendering.
- Opening imported Markdown cannot fetch remote images.
- Import uses a create phase followed by an image-attachment and document-save phase.
