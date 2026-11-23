# Skriuw

A local-first notes app for writing, journaling, and linking notes together.

Skriuw is a desktop knowledge base. Every interaction gets same-frame feedback, with no spinners or sync dialogs. The whole workspace lives on your machine as plain SQLite on disk. Portable archives export it, and an asynchronous Git history versions what you write.

## Writing

A rich text editor that saves plain Markdown, with a raw source view, Vim mode, comments, ink, and blocks for media, diagrams, and math.

- **Rich text editor**: six heading levels, bullet, numbered, checklist, and collapsible lists, quotes, code, tables, alignment, underline, and highlight colors.
  - Toggles can use a real heading as their summary, so they still feed the note outline.
  - Markdown-style input rules work as you type, such as `# `, `- `, and `**bold**`.
  - Code blocks expose language and copy controls.
  - Table actions add or remove rows and columns, toggle headers, or remove the table.
- **Tasks and checkboxes**: `[] ` creates a document-local checkbox. Start a bullet, then type `[] ` or `[ ] ` to create a workspace task linked to that checklist item. The task stays ordinary portable Markdown outside Skriuw, and a private marker preserves the link. Pasting a task, through either clipboard flavour, creates a new identity, so the copy is its own task and does not claim the original's line.
- **Lines and paragraphs**: Enter inside prose adds a line break to the current paragraph, so the note's Markdown gains one line per visible line instead of a blank-line-separated block. Enter again on the empty line, or `Shift`+Enter anywhere, starts a real paragraph. Lists, headings, code blocks, and tables keep their own Enter behavior.
- **Markdown paste**: pasted raw Markdown renders as headings, lists, checklists, tables, fenced code, quotes, and inline marks. Rich HTML from a web page still pastes as HTML. Raw Markdown mode keeps the source untouched.
- **Raw Markdown tools**: a CodeMirror source view with Markdown highlighting. It has these features, and none of them use broad renderer subscriptions:
  - Optional line numbers that count every wrapped screen row, so a long paragraph is numbered 8, 9, 10 rather than one 8.
  - An active-row band.
  - Word count, and row and column position.
  - Jump-to-row.
  - Selected word and character counts.
- **Vim mode**: one setting (also `mod+alt+i` or "Toggle Vim mode" in the palette) makes both editors modal. See [ADR-0042](adr/0042-modal-vim-editing.md).
  - The rendered editor gets a Vim layer built for the block document. It has normal, insert, visual, and visual-line modes, counts, operators with motions and text objects, `f`/`t` and `/` search, registers including the system clipboard, dot repeat, macros, and `:w`, `:q`, `:N`, `:noh`, and `:s`.
  - The neutral Vim cursor can be a block, underline, or bar, and can optionally blink in both editors.
  - Both editors report completed actions such as line and character yanks, deletes, changes, puts, joins, and indentation in their Vim status area.
  - The raw Markdown view runs CodeMirror's Vim with the same `:` commands. `:q` returns to the rendered editor, and plain `j` and `k` move by wrapped screen rows.
- **Focus mode and typewriter scrolling**: `mod+shift+f` (or "Toggle focus mode" in the palette) hides the rail, sidebar, inspector, tab strip, and toolbar, so only the note remains in its centred writing column. On a phone it also hides the bottom tab bar.
  - The same keys or Escape bring the workspace back. With Vim on, Escape stays with Vim.
  - Opening a panel leaves focus mode with that panel shown. Moving the pointer to the top edge, or tabbing there, reveals an exit control.
  - Each change is announced to screen readers. Focus mode is remembered on this device across restarts.
  - An optional setting dims every block except the one holding the caret.
  - Typewriter scrolling (`mod+shift+y`, or Editor settings) keeps the caret line vertically centred while typing or moving by keyboard in both the rendered and raw Markdown editors, Vim motions included. It makes at most one scroll adjustment per frame and does not smooth scroll when the system asks for reduced motion.
- **On-screen keyboard**: `mod+alt+k` (or "Toggle on-screen keyboard" in the command palette) docks a full-size keyboard (function row, navigation cluster, numpad) under the workspace that types into whichever editor you last focused, rendered or raw Markdown, through the same keystrokes a hardware keyboard sends, so editor shortcuts, input rules and Vim keep working. Shift, Control, Alt and Super latch for the next key; Caps Lock, Num Lock (off turns the numpad into Home, End, arrows, Insert, and Delete) and Scroll Lock stay on, with lit indicators. For people who cannot click precisely it offers dwell click, activation on release, and large key sizes. Every key is a labelled button, arrow keys move between keys, Escape returns to the editor, and each latch change is announced to screen readers. It is remembered on this device across restarts, and it is not offered on the phone-width layout.
- **Slash commands**: type `/` for a keyboard-first block menu. Type `:` for an emoji picker searchable by shortcode or keyword.
- **Typed note properties**: add, rename, reorder, and edit text, number, date, select, multi-select, person, URL, checkbox, rating, location, email, and phone fields from the metadata panel, or apply a built-in template.
- **Note templates**: `mod+alt+n` (or the palette and sidebar context menus) opens a keyboard-first picker of scaffolds: daily note, meeting notes, project, to-do list, weekly review, idea, and reading notes. Templates that map to a built-in property set (meeting, project, idea, reading) apply those fields in the same operation batch. One Enter creates a dated, structured note with matching metadata.
- **Personal templates**: run "Save note as template" in the command palette. The source stays editable. Copies include its properties, use its folder by default, and expand `{{date}}`. Removing a template from the picker does not delete its source. See [ADR-0038](adr/0038-personal-template-and-search-preferences.md).
- **Find and replace**: search within a note (`mod+f`), including content outside the visible window.
- **Links**: select text and press `mod+k` to link it or edit the link under the caret. You can also paste a URL over a selection.
  - Typing whitespace after a URL, or after a bare domain with a known top-level domain such as `skriuw.com/docs`, links it to its `https://` address. Trailing punctuation stays outside the link. Filenames such as `package.json` or `Node.js`, versions, emails, and code stay plain.
  - Bare domains keep their bare form in Markdown and link the same way on shared pages. `mod+click` or `mod+shift+enter` opens a link.
  - Links open in the system browser by default. When "Open links in Skriuw" is on in Editor settings, they open in Skriuw's own browser window (one shared window, like a tab). The link menu always offers both.
- **Inline comments**: select text and press `mod+shift+m` to open a thread on it. Reply, edit, resolve, reopen, or delete from the popover. See [ADR-0034](adr/0034-annotation-anchors-are-document-data.md).
  - Hover an anchored word to preview its thread, or move the caret into it and press Tab to reply without leaving the keyboard.
  - Threads may overlap and nest. `mod+alt+arrowdown` and `mod+alt+arrowup` step between them.
  - The inspector lists every thread in the note with an Open/Resolved/All filter, and flags threads whose original text was since deleted.
  - Comment bodies never enter the document. The note carries only a portable `<mark>` anchor, so a reply costs no document save and export stays readable in other editors.
- **Annotate over the note**: `mod+shift+a` (or "Annotate note" in the palette) puts a drawing surface over the whole editor pane, note and margins alike, with one floating toolbar as its only chrome. See [ADR-0035](adr/0035-note-annotation-layer.md).
  - Pen and highlighter draw in document coordinates, so ink stays attached to the text it was drawn over as the note scrolls. The wheel sizes the brush, and `ctrl`+wheel scrolls the note underneath.
  - Right-click opens the ink picker (eight theme-aware presets on the digit keys, plus any hex color). Every tool carries a remappable shortcut that its tooltip shows.
  - Each stroke is one undo step. The ink saves with the note through the ordinary document write, and exports as a `drawing` fence that survives a round-trip through other editors.
  - Escape leaves annotation mode and hands focus back to the text.
- **Handles huge notes**: notes with thousands of blocks render through a bounded 192-block editor window. Select-all, copy, search, undo, and accessibility traversal still cover the whole document.
- **Images**: paste or drop an image and it appears inline, with no dialog.
  - Blobs are content-addressed files on disk, so pasting the same image twice stores it once. They never inflate the document itself.
  - Images round-trip through Markdown export/import with an `images/` directory, workspace archives, and scheduled recovery backups.
  - Remote Markdown images stay as portable source but are blocked from loading. Imports can instead download them once into the workspace after asking.
- **Note cover images**: pick one of twelve built-in gradients, choose any existing workspace asset, upload a new image, or paste an image address that the desktop shell downloads once into the local store. You can keep the cover aligned to the writing column or let it span the full editor pane without gutters. Drag or use arrow keys to pan, scroll or use `+`/`-` to zoom, or pick one of nine focal-point presets. Transforms, covers, and layout reuse the local content-addressed image store and travel with workspace archives and recovery backups.
- **Workspace media gallery**: one filterable Settings gallery inventories every blob used inline, as a cover, or in the journal. Each asset shows its format, dimensions, size, hash, attachment date, exact usage type, and count, with links back to every reference. You can open a full-screen preview, edit a name and description, multi-select to delete, and reveal the file in the file manager on desktop with one click. The cover picker searches, filters, sorts, and marks current, used, and reused assets.
- **Video, audio, and file embeds**: `/video`, `/audio`, and `/file` insert a block that takes a URL. MP4/WebM video files are stored media: content-addressed on disk like images, visible in the media gallery, and carried by archives and backups. Embeds round-trip through Markdown as an ordinary link, so other editors still show a link.
- **Embedded diagrams**: `/diagram` inserts a borderless, keyboard-accessible flowchart whose nodes can be renamed, connected, styled, arranged, and repositioned by pointer or keyboard.
  - Mermaid-compatible `flowchart` fences round-trip through raw Markdown. Positions and canvas appearance stay durable in the local structured document.
  - Unsupported Mermaid syntax remains editable source instead of being discarded.
  - Sequence, state, class, and ER fences, and flowcharts the editable block cannot parse, render a themed read-only preview inside the code block. The preview has a Source/Preview toggle and an Expand view, and `/sequence`, `/state`, `/class`, `/er` insert templates. The fence stays the only stored form.
- **Excalidraw drawings**: `/excalidraw` inserts a drawing block for shapes, arrows, freehand lines, text and images, edited in a full-window Excalidraw editor and shown in the note as a themed preview. `/import` (Import Excalidraw file), or dropping a `.excalidraw` file on a note, brings in an official Excalidraw file or a PNG or SVG exported with the scene embedded; Save writes an official `.excalidraw` file that excalidraw.com opens unchanged. The drawing is stored in the note and round-trips through Markdown as an `excalidraw` fence. See [Excalidraw drawings](specs/excalidraw-drawings.md).
- **Math**: `/math` or a line holding only `$$` followed by Enter inserts a display math block. Its TeX source sits above a live KaTeX preview while the caret is in it. `/inline` or `mod+alt+e` inserts inline math, or turns the selected text into it, and Enter or a click opens its TeX field. See [ADR-0053](adr/0053-math-blocks-and-the-dollar-trigger.md).
  - Arrow keys step into and out of both kinds. Escape returns to the text. TeX errors show as a short message instead of breaking the note. Rendered math exposes MathML to screen readers.
  - Math exports as standard `$...$` and `$$` fenced Markdown. Typing `$` still opens the people menu, and a lone `$name` never reads back as math. Pasted `\(...\)`, `\[...\]`, and dollar math become math nodes, while escaped delimiters and code remain literal.
  - Editor settings accept workspace macros with arguments and validate definitions before saving. Changes refresh existing previews and sync with the workspace. Markdown exports preserve macro commands, so other editors need the same definitions.
  - Chemistry commands `\ce{}` and `\pu{}` use bundled mhchem. KaTeX and mhchem load on first use only.
- **Tags, people, and note links**: type `#` to tag, `@` to link or create a note, and `$` for people. Relationships are stored by ID, so a rename updates every reference. Portable Markdown still imports and exports note links as `[[title]]`.
- **Inspector layout**: the right-hand metadata panel is one scrolling column of sections: Outline, Comments, Revisions, Relationships, and Details. A sticky strip of icons with counts jumps to a section and follows the scroll; sections the note has nothing for (an outline with one heading, no comments, no relationships) leave the strip. Under it a live line shows the word count and read time. `mod+3` focuses the panel, `1` to `5` jump to a section, Up and Down walk every header and row, and Escape returns to the note. Revisions show five and fold open in place with the word change as a signed number; `C` copies and `R` restores the focused revision. Comments filter Open, Resolved, or All with counts, and `R` resolves or reopens the focused thread.
- **Relationship Explorer**: the metadata panel shows each note's local neighbourhood from the in-memory workspace: backlinks, outgoing links, shared tags and people, related journal days, session-local co-visits, and a bounded direct-relationship graph. Relationships remain ID-based renderer projections. No graph database or navigation-time I/O is involved.
  - Unlinked mentions list other notes that name the note's title as plain text, with the match highlighted in a snippet.
  - Enter opens the note at that spot. `L` or the Link button turns the mention into a note link by ID. "Link all" links every listed mention in one undoable step.
  - Matching is case-insensitive and whole-word. It skips code, links, URLs, and existing note links ([rules](specs/note-links.md#unlinked-mentions)).

## Organizing

A nested tree of notes and folders, with tabs, split view, search, pins, locks, public links, and a trash.

- **Nested workspace tree**: arbitrary depth, with clamped indentation so deep trees stay readable. The tree is virtualized, and the [performance contract](performance-contract.md) benchmarks 1,000-note and 5,000-note workspaces.
- **Locked notes and folders**: lock any note, or a folder and everything in it, behind one PIN or passphrase (context menu, palette, or `mod+shift+l`). See [ADR-0044](adr/0044-locked-notes.md).
  - Locked bodies are encrypted on disk with a key that only your secret or a one-time recovery code can open. They leave search, backlinks, tasks, and new history until unlocked.
  - Locking a note closes it right away, along with every other locked note.
  - Unlock once per session. Notes relock after a configurable idle time or when the window loses focus.
  - Wrong attempts slow down instead of locking you out for good.
- **Public links**: share a note as a read-only page at `skriuw.com/s/<id>/` from the palette or the note's context menu (`S`). Choose a frozen snapshot you update by hand, or a link that follows your edits a few seconds after you stop typing. It needs a Skriuw account, not sync. See [ADR-0052](adr/0052-public-note-links.md).
  - Shared text and images are stored on Skriuw's server without end-to-end encryption.
  - PNG, JPEG, GIF, and WebP images up to 4 MB each (20 images, 12 MB per note) are published with the note. Drawings, videos, and larger images are left out.
  - Locked notes cannot be shared. "Stop sharing", or moving the note (or its folder) to the trash, removes the page and its images. Restoring a note from the trash does not share it again.
  - Every heading on the page has a linkable anchor, and notes with three or more sections get a table of contents.
- **Pinned notes and folders**: pin any node to a fixed shelf at the top of the sidebar (context menu, palette, or `mod+p`). Pins are workspace content. They travel with archives, survive trash round trips, and order most-recently-pinned-first.
- **Tabs and split view**: open notes in tabs (`ctrl+tab` to cycle, `mod+w` to close) or in a second pane side by side (`mod+\`). Closing prioritizes the split before the active tab, regardless of which pane has focus. Only visible panes hold live editors, so background tabs hold none. Open tabs survive restarts. See [ADR-0021](adr/0021-tabs-and-split-view.md).
- **Full keyboard control**: everything in the tree works without the mouse.
  - Create, rename, and reorder siblings.
  - Move across folders and multi-select.
  - Open a row's context menu (Shift+Enter or the Menu key).
  - Expand or collapse all.
  - Switch rail destinations with layout-independent number-row shortcuts.
  - Use a dedicated move mode.
- **Drag and drop**: pointer-based move and reorder in the sidebar.
- **Sidebar search**: filters the tree and reveals matches in place.
- **Full-text content search**: the command palette searches note bodies as well as titles. Matches come back ranked with a snippet whose matched words are highlighted, listed under "Content" below the title matches. See [ADR-0041](adr/0041-full-text-search-index.md).
  - Indexed text is the note's prose. Markdown syntax, link targets, HTML, and drawing payloads are stripped. Link labels and the plain names behind `#tag`, `$person`, and `[[wikilink]]` chips stay searchable.
  - Tokenization folds diacritics in both directions, so `cafe` finds `café` and `geerfde` finds `geërfde`.
  - Queries are debounced and asynchronous, so typing does not block navigation.
- **Search index rebuild**: the index is a rebuildable projection written inside the same transaction as the save it describes. The workspace records the projection version it was built with. When that version drifts, or when rows are lost to a partial write, the app rebuilds the index once on an idle callback after startup. Rebuilding is idempotent and survives restart.
- **Relationship search operators**: the sidebar and the command palette accept `#tag`, `$person`, `tag:name`, and `person:name` beside free text.
  - Names may be quoted (`#"design system"`). A backslash escapes a sigil, so `\#literal` still searches for the text.
  - Stacked filters intersect. A filter with no free text lists everything it matches, ordered most recently updated first.
  - Filtering runs against the in-memory reference projection, so trashed notes stay excluded and journal entries still open on their day.
  - A name that matches nothing, or that two entities share, is stated in the results instead of silently resolved.
- **Saved searches**: save a sidebar query and reopen it from the sidebar. Title text and tag/person operators evaluate against current notes, so results stay live. Saved queries and template membership survive restart, backup, and preference reset. These preferences stay device-local for sync.
- **Database views**: open a folder, or every note, as a table or a board over the notes' properties (folder context menu `O`, or the palette). See [ADR-0057](adr/0057-database-views.md), [ADR-0058](adr/0058-database-board-blocks.md) and [ADR-0065](adr/0065-database-layouts-sync.md).
  - Edit cells in place with the keyboard or mouse. Filter, sort, hide and reorder columns, search names, and group a board by a select or checkbox property.
  - Dragging a card, or Alt with an arrow key, moves it to another group. New notes made in a view start with the properties of the group and filters they were made under.
  - Layouts are saved per folder and sync to your other devices, so a board set up on one opens as a board on all of them. A folder's board can also sit inside a note as a fenced `database` block.
- **Durable layout**: folder expansion, panel state, and the active note survive restarts.
- **Trash with subtree semantics**: trash, restore, or permanently purge whole branches. Nothing is destroyed without a confirmation that shows its scope. The trash view groups deleted items by how long ago they were deleted, searches and sorts them (recently deleted, deleted first, title), and arms per-row deletion inline instead of behind a dialog. Arrow keys move between rows, `R` restores and `Delete` or `Backspace` arms permanent deletion.
- **Empty note cleanup**: run "Clean up empty notes" in the command palette, or in Settings → Data & recovery. It moves every note with no body beyond its title to the trash, with a single undo. It never touches pinned, locked, journal, decorated, property-bearing, commented, and parent notes.

## Tasks

Checklist items in any note can become tasks with due dates and repeats, gathered in one view and written back to the note.

- **Workspace task view**: a `#/tasks` route listing every task in the workspace as a ledger: each group's title, count, and tools sit in a sticky margin beside its rows. A sidebar filters tasks by title, note, folder, repeat rule, tag, or notes (`/` focuses it, Escape clears it) and switches between two groupings, each with an outline of its groups that follows the scroll. **By due date**: Overdue, Today, Upcoming, No date, and Completed. Overdue offers "Move all to today", Today shows a progress meter and keeps work completed today in place, struck through, Upcoming shows the next seven days with a dot per task (a day highlights its rows), and Completed shows the three most recently changed with "Show all". **By note**: one group per source note, ordered by its earliest due date, then Detached, then Completed. The header counts open, overdue, and completed-today work. Each row names its source note and repeat rule, and says when it is in progress, high or urgent, has subtasks, notes, or tags; work with no note to point at (detached when its checklist line was deleted, or orphaned by a purged note) says so instead of disappearing.
- **Completing and undo**: completing a task strikes it through in place; outside Today it folds into Completed about a second later. Completions, date changes, and "Move all to today" offer Undo in a toast and with `Ctrl`+`Z`.
- **Task details**: click a row or press Enter to open a sheet beside the list (over it on narrow windows). Up and Down keep moving through the list while it follows, Right focuses the title, `O` opens the source note, and Escape closes it and returns to the row. Its title is written back to the checklist line; a line with links or formatting is left alone and says so. It sets status (to do, in progress, done), due date, repeat rule, priority, and tags from the workspace's existing tags, keeps notes on the task record rather than in the note, lists and adds subtasks (the checklist items nested under the line), and shows the line in its note with its neighbours and line number.
- **Due dates**: a task's due date lives on its checklist line and is written to Markdown as the Obsidian Tasks signifier, `- [ ] Ship it 📅 2026-10-01`, so it survives export and other editors read it. In the editor, type `due:tomorrow`, `due:fri`, `due:2026-10-01`, or `due:next_friday` followed by a space on a checklist line to set it; the date shows as a chip that Enter or a click turns back into editable text and Delete clears. In the tasks view, press `D` on a row or in the detail sheet, or activate a date button, to open a small popover that reads `today`, `tom`, `fri`, `+3`, `+2w`, `next week` (next Monday), `weekend`, `20 nov`, or an ISO date, previews the result, and offers Today, Tomorrow, This weekend, and Next week; Enter saves, Escape cancels, and Delete clears. The same words work after `due:` in the editor. A day and month more than a month in the past means next year's. See [ADR-0053](adr/0053-task-due-dates-live-in-the-checklist-line.md).
- **Completion is a paired write**: checking a task from the view submits the record and the rewritten source document in one operation, so the checklist item and the task never disagree and the change survives the note's next save. See [ADR-0031](adr/0031-explicit-task-promotion.md).
- **Refusal over guesswork**: a source note that is not loaded, a checklist item that no longer exists, or a duplicated link is reported in place rather than written over.
- **Jump to the source line**: a row navigates to its note and reveals the exact checklist item, by block identity rather than position, so it still lands correctly after the note above it is edited. Backspace returns.
- **Recurring tasks**: type `every:week`, `every:daily`, `every:weekday`, or `every:2_weeks` followed by a space on a checklist line to make it repeat. It is written to Markdown as the Obsidian Tasks signifier, `- [ ] Water plants 🔁 every week 📅 2026-10-01`. Completing it, in the editor or the tasks view, keeps the finished item checked and adds the next one below it with its due date moved forward; a linked task's next occurrence becomes a new task. The rule shows as a chip that Enter or a click turns back into editable text and Delete stops. See [ADR-0054](adr/0054-recurring-tasks-repeat-in-the-document.md).
- **Keyboard and screen reader**: real checkboxes named by their task, Up and Down to move between rows and `Shift` with Up or Down for the first and last row (there is no Home or End binding), Space to complete, Enter for details, `D` for the due date, `O` to open the source, `G` to switch the grouping, and `/` to filter. Date buttons announce the full date and whether it is overdue.

## Journal

One entry per day, written in the same editor as notes, with a mood, a calendar, templates, and an optional word goal.

- **Journal ledger page**: the journal is one page of groups around the entry. The entry keeps a single writing column; Mood, Word goal, On this day and Tags follow it, then History with Totals, a 30 day Mood trend and the Entries list by month. The sidebar holds search, the calendar and an outline with two views, This day and History, that expand into the groups on screen and follow scrolling ([details](specs/journal-daily.md#page-layout)).
- **Daily journal**: a dedicated `#/journal` route holds one entry per calendar day, written in the same ProseMirror editor as notes. Tags, people mentions, note links, slash commands, raw Markdown mode, and version history all work. Entities created in the journal are the same entities the notes workspace uses.
- **Mood per day**: a five-level mood selector (Great, Good, Neutral, Low, Rough) is stored as a typed note property, so it travels with archives, exports, and backups.
- **Calendar**: a Monday-first month calendar with entry-dot indicators appears in the journal's own sidebar and as a collapsible section at the bottom of the workspace sidebar. Picking a day opens that entry.
- **Keyboard-first journaling**: the journal has these keys.
  - `/` opens the sidebar search with the caret in the field.
  - `t` jumps to today.
  - `[` and `]` step a day, with Shift a week, with Alt a month, and with Alt+Shift a year.
  - `d` opens **Go to date…**, which accepts flexible expressions such as `next week thursday`, `312`, `3/12`, `2-12-2025`, or `dec 2025`. It previews the exact destination as you type and offers suggestions while empty.
  - Every journal key is rebindable in Settings with conflict warnings ([grammar and bindings](specs/journal-navigation.md)).
  - Escape backs out of the search field, the Go to date dialog, and the delete confirmation.
  - The month calendar keeps a single tab stop. Arrows move a day or a week, Home and End span the week, PageUp/PageDown step a month, and Enter opens the focused day.
  - Tabs, the mood radio group, and every entry row are reachable and announced.
- **Start from a template**: an empty day offers the built-in and personal note templates. The one you pick fills the entry, stamps it with that day's date, and is remembered, so the next empty day starts from it in a single press. Browsing days never applies a template, so unwritten days stay empty ([details](specs/journal-daily.md)).
- **Automatic journal titles**: off by default, under Settings, AI, Automation. When on, the default model names journal entries that have no title yet, one at a time in the background, newest first. Only past days with at least twenty words are sent; locked entries never are, and an entry you titled yourself is never changed. Each request shows up in AI history, and a failure pauses the work with a notice instead of retrying. See [ADR-0063](adr/0063-opt-in-automatic-journal-titles.md).
- **Daily word goal**: off by default. Pick 250, 500, 750, or a custom number of words from the Word goal row on the journal page or under Settings, Editor, Journal ([details](specs/journal-daily.md#word-goal)).
  - The row then shows a progress ring with "312 / 500", and the margin shows a progress meter. The ring fills in when the day meets the goal.
  - Screen readers hear a polite note only at halfway and at the goal.
  - The journal calendar shows a goal day's dot as a dash, and the Word goal and Totals groups add goal days and the current goal streak.
  - A goal change applies from that day on, so earlier days keep the goal they had.
- **On this day**: below the mood and word goal, the journal lists what you wrote a week ago, a month ago, and on the same date in earlier years, each with its mood and a short excerpt. A row opens that day.
- **Sidebar views**: the journal sidebar has four views.
  - A calendar with a this-month entry list.
  - Stats: entries, words, streak, and mood distribution.
  - Full-text entry search.
  - An all-entries timeline.
- **Journal storage**: entries are workspace notes under a hidden journal folder keyed by a date property. Saves, search indexing, Git history, trash, and archives all apply. The workspace tree, note navigation, and the palette's notes list never show them. Palette full-text hits on journal content open the entry on its day in the journal.

## History and safety

Every save goes into a Git history in the background. Backups are verified, and the whole workspace imports and exports as Markdown or an archive.

- **Automatic Git history**: every save is materialized into Git in the background. Editing and navigation never wait on it.
- **Live history panel**: a note's history updates in-session when materialization completes.
  - Versions open with a diff view (unified or side by side, remembered per workspace), and any prior version can be restored.
  - A timeline scrubber under the preview steps through revisions by dragging its handle, arrow keys, or the scroll wheel. Pinch (or ctrl+scroll) zooms the timeline for precise picks. On phones it replaces the revision list.
- **Verified backups**: backups are scheduled every six hours with cadence/retention rotation. Each backup is verified before it counts.
- **Restore**: restoring runs as a verified live database swap. The replacement is validated and bootstrapped before it goes live, and a rollback sibling is retained in case anything fails.
- **Portable workspace archives**: versioned JSON export/import of your entire workspace. Golden-fixture compatibility tests check that old archives keep importing.
- **Provider import with preview**: migrate local Markdown, plain text, Obsidian, Notion, Bear, Simplenote, Apple Notes, and Skriuw v1 exports from folders, individual files, ZIPs, or `.bear2bk` backups. See [the import guide](provider-import.md).
  - Preview format, destination, re-import behavior, counts, and warnings before one atomic workspace commit.
  - Durable receipts support skip, update, and copy modes.
  - Intake and image transfer show cancellable progress.
  - Notion databases become notes with typed properties, and Skriuw v1 journal days land in the journal on their date. Provider timestamps, tags, links, and local images migrate when representable. Ambiguous or unsupported content remains exact source or appears in the report.
- **Markdown export/import**: take single notes or whole workspaces out as plain Markdown, or bring Markdown in.
  - Wiki-link labels resolve to unique stable note IDs during import. Exports refresh labels after renames. Ambiguous links remain source text.
  - Frontmatter and footnotes remain exact raw source until the structured editor supports them.
- **Open files from the file manager**: the desktop app registers for `.md`, `.markdown`, `.mdx` and `.txt`. Double-clicking one, or passing it on the command line, imports it as a new root note and opens it, in the running window when Skriuw is already open.
  - The title comes from a frontmatter `title:`, then a leading `# heading` (removed from the body), then the file name. The note keeps the file's created and modified dates.
  - Opening the file again returns the same note and brings it up to date. When only the file changed, the note body is replaced. When only the note changed, it is kept. When both changed, Skriuw opens the note and asks whether to keep the note, use the file, or keep both. A moved file is recognised by its contents.
  - MDX converts without loss. `import`/`export` statements and component tags with their props become `mdx` code blocks, component children stay Markdown, and inline tags and `{expressions}` become inline code.
  - File types are listed once in `apps/workspace/src/features/transfer/file-formats.ts`, mirrored by `OPENABLE_EXTENSIONS` and the `tauri.conf.json` file associations, with tests keeping the three in step.
- **Copy folder structure**: right-click a folder → Copy structure to put it on the clipboard as JSON (nested folders and notes with their Markdown) or as a `tree`-style listing, for all levels or capped at 1-3 levels deep. Folders cut off by the cap are marked `truncated` in JSON and with `…` in the tree.

## Desktop experience

The desktop app around the editor: first run, encrypted sync, the command palette, shortcuts, settings, storage, and updates.

- **First-run choice**: a fresh install reveals its window only after the first real paint, on a seeded preview workspace you can type into immediately.
  - One keyboard-accessible choice: continue entirely locally with no account, or sign in and enable multi-device sync.
  - An untouched preview is reclaimed at sign-in. Existing workspaces are never interrupted.
  - Sync remains available later from Account & sync.
- **End-to-end encrypted sync**: Account & sync can seal what this workspace uploads. See [ADR-0043](adr/0043-end-to-end-encrypted-sync.md).
  - A recovery code is shown once. It derives the workspace content key on this device and on any other device where you type it, and it is never sent anywhere.
  - From then on the sync service stores note titles, bodies, tags, people, media, and whole workspace checkpoints as opaque bytes. It keeps only what it needs to order and account for them: identifiers, sequences, sizes, and timing.
  - A device without the key stops and says so instead of guessing. It never uploads its queued changes unencrypted.
  - A wrong code is refused before anything is stored, and the cloud accepts only one key per workspace. Altered, forged, or downgraded content fails with the reason instead of corrupting anything.
  - Backups never contain the key, so a restored device asks for the code again.
  - Losing the code loses the cloud copy only. The notes on your devices are untouched.
- **Account avatar**: a signed-in account shows a [Facehash](https://www.facehash.dev/) face in the navigation rail and account menu, derived from the account id so it stays the same on every device and after a rename. It uses the theme's neutral tones only. Account & sync → Avatar turns it off to show your initials instead.
- **One desktop window per workspace**: launching Skriuw while it is already running brings the open window forward instead of starting a second process on the same workspace.
- **Command palette**: every action is reachable from one keyboard surface.
- **Rebindable shortcuts**: the shortcut system is remappable from settings.
- **Zoom and fullscreen**: standard desktop chrome controls, plus a quit shortcut.
- **Quit shortcut**: Ctrl+Shift+Q by default. Settings can switch it off or rebind it to any two or three key chord that holds Ctrl or Cmd, such as Ctrl+Q or Ctrl+Shift+W. Quit always wins a collision: no other action can take its keys, and an action already on them stays unbound until one of the two is rebound.
- **Animated icons**: every icon is a Fluent Regular glyph shared by desktop and mobile. 28 of them play a short motion on hover (desktop) or press (mobile) and always settle back on the exact static glyph. A settings toggle keeps them static. See [ADR-0049](adr/0049-shared-icon-system.md).
- **Data & Recovery settings**: export, import, backup-now, restore, and a guarded clear-all-data reset are all in the UI. The CLI is optional, not required.
- **Account deletion**: Account & sync can permanently delete the cloud account, synced workspace, shared notes, and every Skriuw workspace on this device. Offline copies on other devices remain until cleared there. See [ADR-0056](adr/0056-account-deletion.md).
- **Storage settings**: settings show every stored image with its size and the notes that use it, and open the database or blobs folder in the file manager. They can also relocate the whole workspace (database, images, history, backups) to a new folder with a verified copy and an automatic restart.
- **Agent access over MCP**: Settings → Agents turns on a local MCP server that Claude Code and other agents connect to with a copied command. While Skriuw is open, an agent can list and search the workspace, read and write notes in Markdown, create and move folders, trash and restore items, create and update tasks (standalone or as checklist lines inside a note), build databases shown as tables or boards with custom lanes, and create, read and update Excalidraw drawings. Every change goes through the same path as an edit in the window, so it syncs and appears live. The server listens on `127.0.0.1` only, needs a bearer token that can be rotated, and never reads or writes locked notes. See [ADR-0064](adr/0064-local-mcp-server-for-agents.md).
- **Auto-updates**: the app has a built-in updater on top of a tag-driven, cross-platform release pipeline.
- **Current install channels**: APT and dnf repositories, Homebrew, Scoop, and the AUR. macOS, Windows, and Linux release assets are available directly. Winget and Snap publication remain pending.

## AI

Every AI feature is off until you enable it, and nothing leaves the device without a disclosure naming the model that receives it.

- **Opt-in local AI runtime**: once AI is enabled, Skriuw detects an existing Ollama or installs its own checksum-verified copy on Linux and macOS. Model pulls show cancellable progress, and an external Ollama is never stopped or updated.
- **Prompt library**: the prompts behind every writing action live in Settings → AI. Edit a built-in to get your own copy with a one-click reset, or write new ones. Your prompts sync, export, and undo like notes.
- **Prompt playground**: a full-screen surface that runs any prompt against any configured model (local Ollama, your own remote key, or an offline fake). It streams the result with cancel, retry, and copy, and never writes to notes.
- **AI writing actions**: **Ask AI** in the editor, selection toolbar, and palette opens one anchored menu. It can rewrite, fix, shorten, translate, or diagram a selection, or continue, summarise, outline, title, or extract tasks and tags from the note. Results stream into a preview with visible progress and a **Stop** button. Your note stays untouched until you accept, as one undoable edit. See [ADR-0036](adr/0036-ai-results-are-reviewed-in-place.md) and [ADR-0040](adr/0040-ai-runs-are-visible-work.md).
- **Voice dictation**: **AI: Dictate into note** records with a live level meter, transcribes with Groq Whisper or Gemini on your own key, and can tidy the result with your default model. Nothing is inserted until you choose, and the audio never leaves memory.
- **Local AI usage accounting**: Settings → AI → Usage shows runs, tokens, and estimated cost per model for this device, including cancelled and failed runs. The history stays local, prunes itself, and can skip storing prompt text entirely.

## Phone and tablet

The browser build installs on a phone or tablet and switches to a touch layout below 900px.

- **Installable browser build**: the web build at `/app/` installs to a home screen with its own icon and the palette you chose. See [ADR-0040](adr/0040-installable-browser-shell.md).
  - It starts from disk when offline, and asks the browser for persistent storage so the workspace is not evicted. The app states when the browser denies the request, and export remains possible.
  - The installed icon offers "New journal entry" and "New note" shortcuts.
  - The app appears in the system share sheet. Shared text or a link becomes a new note with the page title as its heading.
- **Compact shell**: below 900px the rail becomes a bottom tab bar, and the tree and inspector become edge sheets over the note. See [ADR-0041](adr/0041-compact-shell-and-touch-gestures.md).
  - Open a sheet from the toolbar or with a pull from either screen edge. Close it with a tap outside, its own close control, Escape, a pull back toward the edge, or by picking a note.
  - The page behind a sheet is inert, and the split view stacks.
  - Everything is sized from the visual viewport, so an open keyboard shrinks the shell instead of hiding it.
- **Touch gestures**: hold a note or folder for its menu (rename, pin, move, share, delete). Pull it left to move it to trash with an undo. Scroll freely in between. Rows, menu items, and tabs grow to 44px, and the platform vibration API ticks at each threshold where one exists.
- **Journal on a phone**: the day view tightens to the screen, with the five moods on one touch-sized row and Previous and Next day buttons in the header. A swipe across the heading steps a day. The calendar, search, and stats stay one pull away in the left sheet.
- **Back gesture and install**: on a phone the platform back gesture closes the sheet, dialog, or palette on top and otherwise leaves the app. See [ADR-0047](adr/0047-compact-shell-owns-back-and-install.md).
  - Tab bar taps never stack history.
  - The browser's install offer is available from a dismissible strip above the tab bar, and from the account menu, Data settings, and the storage warning.
  - Settings fills the phone. Every dialog stays above the keyboard and pulls down to close from its grabber or header. Toasts swipe away.
- **Formatting on a phone**: the text formatting popover docks at the bottom of the visual viewport as a sideways-scrolling bar above the keyboard. The note menu offers the system share sheet for the note's Markdown wherever the Web Share API exists.

## Mobile app (iOS and Android)

A native iOS and Android client for the same workspace. It has not shipped yet.

It is an Expo application over the same Rust core. `crates/skriuw-mobile` exposes the use cases over UniFFI, and an Expo native module wraps the bindings. SQLite stays canonical and on the device.

Navigation, toolbar, tab bar, sheets and lists are React Native views over the same store the desktop renderer uses. The editor is the desktop ProseMirror surface itself, mounted once in a persistent webview that swaps documents by message and is never remounted. See [ADR-0048](adr/0048-native-mobile-shell-over-shared-core.md) and the [mobile app contract](specs/mobile-app.md).

No store build exists on either platform, and iOS has never been launched anywhere. The matrix records what is built and what evidence supports it.

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

² Implemented. The build needs `expo-secure-store` added as a dependency before it can run.

Held against the performance contract, the mobile client's shared layer meets its invariants: note navigation makes no bridge call, and a keystroke wakes no view outside the editor, at 1,000 and at 5,000 notes. The reference-device cold-start budget (R-P4) has not been measured on any phone.

Every control on every screen carries an accessible name. Three accessibility defects are open, and VoiceOver and TalkBack have not been run. The evidence, including what is unverified and why, is in [the release readiness](benchmarks/2026-09-20-mobile-release-readiness.md) and [accessibility](benchmarks/2026-09-20-mobile-accessibility.md) records. Store metadata and the submission checklist are in [`tools/packaging/mobile`](../tools/packaging/mobile).

## Tech stack

A Rust core over SQLite, a React and ProseMirror renderer, and a Tauri desktop shell.

| Layer | Technology |
| --- | --- |
| Backend | Rust: domain, storage, runtime, and history crates with no I/O in the domain layer |
| Storage | SQLite as canonical storage, ordered SQL migrations, rebuildable FTS5 search index |
| History | Native Git materializer running fully off the editing path |
| Desktop shell | Tauri 2 |
| Renderer | React 19 + TypeScript, Vite, Tailwind CSS 4 |
| Editor | ProseMirror with a custom bounded-window architecture |
| Contracts | JSON Schema generated from Rust domain types, drift-checked in CI |

The renderer navigates a fully hydrated in-memory workspace. Switching notes sends no IPC call, reads no database rows, and parses no Markdown.

The [performance contract](performance-contract.md) sets budgets of P95 below 8 ms for a cached editor-state swap and for keystroke to paint, and zero dropped frames across 100 cached note switches on reference hardware. A benchmark harness measures them on a production build.

## Tests, decision records, and benchmarks

The tests, decision records, and benchmarks behind these features.

- More than 1,300 tests cover the backend, desktop, renderer, store, and UI architecture layers. A keyboard-driven end-to-end suite covers the complete workflow.
- [docs/adr](adr) holds 63 architecture decision records that document why the system is shaped the way it is.
- Benchmark evidence for performance claims lives in [docs/benchmarks](benchmarks).
