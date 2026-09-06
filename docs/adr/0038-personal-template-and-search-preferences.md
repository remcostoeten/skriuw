# ADR-0038: Personal template and saved-search preferences

- Status: accepted
- Date: 2026-09-06

## Decision

Personal note templates reference ordinary canonical notes. The workspace settings
extension `noteTemplateIds` records at most 200 source IDs; it never duplicates a
document or a property's data. Editing the source updates subsequent copies.
Trashed or purged sources are unavailable in the picker. Restoring a trashed
source makes it available again. Removing a template leaves its note intact.

Creating a personal-template note flushes pending edits and re-resolves the source
before planning the ordinary atomic create-note/property operation batch. Copies
receive fresh note, task, block, property, and option identities. Reference chips
and stored media continue to refer to shared workspace entities. Comment anchors
are omitted because comment threads belong to the source note. Text occurrences
of `{{date}}` expand to the current local calendar date. The source folder is the
default destination; a folder chosen through a contextual picker overrides it.

The `savedSearches` settings extension records at most 100 nonempty queries, each
at most 512 UTF-16 code units. Sidebar views reuse existing sidebar search
semantics: title text and relationship operators, with current renderer state
supplying live results. Saving a query does not snapshot its matches.

Both extensions use existing versioned settings persistence and validation. They
survive preference reset, restart, and workspace archive round trips. As with
other settings, these personal preferences are device-local for sync purposes;
template source notes still follow the ordinary note replication contract.

## Consequences

There is no new content store, migration, or replication operation family. The
picker reads its catalog only while open; the saved-search list subscribes only
to its own settings extension. Note navigation adds no storage or parsing work.
Template membership does not prevent source deletion. Users who want a stable
scaffold should keep a dedicated template note rather than register a working note.
