# ADR-0041: Full-text content search over a rebuildable FTS5 projection

- Status: accepted
- Date: 2026-09-09

## Context

Workspace search matched note titles from hydrated renderer state. Note bodies
were indexed into an FTS5 virtual table, but the table stored raw Markdown, its
ranking gave a title hit no advantage over an incidental body hit, no component
could tell whether the index still described the workspace, and nothing could
rebuild it. Full-text search is table stakes for a notes application and the
prerequisite for semantic search, so the index has to be a first-class,
verifiable projection rather than a side effect of saving.

## Decision

### The index is a rebuildable projection

`documents_fts` holds one row per document: the note identity (unindexed), the
title, and the projected body text. It is derived state — every row can be
recomputed from `documents` and `workspace_nodes` — and it is written inside the
same serialized, immediate transaction as the durable save, subtree trash,
rename, or archive import that caused it. It never participates in editing or
navigation reads beyond the search query itself.

`SEARCH_INDEX_VERSION` in `skriuw-domain` names the shape of the projected text.
The workspace records the version its index was built with under the `app_state`
key `search_index_version`. `SearchIndexMaintenance::search_index_status`
reports drift — a stale version, or an index row count that no longer matches
the document count — and `rebuild_search_index` discards and reprojects the
whole index in one transaction. Rebuilding is idempotent: running it twice
yields the same index and the same status.

Recording the projection version in `app_state` rather than in a schema
migration is deliberate. Changing the text projection is not a schema change:
the table shape is unchanged, existing rows still match, and only their quality
improves. A version bump therefore costs a background rebuild instead of a
destructive migration, and search keeps working throughout — the old rows stay
queryable until the new ones replace them. For the same reason the body column
keeps the name `markdown` it was given in migration 0001: FTS5 cannot rename a
column, and recreating the virtual table would empty the index at boot in
exchange for a better label.

Nothing rebuilds on the startup path. The renderer schedules one reconciliation
on an idle callback after the first paint; it reads the status and rebuilds only
on drift. A rebuild it starts is serialized behind the storage worker like any
other durable write, so it cannot block navigation, and the browser runtime
serves the same two commands through its worker protocol.

### Indexed text is prose, not Markdown

`skriuw_domain::index_text` projects a note's canonical Markdown to the text a
reader would search for. It is a pure function in the domain crate with no
storage, filesystem, or framework dependency, so the desktop adapter, the
browser worker, and the rebuild path all produce byte-identical rows.

- Headings, emphasis, list bullets, blockquote markers, table delimiters, and
  escapes are removed; the words survive.
- Link, image, and media labels survive; their targets do not. A note is no
  longer found by the UUID inside `images/9f3c-…`.
- `#design`, `$ada`, and `[[Roadmap]]` index as `design`, `ada`, and `Roadmap`,
  so chips are found by their plain names. A sigil that does not open a chip —
  `C#`, `US$` — is left alone. An aliased wikilink keeps both its target and its
  visible label.
- HTML tags and editor markers (`<!--skriuw-align:…-->`, `<!--skriuw-task:…-->`,
  highlight and annotation `<mark>`) are removed. A bare autolink is not markup
  and keeps its URL.
- Code fences keep their body: code is text people search for. Fences whose body
  is a serialized payload — `drawing`, `excalidraw` — are dropped entirely,
  because a scene is kilobytes of coordinates that match nothing a reader
  searches for while dominating both term statistics and snippets.

Removing markup matters less for matching than it looks, because `unicode61`
already treats punctuation as a separator. It matters for three things that are
not cosmetic: opaque payloads leave the index, identifiers in link targets stop
producing false hits, and the `snippet()` output reads as prose.

### Tokenization

The tokenizer is `unicode61 remove_diacritics 2`, chosen for Dutch and English
and unchanged from migration 0001.

`unicode61` classifies by Unicode category rather than ASCII, so Dutch text
tokenizes correctly and CJK or Cyrillic notes are at least tokenized on
punctuation and whitespace rather than dropped. `remove_diacritics 2` folds all
combining diacritics — not only the Latin-1 subset that mode `1` covers — in
both the indexed text and the query. A reader finds `geërfde` by typing
`geerfde` and `café` by typing `cafe`, in either direction, which is what a
Dutch or English keyboard layout demands. Its cost is that a language where an
accent distinguishes two words cannot separate them; no supported locale does.

Query terms are quoted and turned into prefix terms joined by `AND`, so typing
narrows results as the reader types, and a term containing a quote cannot escape
into FTS5 query syntax.

Ranking is `bm25(documents_fts, 0.0, 8.0, 1.0)`: the identity column contributes
nothing, a title match weighs eight body matches, and body matches still rank
against each other by term frequency. The palette also keeps title matches in a
separate group listed above content matches, so this weighting orders content
matches among themselves rather than deciding the whole list.

### Query surface

`WorkspaceStorage::search` and `search_filtered` return `SearchHit { noteId,
title, snippet, score }`, where the snippet delimits matched spans with
`<mark>`. `SearchIndexMaintenance` is a separate, narrow trait carrying only
`search_index_status` and `rebuild_search_index`. Both reach the renderer as
Tauri commands and as browser worker commands, and their result types are
generated contracts.

The renderer parses the snippet's delimiters into runs and renders matched runs
emphasized. Ranking still reads the plain text, so a highlight can never change
which rows appear.

Search stays off the navigation path in the renderer too: the palette debounces
input by 120 ms, discards out-of-order responses with a monotonic request
counter, and issues no query at all until the free text reaches its minimum
length.

## Consequences

Content search returns snippets from note bodies, ranked below title matches,
without a schema migration and without a startup cost on a current index.
Existing workspaces keep searching against their old rows until the idle
reconciliation replaces them.

Every future change to the projected text or the tokenizer must bump
`SEARCH_INDEX_VERSION` in the same commit, or workspaces will keep serving text
the build no longer produces. The tests in `crates/skriuw-domain/src/search.rs`
pin the projection and the tests in `crates/skriuw-sqlite/src/tests.rs` pin
tokenization, ranking, idempotent rebuild, and recovery of a lost index across
restart.

The index still stores note text in the clear inside the workspace database,
exactly like `documents` does; it adds no new exposure and no new encryption
boundary. Semantic search, when it lands, gets its own projection alongside this
one rather than overloading the FTS5 table.
