# Skriuw

**A local-first notes app that never makes you wait.**

Skriuw is a desktop knowledge base built around one promise: every interaction gives same-frame feedback. No spinners, no sync dialogs, no "loading your notes". Your entire workspace lives on your machine, opens instantly, and stays yours — plain SQLite on disk, portable archives you can carry anywhere, and an asynchronous Git history that quietly versions everything you write.

## Tech stack

| Layer         | Technology                                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| Backend       | Rust — domain, storage, runtime, and history crates with no I/O in the domain layer |
| Storage       | SQLite as canonical storage, ordered SQL migrations, full-text search               |
| History       | Native Git materializer running fully off the editing path                          |
| Desktop shell | Tauri 2                                                                             |
| Renderer      | React 19 + TypeScript, Vite, Tailwind CSS 4                                         |
| Editor        | ProseMirror with a custom bounded-window architecture                               |
| Contracts     | JSON Schema generated from Rust domain types, drift-checked in CI                   |

The renderer navigates a fully hydrated in-memory workspace: switching notes performs zero IPC, zero database reads, zero parsing. The performance contract — cached note swap and keystroke-to-paint both under 8 ms at P95, zero dropped frames across hundreds of rapid switches — is enforced by a production benchmark suite, not aspiration.

## Writing

- **Rich text editor** — six heading levels, bullet, numbered, checklist, and collapsible lists (including toggles with a real heading as their summary, so they still feed the note outline), quotes, code, tables, alignment, underline, and restrained highlight colors with Markdown-style input rules, so `# `, `- `, and `**bold**` just work as you type. Code blocks expose language and copy controls; table actions add or remove rows and columns, toggle headers, or remove the table.
- **Markdown paste** — paste raw Markdown and it lands rendered: headings, lists, checklists, tables, fenced code, quotes, and inline marks. Rich HTML from a web page still pastes as HTML, and raw Markdown mode keeps the source untouched.
- **Raw Markdown tools** — optional line numbers, synchronized scrolling, word count, line and column position, and selected word and character counts without broad renderer subscriptions.
- **Slash commands** — type `/` for a keyboard-first block menu, and `:` for an emoji picker searchable by shortcode or keyword.
- **Typed note properties** — add, rename, reorder, and edit text, number, date, select, multi-select, person, URL, checkbox, rating, location, email, and phone fields from the metadata panel, or apply a built-in template.
- **Note templates** — `mod+alt+n` (or the palette and sidebar context menus) opens a keyboard-first picker of scaffolds: daily note, meeting notes, project, to-do list, weekly review, idea, and reading notes. Templates that map to a built-in property set (meeting, project, idea, reading) apply those fields in the same operation batch, so one Enter yields a dated, structured note with matching metadata.
- **Find and replace** — search within a note (`mod+f`), including content outside the visible window.
- **Handles huge notes** — notes with thousands of blocks render through a bounded 192-block editor window; select-all, copy, search, undo, and accessibility traversal still cover the whole document.
- **Images** — paste or drop an image and it appears inline, no dialog. Blobs are content-addressed files on disk (pasting the same image twice stores it once), never inflate the document itself, and round-trip through Markdown export/import with an `images/` directory, workspace archives, and scheduled recovery backups. Remote Markdown images stay as portable source but are blocked from loading.
- **Note cover images** — choose any existing workspace asset or upload a new image above any note, then keep it aligned to the writing column or let it span the full editor pane without gutters. Drag or use arrow keys to pan, scroll or use `+`/`-` to zoom, or pick one of nine focal-point presets; transforms, covers, and layout reuse the local content-addressed image store and travel with workspace archives and recovery backups.
- **Workspace media gallery** — one filterable Settings gallery inventories every blob used inline, as a cover, or in the journal. Each asset shows format, dimensions, size, hash, attachment date, exact usage type, count, links back to every reference, and a full-screen preview. The cover picker searches, filters, sorts, and marks current, used, and reused assets.
- **Video, audio, and file embeds** — `/video`, `/audio`, and `/file` drop a block that takes a URL. Embeds round-trip through Markdown as an ordinary link, so other editors still render something useful.
- **Embedded diagrams** — `/diagram` inserts a borderless, keyboard-accessible flowchart whose nodes can be renamed, connected, styled, arranged, and repositioned by pointer or keyboard. Mermaid-compatible `flowchart` fences round-trip through raw Markdown, while positions and canvas appearance stay durable in the local structured document. Unsupported Mermaid syntax remains editable source instead of being discarded.
- **Tags, people, mentions, and wiki-links** — type `#` to tag, `@` or `[[` for wiki-style note links, `$` for people. Relationships are stored by ID, so renames propagate everywhere and nothing silently breaks.
- **Backlinks and entity pages** — every note, tag, and person shows what points to it, precomputed and instant.

## Organizing

- **Nested workspace tree** — arbitrary depth, clamped indentation so deep trees stay readable, virtualized to stay smooth at 5,000+ nodes.
- **Pinned notes and folders** — pin any node to a fixed shelf at the top of the sidebar (context menu, palette, or `mod+p`). Pins are workspace content: they travel with archives, survive trash round trips, and order most-recently-pinned-first.
- **Tabs and split view** — open notes in tabs (`ctrl+tab` to cycle, `mod+w` to close) or a second pane side by side (`mod+\`). Closing prioritizes the split before the active tab, regardless of which pane has focus. Only visible panes hold live editors, so background tabs cost nothing; open tabs survive restarts. See [ADR-0021](docs/adr/0021-tabs-and-split-view.md).
- **Full keyboard control** — create, rename, reorder siblings, move across folders, multi-select, expand/collapse-all, switch rail destinations with layout-independent number-row shortcuts, and use a dedicated move mode, all without touching the mouse.
- **Drag and drop** — pointer-based move and reorder in the sidebar.
- **Sidebar search** — filters the tree and reveals matches in place.
- **Durable layout** — folder expansion, panel state, and the active note survive restarts.
- **Trash with subtree semantics** — trash, restore, or permanently purge whole branches; nothing is destroyed without a confirmation that shows its scope. The trash view searches and sorts deleted items (recently deleted, deleted first, title) and arms per-row deletion inline instead of behind a dialog.

## Journal

- **Daily journal** — a dedicated `#/journal` route with one entry per calendar day, written in the exact same ProseMirror editor as notes: tags, people mentions, wiki-links, slash commands, raw Markdown mode, and version history all work, and entities created in the journal are the same entities the notes workspace uses.
- **Mood per day** — a five-level mood selector (Great, Good, Neutral, Low, Rough) stored as a typed note property, so it travels with archives, exports, and backups.
- **Calendar everywhere** — a Monday-first month calendar with entry-dot indicators lives both in the journal's own sidebar and as a collapsible section at the bottom of the workspace sidebar; picking a day jumps straight to that entry.
- **Keyboard-first journaling** — `/` opens the sidebar search with the caret in the field, `t` jumps to today, `[` and `]` walk to the previous and next day, and Escape backs out of the search field and the delete confirmation. The month calendar keeps a single tab stop: arrows move a day or a week, Home and End span the week, PageUp/PageDown step a month, and Enter opens the focused day. Tabs, the mood radio group, and every entry row are reachable and announced.
- **Sidebar views** — calendar with a this-month entry list, lightweight stats (entries, words, streak, mood distribution), full-text entry search, and an all-entries timeline.
- **Same durable pipeline, hidden from the tree** — entries are workspace notes under a hidden journal folder keyed by a date property: saves, search indexing, Git history, trash, and archives all apply, while the workspace tree, note navigation, and the palette's notes list never show them. Palette full-text hits on journal content open the entry on its day in the journal.

## History and safety

- **Automatic Git history** — every save is materialized into Git in the background; editing and navigation never wait on it.
- **Live history panel** — a note's history updates in-session the moment materialization completes, and you can restore any prior version.
- **Verified backups** — scheduled every six hours with cadence/retention rotation, each backup verified before it counts.
- **Recovery without fear** — restoring runs as a verified live database swap: the replacement is validated and bootstrapped before it goes live, and a rollback sibling is retained in case anything fails.
- **Portable workspace archives** — versioned JSON export/import of your entire workspace, with golden-fixture compatibility tests guaranteeing old archives keep importing.
- **Provider import with preview** — migrate local Markdown, plain text, Obsidian, Notion, Bear, Simplenote, and Apple Notes exports from folders, individual files, ZIPs, or `.bear2bk` backups. Preview format, destination, re-import behavior, counts, and warnings before one atomic workspace commit. Durable receipts support skip, update, and copy modes. Intake and image transfer show cancellable progress. Notion databases become notes with typed properties; provider timestamps, tags, links, and local images migrate when representable. Ambiguous or unsupported content remains exact source or appears in the report. See [the import guide](docs/provider-import.md).
- **Markdown export/import** — take single notes or whole workspaces out as plain Markdown, or bring Markdown in. Wiki-link labels resolve to unique stable note IDs during import, exports refresh labels after renames, and ambiguous links remain source text. Frontmatter and footnotes remain exact raw source until the structured editor supports them.

## Desktop experience

- **Calm first-run choice** — a fresh, empty workspace opens with one keyboard-accessible choice: continue entirely locally with no account, or sign in and enable multi-device sync. Existing workspaces are never interrupted, and sync remains available later from Account & sync.
- **Command palette** — every action reachable from one keyboard surface.
- **Rebindable shortcuts** — the shortcut system is fully remappable from settings.
- **Zoom and fullscreen** — standard desktop chrome controls, plus quick-quit.
- **Settings with a Data & Recovery surface** — export, import, backup-now, and restore are all in the UI; the CLI is optional, not required.
- **Storage you can see and move** — settings show every stored image with size and the notes that use it, open the database or blobs folder in the file manager, and can relocate the whole workspace (database, images, history, backups) to a new folder with a verified copy and automatic restart.
- **Auto-updates** — built-in updater on top of a tag-driven, cross-platform release pipeline.
- **Current install channels** — APT and dnf repositories, Homebrew, Scoop, and the AUR; macOS, Windows, and Linux release assets are available directly. Winget and Snap publication remain pending.

## Built to be trusted

- 200+ tests across backend, desktop, renderer, store, and UI-architecture layers, plus a keyboard-driven end-to-end suite covering the complete workflow with zero tolerated console errors.
- Twenty-five architecture decision records in [docs/adr](docs/adr) document why the system is shaped the way it is.
- Benchmark evidence for every performance claim lives in [docs/benchmarks](docs/benchmarks).
