# Right Sidebar Tags And Backlinks Spec

## Purpose

Turn the note metadata rail into a single inspector view that helps users understand and organize the active note without switching tabs. The inspector should combine document facts, tags, backlinks, outgoing links, and outline in one accessible, responsive surface.

The primary creation surface is the editor, not the sidebar. Tags and note links should be quick to insert while writing through BlockNote suggestion menus and inline chips. The right sidebar should explain and manage the resulting context.

This spec intentionally precedes implementation. Tags and backlinks touch editor schema, serialization, data shape, sync, search, settings, mobile, and accessibility. Shipping only the visual panel first would create a shallow feature that is hard to evolve.

## Current State

- Desktop notes layout renders `MetadataPanel` as a narrow right rail from `NotesLayoutShell`.
- Mobile renders the same `MetadataPanel` in a draggable bottom sheet.
- `MetadataPanel` currently has two tabs: file info and outline.
- `NoteFile` has no first-class tag list. Only `journalMeta.tags` exists for journal-related note metadata.
- The shared `tags` persisted store exists and is used by journal features and settings.
- Starter notes already include `[[Note title]]`-style links, but the app does not parse, resolve, render, or index them.
- Mobile note data omits tags and link context.

## Product Goals

- Make the right sidebar one single view, not a tabbed inspector.
- Let users add tags from the editor through `/tag`, `#tag`, and the inspector.
- Let users link notes from the editor through `/link note`, `@note`, and typed wiki links.
- Show backlinks: notes that mention/link to the active note.
- Show outgoing links: notes this note mentions/links to, plus unresolved references.
- Build toward a future graph/spiderweb view without making graph UI part of v1.
- Keep outline visible as lower-priority document navigation.
- Keep the interaction model quiet and utilitarian, matching the current workspace aesthetic.
- Make the same information available on mobile through the existing details sheet.

## Non Goals For First Implementation

- Graph visualization.
- Full-text search page redesign.
- Persisted backlink rows.
- Bidirectional link editing in rich text mode beyond preserving markdown content.
- Public sharing, collaborative mentions, or cross-workspace links.

## Terminology

- **Tag**: A metadata label on a note, rendered as a compact chip such as `#research`. Tags categorize notes but do not create note-to-note edges.
- **Note mention**: An inline reference to another note, rendered as a chip such as `@Research brief`. Mentions create the backlink graph.
- **Wiki link**: A typed markdown-friendly note reference such as `[[Research brief]]` or `[[Research brief|brief]]`. Wiki links also create the backlink graph.
- **Markdown link**: Standard markdown link syntax such as `[BlockNote](https://blocknotejs.org)` or `[Research brief](note://note-id)`. These are regular links, not the preferred note graph syntax for v1.

## Editor-First Interaction Model

### Tags

Users should be able to add tags in three ways:

1. `/tag`
   - Opens a BlockNote slash menu action.
   - Selecting or creating a tag inserts an inline tag chip at the cursor and adds the tag to `note.tags`.
   - If text is selected, the slash action can convert it to a tag name.

2. `#`
   - Opens a BlockNote suggestion menu filtered by tag names.
   - Selecting a tag inserts an inline tag chip and adds it to `note.tags`.
   - Typing a new name and pressing Enter creates the tag if allowed.

3. Inspector tag section
   - Still useful for cleanup and overview.
   - Should not be the only way to add tags.

Important behavior:

- Inline tag chips and `note.tags` must stay in sync.
- Removing the last inline chip for a tag should remove the note-level tag unless the tag was manually pinned in the inspector.
- For v1, avoid "manual pin" complexity: note tags are derived from inline chips plus inspector tags stored in the same `note.tags` list.
- Raw markdown mode should preserve `#tag` text and update `note.tags` by parsing content on save.

### Note Links And Backlinks

Backlinks are not created directly. A backlink appears automatically when another note links to or mentions the active note.

Users should be able to create graph edges in three ways:

1. `/link note`
   - Opens a BlockNote slash menu action.
   - Selecting a note inserts a note mention chip.

2. `@`
   - Opens a BlockNote suggestion menu filtered by note names.
   - Selecting a note inserts a note mention chip.
   - The inline chip stores the target note id and display title.

3. `[[`
   - Raw or markdown-friendly typed syntax.
   - `[[Note title]]` and `[[Note title|Alias]]` are parsed into outgoing links and backlinks.
   - In block mode, we can either preserve typed wiki text or convert it to a note mention chip after selection. Conversion is preferred if serialization is reliable.

Recommended v1 source of truth:

- In BlockNote documents, custom inline note mention content should store `{ noteId, title }`.
- In markdown content, persist note mentions as `[[title]]` or `[[title|alias]]` until an id-backed markdown format is chosen.
- The backlink index should read both rich inline mention content and markdown wiki syntax.

### BlockNote API Direction

Use BlockNote extension points rather than hand-rolled contenteditable behavior:

- `SuggestionMenuController` with `triggerCharacter="/"` for custom slash actions.
- `SuggestionMenuController` with `triggerCharacter="@"` for note mentions.
- `SuggestionMenuController` with `triggerCharacter="#"` for tag insertion.
- Custom inline content specs for rendered note mention chips and tag chips.
- `editor.insertInlineContent(...)` to insert selected mention/tag chips.

Official docs referenced:

- BlockNote suggestion menus: https://www.blocknotejs.org/docs/react/components/suggestion-menus
- BlockNote custom inline content: https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content
- BlockNote content manipulation: https://www.blocknotejs.org/docs/reference/editor/manipulating-content

## Recommended Data Model

### Notes

Add first-class note tags:

```ts
type NoteFile = {
  // existing fields
  tags: string[];
};
```

Persist them directly on notes, not inside `journalMeta`.

Recommended Supabase shape:

```sql
alter table public.notes
  add column if not exists tags text[] not null default '{}';
```

Why:

- Tags are not journal-only metadata.
- `journalMeta` should remain optional journal context, not a general note metadata bucket.
- A `text[]` column keeps note reads simple and avoids a join for every editor load.
- The existing `tags` table can remain the global tag dictionary with color and usage metadata.

Required code changes:

- `src/types/notes.ts`: add `tags: string[]` to `NoteFile`.
- `src/core/shared/persistence-types.ts`: add `tags: TagName[]` to `PersistedNote`.
- `src/core/notes/types.ts`: add tags to create/update note inputs.
- `src/core/notes/mappers.ts`: map persisted note tags.
- `src/domain/notes/api.ts`: read/write `notes.tags`.
- `src/features/notes/hooks/use-create-note.ts`, `use-update-note.ts`, `use-debounced-save.ts`: preserve tags in optimistic updates.
- `apps/mobile/src/core/workspace-types.ts` and mobile mappers: include `tags`.

### Tags

Promote journal tag hooks into workspace tag hooks.

Recommended direction:

- Keep `PersistedTag` and the `tags` store/table.
- Introduce a notes-owned or shared hook that derives usage from both note tags and journal entry tags.
- Keep tag names normalized to lowercase trimmed labels for v1.
- Preserve colors in the tag dictionary.
- Create missing tag dictionary entries when a user adds a tag to a note.

Potential naming:

- `src/features/tags` for shared workspace tag hooks/components.
- Or keep in `features/journal` only temporarily, but that should be treated as migration debt.

### Backlinks

Backlinks should be derived from current note content and rich content, not stored.

Add a parser/index module:

```ts
type NoteLink = {
  raw: string;
  kind: "wiki" | "mention" | "markdown-note-link";
  targetLabel: string;
  alias?: string;
  targetNoteId?: string;
  sourceNoteId: string;
};

type ResolvedNoteLink = NoteLink & {
  status: "resolved" | "ambiguous" | "unresolved";
  targetNoteId?: string;
};
```

Supported v1 syntax:

- `[[Note title]]`
- `[[Note title|Alias]]`
- BlockNote note mention inline content
- Optional: id-backed markdown links using an internal `note://note-id` href

Resolution rules:

- Mention chips with `noteId` resolve by id first.
- Strip `.md` from note names.
- Normalize whitespace and case.
- Prefer exact normalized title match.
- If multiple notes have the same normalized title, mark ambiguous.
- Never auto-create notes in v1.

Markdown link distinction:

- External markdown links like `[BlockNote](https://blocknotejs.org)` should stay normal links and should not create graph edges.
- Internal markdown links can create graph edges only if they use an explicit internal scheme, preferably `note://note-id`.
- Relative markdown links like `[Research](./Research.md)` are ambiguous across folders and should be treated as regular links in v1 unless we add path-based note resolution later.

Required module:

- `src/features/notes/lib/note-links.ts`

Required tests:

- Parses plain links and aliased links.
- Ignores malformed or empty links.
- Resolves links by normalized note title.
- Reports ambiguous and unresolved links.
- Produces backlinks by scanning all notes except the active note.

## Inspector UX

Replace the current tabbed `MetadataPanel` with a single scrollable view.

Suggested section order:

1. Header
   - Active note title.
   - Close button on mobile.
   - Compact modified/read-time summary.

2. Tags
   - Existing tags as removable chips.
   - Inline add control with autocomplete from workspace tags for cleanup/manual management.
   - Copy should make clear the fastest path is typing `#` or using `/tag` in the editor.
   - Empty state: small inline prompt, not a large card.
   - Keyboard behavior: `Enter` adds highlighted/typed tag, `Escape` closes input, Backspace removes last empty chip only when focus is in the tag input.

3. Links
   - Backlinks count and list.
   - Outgoing links count and list.
   - Unresolved links surfaced as muted rows with an action reserved for later.
   - Click a resolved link to select/open that note.
   - Copy should make clear links are created by `@note`, `/link note`, or `[[note]]`.

4. Outline
   - Existing heading extraction.
   - If heading navigation is implemented, use buttons and scroll the editor to the heading. If not, keep as static text until editor anchors are reliable.

5. Details
   - Created, modified, file size, character count, word count, read time.

Visual direction:

- Dense, work-focused inspector.
- No nested cards.
- Use full-width section bands divided by thin borders.
- Chips should be compact and stable, with clear focus rings.
- Icons should come from `lucide-react`.
- Desktop width should probably grow from `w-56 xl:w-64` to `w-72 xl:w-80`; confirm after visual testing.
- Mobile sheet should keep the same sections but use larger tap targets and a sticky header.

## Accessibility Requirements

- The inspector must have a labelled region, for example `aria-label="Note inspector"`.
- Each section should use a semantic heading.
- Tag chips with removal must expose the action, for example `Remove tag writing`.
- Add-tag autocomplete should use combobox/listbox semantics if suggestions appear.
- Link rows should be buttons when they navigate, with labels like `Open backlink Research brief`.
- Unresolved links should not be fake buttons.
- Mobile close and drag regions must preserve existing `data-sheet-no-drag` handling.
- Keyboard-only users must be able to add/remove tags and open links without entering a trap.
- Respect reduced motion for any section transitions.

## Engineering Plan

### Phase 1: Data And Indexing

- Add note `tags` to shared types, API types, mappers, and optimistic update paths.
- Add Supabase migration documentation or migration file if the repo gains migrations.
- Add mobile note tag fields and mapper support.
- Add custom BlockNote inline content specs for note mentions and tags.
- Add serialization/deserialization strategy for inline mention/tag content.
- Add `note-links.ts` with pure parser/index functions that can read markdown wiki links and rich inline mentions.
- Add unit tests for note tags mapping, inline content extraction, and link indexing.

### Phase 2: Editor Menus

- Extend `RichTextEditor` with custom slash menu items while preserving default slash items.
- Add `@` note mention menu.
- Add `#` tag menu.
- Insert selected tags and note mentions through BlockNote APIs.
- Confirm raw markdown mode parses `#tag` and `[[note]]` on save.

### Phase 3: Tag Hooks And Mutations

- Add `useWorkspaceTags` deriving usage from notes and journal entries.
- Add `useEnsureTag` or equivalent mutation helper.
- Add note tag update actions through `useUpdateNote`.
- Update settings tag manager copy and usage counts so it is not journal-only.
- Ensure deleting a tag removes it from both notes and journal entries, or explicitly defer note cleanup with a visible spec note.

### Phase 4: Inspector Component

- Rename or replace `MetadataPanel` with `NoteInspectorPanel`.
- Pass `files`, `activeFile`, `onFileSelect`, and note update actions from `useNotesLayout` / `NotesLayoutShell`.
- Render tags, backlinks, outgoing links, outline, and details as one scroll view.
- Keep mobile bottom-sheet behavior through the existing shell.

### Phase 5: App-Wide Integration

- Include note tags in mobile note details/action sheet.
- Consider tag filters in left sidebar/search after the inspector ships.
- Update starter content validation if tag fields become required.
- Update profile/summary counts only if they should expose tags/link health.

## Testing Plan

- Unit tests:
  - `note-links.ts` parser and resolver.
  - BlockNote inline mention/tag extraction.
  - `core/notes/mappers.ts` note tags.
  - `domain/notes/api.ts` row mapping if server helpers stay directly tested.
  - optimistic update preserves tags.

- Component tests if existing setup supports them:
  - Inspector renders all sections for an active note.
  - Add/remove tag calls update with the expected tag array.
  - Backlink row opens the source note.
  - Unresolved outgoing link renders as non-interactive status.
  - `@` note suggestion inserts a note mention.
  - `#` tag suggestion inserts a tag chip.
  - `/tag` and `/link note` actions appear in the slash menu.

- Manual QA:
  - Desktop inspector open/close and resized sidebar.
  - Mobile bottom sheet drag/close plus tag controls.
  - Keyboard-only tag add/remove and link navigation.
  - Raw editor wiki-link preservation.
  - Block editor wiki-link preservation.
  - Duplicate-title ambiguous link state.

## Open Questions

1. Should backlinks resolve only by note title in v1, or should we introduce an id-backed link format later while displaying titles?
2. Should duplicate note titles be allowed to resolve to the most recent note, or always show ambiguous until renamed?
3. Should deleting a tag from settings remove it from notes immediately, matching journal cleanup?
4. Should tags apply to folders too, or notes only for this feature?
5. Should the right inspector width increase globally, or should users be able to resize it separately later?
6. Should `#tag` in normal prose always become a tag, or only when selected from the suggestion menu?
7. Should `@note` be the canonical note-link input, with `[[note]]` kept mostly for raw markdown compatibility?

## Recommended First Decision

Approve the following v1 constraints before implementation:

- Notes get `tags: string[]`.
- Tags can be created from `#`, `/tag`, and the inspector.
- Note graph links can be created from `@`, `/link note`, and `[[title]]`.
- Backlinks are derived from BlockNote mention inline content, `[[title]]`, and optional internal `note://note-id` markdown links.
- Normal external markdown links do not create backlinks.
- Duplicate title links are ambiguous.
- Tag deletion cleans up both notes and journal entries.
- Right inspector becomes a single scrollable panel with no tabs.
