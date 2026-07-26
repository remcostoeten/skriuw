# Skriuw

**A local-first notes app that never makes you wait.**

Skriuw is a desktop knowledge base built around one promise: every interaction gives same-frame feedback. No spinners, no sync dialogs, no "loading your notes". Your entire workspace lives on your machine, opens instantly, and stays yours — plain SQLite on disk, portable archives you can carry anywhere, and an asynchronous Git history that quietly versions everything you write.

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Rust — domain, storage, runtime, and history crates with no I/O in the domain layer |
| Storage | SQLite as canonical storage, ordered SQL migrations, full-text search |
| History | Native Git materializer running fully off the editing path |
| Desktop shell | Tauri 2 |
| Renderer | React 19 + TypeScript, Vite, Tailwind CSS 4 |
| Editor | ProseMirror with a custom bounded-window architecture |
| Contracts | JSON Schema generated from Rust domain types, drift-checked in CI |

The renderer navigates a fully hydrated in-memory workspace: switching notes performs zero IPC, zero database reads, zero parsing. The performance contract — cached note swap and keystroke-to-paint both under 8 ms at P95, zero dropped frames across hundreds of rapid switches — is enforced by a production benchmark suite, not aspiration.

## Writing

- **Rich text editor** — headings, bullet, numbered, checklist, and collapsible lists, quotes, code, tables, alignment, underline, and restrained highlight colors with Markdown-style input rules, so `# `, `- `, and `**bold**` just work as you type. Code blocks expose language and copy controls; table actions add or remove rows and columns, toggle headers, or remove the table.
- **Markdown paste** — paste raw Markdown and it lands rendered: headings, lists, checklists, tables, fenced code, quotes, and inline marks. Rich HTML from a web page still pastes as HTML, and raw Markdown mode keeps the source untouched.
- **Raw Markdown tools** — optional line numbers, synchronized scrolling, word count, line and column position, and selected word and character counts without broad renderer subscriptions.
- **Slash commands** — type `/` for a keyboard-first block menu.
- **Typed note properties** — add, rename, reorder, and edit text, number, date, select, multi-select, person, URL, checkbox, rating, location, email, and phone fields from the metadata panel, or apply a built-in template.
- **Find and replace** — search within a note (`mod+f`), including content outside the visible window.
- **Handles huge notes** — notes with thousands of blocks render through a bounded 192-block editor window; select-all, copy, search, undo, and accessibility traversal still cover the whole document.
- **Images** — paste or drop an image and it appears inline, no dialog. Blobs are content-addressed files on disk (pasting the same image twice stores it once), never inflate the document itself, and round-trip through Markdown export/import with an `images/` directory, workspace archives, and scheduled recovery backups.
- **Tags, people, mentions, and wiki-links** — type `#` to tag, `@` or `[[` for wiki-style note links, `$` for people. Relationships are stored by ID, so renames propagate everywhere and nothing silently breaks.
- **Backlinks and entity pages** — every note, tag, and person shows what points to it, precomputed and instant.

## Organizing

- **Nested workspace tree** — arbitrary depth, clamped indentation so deep trees stay readable, virtualized to stay smooth at 5,000+ nodes.
- **Pinned notes and folders** — pin any node to a fixed shelf at the top of the sidebar (context menu, palette, or `mod+p`). Pins are workspace content: they travel with archives, survive trash round trips, and order most-recently-pinned-first.
- **Tabs and split view** — open notes in tabs (`ctrl+tab` to cycle, `mod+w` to close) or a second pane side by side (`mod+\`). Only visible panes hold live editors, so background tabs cost nothing; open tabs survive restarts. See [ADR-0021](docs/adr/0021-tabs-and-split-view.md).
- **Full keyboard control** — create, rename, reorder siblings, move across folders, multi-select, expand/collapse-all, and a dedicated move mode, all without touching the mouse.
- **Drag and drop** — pointer-based move and reorder in the sidebar.
- **Sidebar search** — filters the tree and reveals matches in place.
- **Durable layout** — folder expansion, panel state, and the active note survive restarts.
- **Trash with subtree semantics** — trash, restore, or permanently purge whole branches; nothing is destroyed without a confirmation that shows its scope.

## History and safety

- **Automatic Git history** — every save is materialized into Git in the background; editing and navigation never wait on it.
- **Live history panel** — a note's history updates in-session the moment materialization completes, and you can restore any prior version.
- **Verified backups** — scheduled every six hours with cadence/retention rotation, each backup verified before it counts.
- **Recovery without fear** — restoring runs as a verified live database swap: the replacement is validated and bootstrapped before it goes live, and a rollback sibling is retained in case anything fails.
- **Portable workspace archives** — versioned JSON export/import of your entire workspace, with golden-fixture compatibility tests guaranteeing old archives keep importing.
- **Markdown export/import** — take single notes or whole workspaces out as plain Markdown, or bring Markdown in. No lock-in.

## Desktop experience

- **Command palette** — every action reachable from one keyboard surface.
- **Rebindable shortcuts** — the shortcut system is fully remappable from settings.
- **Zoom and fullscreen** — standard desktop chrome controls, plus quick-quit.
- **Settings with a Data & Recovery surface** — export, import, backup-now, and restore are all in the UI; the CLI is optional, not required.
- **Storage you can see and move** — settings show every stored image with size and the notes that use it, open the database or blobs folder in the file manager, and can relocate the whole workspace (database, images, history, backups) to a new folder with a verified copy and automatic restart.
- **Auto-updates** — built-in updater on top of a tag-driven, cross-platform release pipeline.
- **Installs everywhere** — APT repo, Homebrew, Winget, Scoop, and the AUR.

## Built to be trusted

- 200+ tests across backend, desktop, renderer, store, and UI-architecture layers, plus a keyboard-driven end-to-end suite covering the complete workflow with zero tolerated console errors.
- Twenty architecture decision records in [docs/adr](docs/adr) document why the system is shaped the way it is.
- Benchmark evidence for every performance claim lives in [docs/benchmarks](docs/benchmarks).
