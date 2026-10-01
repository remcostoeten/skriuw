# Skriuw

**A local-first notes app that never makes you wait.**

Skriuw is a desktop knowledge base built around one promise: every interaction gives same-frame feedback. No spinners, no sync dialogs, no "loading your notes". Your entire workspace lives on your machine, opens instantly, and stays yours: plain SQLite on disk, portable archives you can carry anywhere, and an asynchronous Git history that quietly versions everything you write.

## Tech stack

| Layer         | Technology                                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| Backend       | Rust: domain, storage, runtime, and history crates with no I/O in the domain layer |
| Storage       | SQLite as canonical storage, ordered SQL migrations, rebuildable FTS5 search index  |
| History       | Native Git materializer running fully off the editing path                          |
| Desktop shell | Tauri 2                                                                             |
| Renderer      | React 19 + TypeScript, Vite, Tailwind CSS 4                                         |
| Editor        | ProseMirror with a custom bounded-window architecture                               |
| Contracts     | JSON Schema generated from Rust domain types, drift-checked in CI                   |

The renderer navigates a fully hydrated in-memory workspace: switching notes performs zero IPC, zero database reads, zero parsing. The performance contract (cached note swap and keystroke-to-paint both under 8 ms at P95, zero dropped frames across hundreds of rapid switches) is enforced by a production benchmark suite, not aspiration.

## Writing

- **Rich text editor**: six heading levels, bullet, numbered, checklist, and collapsible lists (including toggles with a real heading as their summary, so they still feed the note outline), quotes, code, tables, alignment, underline, and restrained highlight colors with Markdown-style input rules, so `# `, `- `, and `**bold**` just work as you type. Code blocks expose language and copy controls; table actions add or remove rows and columns, toggle headers, or remove the table.
- **Tasks and checkboxes**: `[] ` creates a document-local checkbox. Start a bullet and then type `[] ` or `[ ] ` to create a workspace task linked to that checklist item; it remains ordinary portable Markdown outside Skriuw while the private marker preserves the link. Pasting a task, through either clipboard flavour, mints a new identity, so a copy is its own task rather than a second line claiming the original.
- **Lines and paragraphs**: Enter inside prose adds a line break to the current paragraph, so the note's Markdown gains one line per visible line instead of a blank-line-separated block. Enter again on the empty line, or `Shift`+Enter anywhere, starts a real paragraph. Lists, headings, code blocks, and tables keep their own Enter behavior.
- **Markdown paste**: paste raw Markdown and it lands rendered: headings, lists, checklists, tables, fenced code, quotes, and inline marks. Rich HTML from a web page still pastes as HTML, and raw Markdown mode keeps the source untouched.
- **Raw Markdown tools**: a CodeMirror source view with Markdown highlighting, optional line numbers that count every wrapped screen row (so a long paragraph is numbered 8, 9, 10 rather than one 8), an active-row band, word count, row and column position, jump-to-row, and selected word and character counts without broad renderer subscriptions.
- **Vim mode**: one setting (also `mod+alt+i` or “Toggle Vim mode” in the palette) makes both editors modal. The rendered editor gets a Vim layer built for the block document: normal, insert, visual, and visual-line modes, counts, operators with motions and text objects, `f`/`t` and `/` search, registers including the system clipboard, dot repeat, macros, and `:w`, `:q`, `:N`, `:noh`, and `:s`. The neutral Vim cursor can be a block, underline, or bar and can optionally blink in both editors. Both editors report completed actions such as line and character yanks, deletes, changes, puts, joins, and indentation in their Vim status area. The raw Markdown view runs CodeMirror’s Vim with the same `:` commands, where `:q` returns to the rendered editor; plain `j` and `k` move by wrapped screen rows there too. See [ADR-0042](adr/0042-modal-vim-editing.md).
- **Focus mode and typewriter scrolling**: `mod+shift+f` (or "Toggle focus mode" in the palette) hides the rail, sidebar, inspector, tab strip, and toolbar so only the note remains in its centred writing column; on a phone it also hides the bottom tab bar. The same keys or Escape bring the workspace back (with Vim on, Escape stays with Vim), opening a panel leaves focus mode with that panel shown, and moving the pointer to the top edge or tabbing there reveals an exit control. Each change is announced to screen readers, and focus mode is remembered on this device across restarts. An optional setting dims every block except the one holding the caret. Typewriter scrolling (`mod+shift+y`, or Editor settings) keeps the caret line vertically centred while typing or moving by keyboard in both the rendered and raw Markdown editors, Vim motions included, with at most one scroll adjustment per frame and no smooth scrolling when the system asks for reduced motion.
- **Slash commands**: type `/` for a keyboard-first block menu, and `:` for an emoji picker searchable by shortcode or keyword.
- **Typed note properties**: add, rename, reorder, and edit text, number, date, select, multi-select, person, URL, checkbox, rating, location, email, and phone fields from the metadata panel, or apply a built-in template.
- **Note templates**: `mod+alt+n` (or the palette and sidebar context menus) opens a keyboard-first picker of scaffolds: daily note, meeting notes, project, to-do list, weekly review, idea, and reading notes. Templates that map to a built-in property set (meeting, project, idea, reading) apply those fields in the same operation batch, so one Enter yields a dated, structured note with matching metadata.
- **Personal templates**: run “Save note as template” in the command palette. The source stays editable; copies include its properties, use its folder by default, and expand `{{date}}`. Remove a template from the picker without deleting its source. See [ADR-0038](adr/0038-personal-template-and-search-preferences.md).
- **Find and replace**: search within a note (`mod+f`), including content outside the visible window.
- **Links**: select text and press `mod+k` to link it or edit the link under the caret; `mod+click` or `mod+shift+enter` opens it. Links open in the system browser by default, or in Skriuw's own browser window (one shared window, like a tab) when "Open links in Skriuw" is on in Editor settings; the link menu always offers both.
- **Inline comments**: select text and press `mod+shift+m` to open a thread on it, then reply, edit, resolve, reopen, or delete from the popover. Hover an anchored word to preview its thread, or move the caret into it and press Tab to reply without leaving the keyboard. Threads may overlap and nest; `mod+alt+arrowdown` and `mod+alt+arrowup` step between them. The inspector lists every thread in the note with an Open/Resolved/All filter and flags threads whose original text was since deleted. Comment bodies never enter the document; the note carries only a portable `<mark>` anchor, so a reply costs no document save and export stays readable in other editors. See [ADR-0034](adr/0034-annotation-anchors-are-document-data.md).
- **Annotate over the note**: `mod+shift+a` (or "Annotate note" in the palette) puts a drawing surface over the whole editor pane, note and margins alike, with one floating toolbar as its only chrome. Pen and highlighter draw in document coordinates, so ink stays glued to the text it was drawn over as the note scrolls; the wheel sizes the brush and `ctrl`+wheel scrolls the note underneath. Right-click opens the ink picker (eight theme-aware presets on the digit keys, plus any hex color), and every tool carries a remappable shortcut its tooltip shows. Each stroke is one undo step, and the ink saves with the note through the ordinary document write, exporting as a `drawing` fence that survives a round-trip through other editors. Escape leaves and hands focus back to the text. See [ADR-0035](adr/0035-note-annotation-layer.md).
- **Handles huge notes**: notes with thousands of blocks render through a bounded 192-block editor window; select-all, copy, search, undo, and accessibility traversal still cover the whole document.
- **Images**: paste or drop an image and it appears inline, no dialog. Blobs are content-addressed files on disk (pasting the same image twice stores it once), never inflate the document itself, and round-trip through Markdown export/import with an `images/` directory, workspace archives, and scheduled recovery backups. Remote Markdown images stay as portable source but are blocked from loading; imports can instead download them once into the workspace after asking.
- **Note cover images**: pick one of twelve built-in gradients, choose any existing workspace asset, upload a new image, or paste an image address the desktop shell downloads once into the local store, then keep the cover aligned to the writing column or let it span the full editor pane without gutters. Drag or use arrow keys to pan, scroll or use `+`/`-` to zoom, or pick one of nine focal-point presets; transforms, covers, and layout reuse the local content-addressed image store and travel with workspace archives and recovery backups.
- **Workspace media gallery**: one filterable Settings gallery inventories every blob used inline, as a cover, or in the journal. Each asset shows format, dimensions, size, hash, attachment date, exact usage type, count, links back to every reference, a full-screen preview, an editable name and description, multi-select delete, and a one-click reveal in the file manager on desktop. The cover picker searches, filters, sorts, and marks current, used, and reused assets.
- **Video, audio, and file embeds**: `/video`, `/audio`, and `/file` drop a block that takes a URL, and MP4/WebM video files are first-class stored media: content-addressed on disk like images, visible in the media gallery, and carried by archives and backups. Embeds round-trip through Markdown as an ordinary link, so other editors still render something useful.
- **Embedded diagrams**: `/diagram` inserts a borderless, keyboard-accessible flowchart whose nodes can be renamed, connected, styled, arranged, and repositioned by pointer or keyboard. Mermaid-compatible `flowchart` fences round-trip through raw Markdown, while positions and canvas appearance stay durable in the local structured document. Unsupported Mermaid syntax remains editable source instead of being discarded. Sequence, state, class, and ER fences, and flowcharts the editable block cannot parse, render a themed read-only preview inside the code block with a Source/Preview toggle, an Expand view, and `/sequence`, `/state`, `/class`, `/er` templates; the fence stays the only stored form.
- **Math**: `/math` or a line holding only `$$` followed by Enter inserts a display math block whose TeX source sits above a live KaTeX preview while the caret is in it; `/inline` or `mod+alt+e` inserts inline math, or turns the selected text into it, and Enter or a click opens its TeX field. Arrow keys step into and out of both, Escape returns to the text, and TeX errors show as a quiet message instead of breaking the note. Rendered math exposes MathML to screen readers. Math exports as standard `$...$` and `$$` fenced Markdown; typing `$` still opens the people menu, and a lone `$name` never reads back as math. KaTeX loads on first use only. See [ADR-0053](adr/0053-math-blocks-and-the-dollar-trigger.md).
- **Tags, people, and note links**: type `#` to tag, `@` to link or create a note, and `$` for people. Relationships are stored by ID, so renames propagate everywhere and nothing silently breaks. Portable Markdown still imports and exports note links as `[[title]]`.
- **Relationship Explorer**: the metadata panel projects each note's local neighbourhood instantly: backlinks, outgoing links, shared tags and people, related journal days, session-local co-visits, and a bounded direct-relationship graph. Relationships remain ID-based renderer projections; no graph database or navigation-time I/O is involved. Unlinked mentions list other notes that name the note's title as plain text, with the match highlighted in a snippet; Enter opens the note at that spot, `L` or the Link button turns it into a note link by ID, and "Link all" links every listed mention in one undoable step. Matching is case-insensitive and whole-word and skips code, links, URLs, and existing note links ([rules](specs/note-links.md#unlinked-mentions)).

## Organizing

- **Nested workspace tree**: arbitrary depth, clamped indentation so deep trees stay readable, virtualized to stay smooth at 5,000+ nodes.
- **Locked notes and folders**: lock any note, or a folder and everything in it, behind one PIN or passphrase (context menu, palette, or `mod+shift+l`). Locked bodies are encrypted on disk with a key only your secret or a one-time recovery code can open, and they leave search, backlinks, tasks, and new history until unlocked. Unlock once per session; notes relock after a configurable idle time or when the window loses focus. Wrong attempts slow down instead of locking you out for good. See [ADR-0044](adr/0044-locked-notes.md).
- **Public links**: share a note as a read-only page at `skriuw.com/s/<id>/` from the palette or the note's context menu (`S`). Choose a frozen snapshot you update by hand or a link that follows your edits a few seconds after you stop typing. Shared text is stored on Skriuw's server without end-to-end encryption; images and drawings are left out, locked notes cannot be shared, and "Stop sharing" removes the page. Needs a Skriuw account, not sync. See [ADR-0052](adr/0052-public-note-links.md).
- **Pinned notes and folders**: pin any node to a fixed shelf at the top of the sidebar (context menu, palette, or `mod+p`). Pins are workspace content: they travel with archives, survive trash round trips, and order most-recently-pinned-first.
- **Tabs and split view**: open notes in tabs (`ctrl+tab` to cycle, `mod+w` to close) or a second pane side by side (`mod+\`). Closing prioritizes the split before the active tab, regardless of which pane has focus. Only visible panes hold live editors, so background tabs cost nothing; open tabs survive restarts. See [ADR-0021](adr/0021-tabs-and-split-view.md).
- **Full keyboard control**: create, rename, reorder siblings, move across folders, multi-select, open a row's context menu (Shift+Enter or the Menu key), expand/collapse-all, switch rail destinations with layout-independent number-row shortcuts, and use a dedicated move mode, all without touching the mouse.
- **Drag and drop**: pointer-based move and reorder in the sidebar.
- **Sidebar search**: filters the tree and reveals matches in place.
- **Full-text content search**: the command palette searches note bodies, not just titles. Matches come back ranked with a snippet whose matched words are highlighted, listed under “Content” below the title matches. Indexed text is the note’s prose: Markdown syntax, link targets, HTML, and drawing payloads are stripped, while link labels and the plain names behind `#tag`, `$person`, and `[[wikilink]]` chips stay searchable. Tokenization folds diacritics in both directions, so `cafe` finds `café` and `geerfde` finds `geërfde`. Queries are debounced and asynchronous, so typing never blocks navigation. See [ADR-0041](adr/0041-full-text-search-index.md).
- **Self-healing search index**: the index is a rebuildable projection written inside the same transaction as the save it describes. The workspace records the projection version it was built with; when that drifts, or when rows are lost to a partial write, the app rebuilds the index once on an idle callback after startup. Rebuilding is idempotent and survives restart.
- **Relationship search operators**: the sidebar and the command palette accept `#tag`, `$person`, `tag:name`, and `person:name` beside free text. Names may be quoted (`#"design system"`) and a backslash escapes a sigil, so `\#literal` still searches for the text. Stacked filters intersect; a filter with no free text lists everything it matches, ordered most recently updated first. Filtering runs against the in-memory reference projection, so trashed notes stay excluded and journal entries still open on their day. A name that matches nothing, or that two entities share, is stated in the results rather than silently resolved.
- **Saved searches**: save a sidebar query and reopen it from the sidebar. Title text and tag/person operators evaluate against current notes, so results stay live. Saved queries and template membership survive restart, backup, and preference reset; these preferences stay device-local for sync.
- **Durable layout**: folder expansion, panel state, and the active note survive restarts.
- **Trash with subtree semantics**: trash, restore, or permanently purge whole branches; nothing is destroyed without a confirmation that shows its scope. The trash view searches and sorts deleted items (recently deleted, deleted first, title) and arms per-row deletion inline instead of behind a dialog.

## Tasks

- **Workspace task view**: a `#/tasks` route listing every task in the workspace, grouped by due date: Overdue, Today, Upcoming, and No date. Completed tasks stay in the list, checked and struck through, in their date group; a completed task whose date has passed moves to a trailing "Completed earlier" group instead of counting as overdue. Each row names its source note, and work with no note to point at (quick-added, detached when its checklist line was deleted, or orphaned by a purged note) says so instead of disappearing.
- **Due dates**: a task's due date lives on its checklist line and is written to Markdown as the Obsidian Tasks signifier, `- [ ] Ship it 📅 2026-10-01`, so it survives export and other editors read it. In the editor, type `due:tomorrow`, `due:fri`, `due:2026-10-01`, or `due:next_friday` followed by a space on a checklist line to set it; the date shows as a chip that Enter or a click turns back into editable text and Delete clears. In the tasks view, press `D` on a row, or activate its date button, to pick a date; Enter saves, Escape cancels, and an empty date or Delete on the button clears it. See [ADR-0053](adr/0053-task-due-dates-live-in-the-checklist-line.md).
- **Completion is a paired write**: checking a task from the view submits the record and the rewritten source document in one operation, so the checklist item and the task never disagree and the change survives the note's next save. See [ADR-0031](adr/0031-explicit-task-promotion.md).
- **Refusal over guesswork**: a source note that is not loaded, a checklist item that no longer exists, or a duplicated link is reported in place rather than written over.
- **Jump to the source line**: a row navigates to its note and reveals the exact checklist item, by block identity rather than position, so it still lands correctly after the note above it is edited. Backspace returns.
- **Recurring tasks**: type `every:week`, `every:daily`, `every:weekday`, or `every:2_weeks` followed by a space on a checklist line to make it repeat. It is written to Markdown as the Obsidian Tasks signifier, `- [ ] Water plants 🔁 every week 📅 2026-10-01`. Completing it, in the editor or the tasks view, keeps the finished item checked and adds the next one below it with its due date moved forward; a linked task's next occurrence becomes a new task. The rule shows as a chip that Enter or a click turns back into editable text and Delete stops. See [ADR-0054](adr/0054-recurring-tasks-repeat-in-the-document.md).
- **Keyboard and screen reader**: real checkboxes named by their task, arrows to move between rows, Space to complete, Enter to open the source, `D` to set the due date, and `Shift`+arrow aliases for the first and last row. Date buttons announce the full date and whether it is overdue.

## Journal

- **Daily journal**: a dedicated `#/journal` route with one entry per calendar day, written in the exact same ProseMirror editor as notes: tags, people mentions, note links, slash commands, raw Markdown mode, and version history all work, and entities created in the journal are the same entities the notes workspace uses.
- **Mood per day**: a five-level mood selector (Great, Good, Neutral, Low, Rough) stored as a typed note property, so it travels with archives, exports, and backups.
- **Calendar everywhere**: a Monday-first month calendar with entry-dot indicators lives both in the journal's own sidebar and as a collapsible section at the bottom of the workspace sidebar; picking a day jumps straight to that entry.
- **Keyboard-first journaling**: `/` opens the sidebar search with the caret in the field, `t` jumps to today, and the bracket keys walk the journal: `[` and `]` step a day, with Shift a week, with Alt a month, and with Alt+Shift a year. `d` opens **Go to date…**, which accepts forgiving expressions such as `next week thursday`, `312`, `3/12`, `2-12-2025`, or `dec 2025`, previews the exact destination as you type, and offers suggestions while empty. Every journal key is rebindable in Settings with conflict warnings ([grammar and bindings](specs/journal-navigation.md)). Escape backs out of the search field, the Go to date dialog, and the delete confirmation. The month calendar keeps a single tab stop: arrows move a day or a week, Home and End span the week, PageUp/PageDown step a month, and Enter opens the focused day. Tabs, the mood radio group, and every entry row are reachable and announced.
- **Start from a template**: an empty day offers the built-in and personal note templates; the one you pick fills the entry, stamps it with that day's date, and is remembered, so the next empty day starts from it in a single press. Browsing days never applies a template, so unwritten days stay empty ([details](specs/journal-daily.md)).
- **Daily word goal**: off by default. Pick 250, 500, 750, or a custom number of words from the ring in the day header or under Settings, Editor, Journal. The header then shows a small progress ring with "312 / 500", the ring fills in when the day meets the goal, and screen readers hear a polite note only at halfway and at the goal. The journal calendar stretches a goal day's dot into a dash, and the Stats tab adds goal days and the current goal streak. A goal change applies from that day on, so earlier days keep the goal they had ([details](specs/journal-daily.md#word-goal)).
- **On this day**: under the entry, the journal recalls what you wrote a week ago, a month ago, and on the same date in earlier years, each with its mood and a short excerpt; a row opens that day.
- **Sidebar views**: calendar with a this-month entry list, lightweight stats (entries, words, streak, mood distribution), full-text entry search, and an all-entries timeline.
- **Same durable pipeline, hidden from the tree**: entries are workspace notes under a hidden journal folder keyed by a date property: saves, search indexing, Git history, trash, and archives all apply, while the workspace tree, note navigation, and the palette's notes list never show them. Palette full-text hits on journal content open the entry on its day in the journal.

## History and safety

- **Automatic Git history**: every save is materialized into Git in the background; editing and navigation never wait on it.
- **Live history panel**: a note's history updates in-session the moment materialization completes; versions open with a diff view (unified or side by side, remembered per workspace), and any prior version can be restored. A timeline scrubber under the preview steps through revisions by dragging its handle, arrow keys, or the scroll wheel; pinch (or ctrl+scroll) zooms the timeline for precise picks, and on phones it replaces the revision list.
- **Verified backups**: scheduled every six hours with cadence/retention rotation, each backup verified before it counts.
- **Recovery without fear**: restoring runs as a verified live database swap: the replacement is validated and bootstrapped before it goes live, and a rollback sibling is retained in case anything fails.
- **Portable workspace archives**: versioned JSON export/import of your entire workspace, with golden-fixture compatibility tests guaranteeing old archives keep importing.
- **Provider import with preview**: migrate local Markdown, plain text, Obsidian, Notion, Bear, Simplenote, and Apple Notes exports from folders, individual files, ZIPs, or `.bear2bk` backups. Preview format, destination, re-import behavior, counts, and warnings before one atomic workspace commit. Durable receipts support skip, update, and copy modes. Intake and image transfer show cancellable progress. Notion databases become notes with typed properties; provider timestamps, tags, links, and local images migrate when representable. Ambiguous or unsupported content remains exact source or appears in the report. See [the import guide](provider-import.md).
- **Markdown export/import**: take single notes or whole workspaces out as plain Markdown, or bring Markdown in. Wiki-link labels resolve to unique stable note IDs during import, exports refresh labels after renames, and ambiguous links remain source text. Frontmatter and footnotes remain exact raw source until the structured editor supports them.
- **Open Markdown files from the file manager**: the desktop app registers for `.md`, `.markdown` and `.mdx`. Double-clicking one, or passing it on the command line, imports it as a new root note and opens it, in the running window when Skriuw is already open. Opening the same path again returns the note it created. MDX is lowered to Markdown first: `import`/`export` statements and JSX comments are dropped and component tags are unwrapped so their Markdown content stays.
- **Copy folder structure**: right-click a folder → Copy structure to put it on the clipboard as JSON (nested folders and notes with their Markdown) or as a `tree`-style listing, either for all levels or capped at 1–3 levels deep. Folders cut off by the cap are marked `truncated` in JSON and with `…` in the tree.

## Desktop experience

- **Calm first-run choice**: a fresh install reveals its window only after the first real paint, opening on a seeded preview workspace you can type into immediately, with one keyboard-accessible choice: continue entirely locally with no account, or sign in and enable multi-device sync. An untouched preview is reclaimed at sign-in, existing workspaces are never interrupted, and sync remains available later from Account & sync.
- **End-to-end encrypted sync**: Account & sync can seal what this workspace uploads. A recovery code is shown once; it derives the workspace content key on this device and on any other device where you type it, and it is never sent anywhere. From then on the sync service stores note titles, bodies, tags, people, media, and whole workspace checkpoints as opaque bytes, keeping only what it needs to order and account for them: identifiers, sequences, sizes, and timing. A device without the key stops and says so instead of guessing, and never uploads its queued changes unencrypted; a wrong code is refused before anything is stored, the cloud accepts only one key per workspace, and altered, forged, or downgraded content fails with the reason rather than corrupting anything. Backups never contain the key, so a restored device asks for the code again. Losing the code loses the cloud copy only; the notes on your devices are untouched. See [ADR-0043](adr/0043-end-to-end-encrypted-sync.md).
- **Account avatar**: a signed-in account shows a [Facehash](https://www.facehash.dev/) face in the navigation rail and account menu, derived from the account id so it stays the same on every device and after a rename. It uses the theme's neutral tones only. Account & sync → Avatar turns it off to show your initials instead.
- **One desktop window per workspace**: launching Skriuw while it is already running brings the open window forward instead of starting a second process on the same workspace.
- **Command palette**: every action reachable from one keyboard surface.
- **Rebindable shortcuts**: the shortcut system is fully remappable from settings.
- **Zoom and fullscreen**: standard desktop chrome controls, plus quick-quit.
- **Quit shortcut**: Ctrl+Shift+Q by default. Settings can switch it off or rebind it to any two or three key chord that holds Ctrl or Cmd, such as Ctrl+Q or Ctrl+Shift+W. Quit always wins a collision: no other action can take its keys, and an action already on them stays unbound until one of the two is rebound.
- **Animated icons**: every icon is a Fluent Regular glyph shared by desktop and mobile; 28 of them play a short motion on hover (desktop) or press (mobile) and always settle back on the exact static glyph, with a settings toggle to keep them static. See [ADR-0049](adr/0049-shared-icon-system.md).
- **Settings with a Data & Recovery surface**: export, import, backup-now, restore, and a guarded clear-all-data reset are all in the UI; the CLI is optional, not required.
- **Storage you can see and move**: settings show every stored image with size and the notes that use it, open the database or blobs folder in the file manager, and can relocate the whole workspace (database, images, history, backups) to a new folder with a verified copy and automatic restart.
- **Auto-updates**: built-in updater on top of a tag-driven, cross-platform release pipeline.
- **Current install channels**: APT and dnf repositories, Homebrew, Scoop, and the AUR; macOS, Windows, and Linux release assets are available directly. Winget and Snap publication remain pending.

## AI

Every AI feature is off until you enable it, and nothing leaves the device without a disclosure naming the model that receives it.

- **Opt-in local AI runtime**: once AI is enabled, Skriuw detects an existing Ollama or installs its own checksum-verified copy on Linux and macOS. Model pulls show cancellable progress, and an external Ollama is never stopped or updated.
- **Prompt library**: the prompts behind every writing action live in Settings → AI. Edit a built-in to get your own copy with a one-click reset, or write new ones; your prompts sync, export, and undo like notes.
- **Prompt playground**: a full-screen surface that runs any prompt against any configured model (local Ollama, your own remote key, or an offline fake) and streams the result with cancel, retry, and copy. It never writes to notes.
- **AI writing actions**: **Ask AI** in the editor, selection toolbar, and palette opens one anchored menu to rewrite, fix, shorten, translate, or diagram a selection, or to continue, summarise, outline, title, or extract tasks and tags from the note. Results stream into a preview with visible progress and a **Stop** button; your note stays untouched until you accept, as one undoable edit. See [ADR-0036](adr/0036-ai-results-are-reviewed-in-place.md) and [ADR-0040](adr/0040-ai-runs-are-visible-work.md).
- **Voice dictation**: **AI: Dictate into note** records with a live level meter, transcribes with Groq Whisper or Gemini on your own key, and can tidy the result with your default model. Nothing is inserted until you choose, and the audio never leaves memory.
- **Local AI usage accounting**: Settings → AI → Usage shows runs, tokens, and estimated cost per model for this device, including cancelled and failed runs. The history stays local, prunes itself, and can skip storing prompt text entirely.

## Phone and tablet

- **Installable browser build**: the web build at `/app/` installs to a home screen with its own icon and the palette you chose, starts from disk when offline, and asks the browser for persistent storage so the workspace is not evicted; a denied request is said out loud while an export is still possible. The installed icon offers "New journal entry" and "New note" shortcuts, and the app appears in the system share sheet: shared text or a link becomes a new note with the page title as its heading. See [ADR-0040](adr/0040-installable-browser-shell.md).
- **Compact shell**: below 900px the rail becomes a bottom tab bar and the tree and inspector become edge sheets over the note, opened from the toolbar or a pull from either screen edge, closed by a tap outside, their own close control, Escape, a pull back toward the edge, or simply picking a note. The page behind a sheet is inert, the split view stacks, and everything is sized from the visual viewport so an open keyboard shrinks the shell instead of hiding it. See [ADR-0041](adr/0041-compact-shell-and-touch-gestures.md).
- **Touch gestures**: hold a note or folder for its menu (rename, pin, move, share, delete), pull it left to move it to trash with an undo, and scroll freely in between; rows, menu items, and tabs grow to 44px, and the platform vibration API ticks at each threshold where one exists.
- **Journal on a phone**: the day view tightens to the screen with the five moods on one touch-sized row, Previous and Next day buttons in the header, and a swipe across the heading to step a day; the calendar, search, and stats stay one pull away in the left sheet.
- **Back gesture and install**: on a phone the platform back gesture closes the sheet, dialog, or palette on top and otherwise leaves the app, tab bar taps never stack history, and the browser's install offer is available from a dismissible strip above the tab bar as well as the account menu, Data settings, and the storage warning. Settings fills the phone, every dialog stays above the keyboard and pulls down to close from its grabber or header, and toasts swipe away. See [ADR-0047](adr/0047-compact-shell-owns-back-and-install.md).
- **Formatting on a phone**: the text formatting popover docks at the bottom of the visual viewport as a sideways-scrolling bar above the keyboard, and the note menu offers the system share sheet for the note's Markdown wherever the Web Share API exists.

## Mobile app (iOS and Android)

A native client for the same workspace, built as an Expo application over the
same Rust core: `crates/skriuw-mobile` exposes the use cases over UniFFI, an
Expo native module wraps the bindings, and SQLite stays canonical and on the
device. Navigation, toolbar, tab bar, sheets and lists are React Native views
over the same store the desktop renderer uses; the editor is the desktop
ProseMirror surface itself, mounted once in a persistent webview that swaps
documents by message and is never remounted. See
[ADR-0048](adr/0048-native-mobile-shell-over-shared-core.md) and the
[mobile app contract](specs/mobile-app.md).

**It has not shipped.** No store build exists on either platform; iOS has never
been launched anywhere. What the matrix records is what is built, and what
evidence stands behind it.

| Capability | Desktop | Browser | Mobile |
| --- | :--: | :--: | :--: |
| Notes tree, folders, create, rename, move, delete with undo | ✓ | ✓ | ✓ |
| Pinned notes, note templates | ✓ | ✓ | ✓ |
| ProseMirror editor with full document fidelity | ✓ | ✓ | ✓ |
| Properties, covers, tags, people, note links, Mermaid fences | ✓ | ✓ | ✓ |
| Full-text search and saved searches | ✓ | ✓ | ✓¹ |
| Journal: daily entries, mood, calendar, quick capture | ✓ | ✓ | ✓ |
| Tasks view with explicit promotion | ✓ | ✓ | ✓ |
| Sign-in, E2EE sync, recovery, per-account workspaces | ✓ | ✓ | ✓ |
| Locked notes with PIN or passphrase | ✓ | ✓ | ✓ |
| Biometric unlock | ✗ | ✗ | ✓² |
| Share to Skriuw | ✗ | ✓ | Android only |
| Home-screen quick actions, system theme, safe areas | ✗ | ✓ | ✓ |
| Hardware back gesture | ✗ | ✓ | ✓ |
| All nine themes | ✓ | ✓ | ✓ |
| Git version history | ✓ | ✗ | ✗ |
| Local AI via Ollama | ✓ | ✗ | ✗ |
| Remote AI writing actions | ✓ | ✓ | ✗ |
| Provider import (Obsidian, Notion, Bear, …) | ✓ | ✓ | ✗ |
| Scheduled backups and archive swap | ✓ | ✗ | ✗ |
| Tabs and split view | ✓ | ✓ | ✗ |
| Vim mode | ✓ | ✓ | ✗ |
| Diagram builder and drawing | ✓ | ✓ | ✗ |
| Tablet layouts | ✗ | ✓ | ✗ |

¹ Built and reviewed, not yet on the default branch (PR #413).
² Implemented; the build needs `expo-secure-store` added as a dependency before
it can run.

Held against the contract, the mobile client's shared layer meets its
performance invariants (note navigation makes no bridge call and a keystroke
wakes no view outside the editor, at 1,000 and at 5,000 notes), while the
reference-device cold-start budget (R-P4) has not been measured on any phone.
Every control on every screen carries an accessible name, three accessibility
defects are open, and VoiceOver and TalkBack have not been run. The evidence,
including what is unverified and why, is in
[the release readiness](benchmarks/2026-09-20-mobile-release-readiness.md) and
[accessibility](benchmarks/2026-09-20-mobile-accessibility.md) records; store
metadata and the submission checklist are in
[`tools/packaging/mobile`](../tools/packaging/mobile).

## Built to be trusted

- 1,300+ tests across backend, desktop, renderer, store, and UI-architecture layers, plus a keyboard-driven end-to-end suite covering the complete workflow with zero tolerated console errors.
- Fifty-one architecture decision records in [docs/adr](adr) document why the system is shaped the way it is.
- Benchmark evidence for every performance claim lives in [docs/benchmarks](benchmarks).
