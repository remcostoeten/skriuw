# Split view panes

Status: partially implemented. Geometry (orientation, ratio, v3 persistence), the resizable divider, the orientation toggle, and the split/cycle bindings have shipped; per-pane tab strips, cross-pane tab moves, pane swap/maximize, the same-note ownership rule, and the accessibility announcements have not. The *Current state* and *Keyboard* tables below record what is live; everything else remains the target.

Extends the split-view half of ADR-0021 (`docs/adr/0021-tabs-and-split-view.md`). ADR-0021 shipped the minimum shape: one tab strip owned by the primary pane, an "open beside" action that shows a second pane holding exactly one note, a fixed 50/50 vertical split, and a "Close split" text button. This spec defines the finished feature: two fully symmetric panes, an orientation toggle, a resizable divider, per-pane tab strips, and complete keyboard operation of every one of those.

The pane model stays capped at **two panes**. ADR-0021's live-editor invariant ("at most one live editor per visible pane, at most two visible panes") is unchanged by this spec — nothing here raises the number of mounted ProseMirror views.

## Current state

| Concern | Today | File |
| --- | --- | --- |
| Pane list | `PaneState[]`, length 1–2, each with `openNoteIds`/`pinnedNoteIds`/`activeNoteId` | `app/src/store/panes.ts` |
| Orientation | Both, layout-level, toggleable and persisted | `app/src/store/panes.ts`, `app/src/shell/editor-panes.tsx` |
| Sizing | Ratio-driven grid tracks, dragged/nudged through the divider | `app/src/shell/split-layout.ts`, `app/src/shell/split-divider.tsx` |
| Tab strip | Renders the primary pane's tabs only | `app/src/shell/editor-panes.tsx` |
| Tab actions | `closeTab`, `closeOtherTabs`, `closeTabsToSide`, `closeAllTabs`, `togglePinTab`, `reorderTab`, `cycleTabId` all hardcode `primaryPane(panes)` | `app/src/store/panes.ts` |
| Pane focus | `focusedPaneId` tracked, set on `focusin` per pane; directional and wrapping cycle moves | `app/src/store/actions/panes.ts`, `app/src/shell/editor-panes.tsx` |
| Persistence | `panes`, `orientation`, `ratio` serialized at `PANE_LAYOUT_VERSION = 3`, v2 migrated forward | `app/src/store/pane-layout-persistence.ts` |
| Entry points | `mod+alt+v` / `mod+alt+h` split, sidebar context menu, `mod+alt+w` close split, strip button and context menu for orientation and reset | `app/src/commands/definitions.ts` |

Two existing behaviours are wrong once both panes own tabs, and this spec treats them as bug fixes rather than new features:

- `closeActiveTab` closes the whole split when a secondary pane exists, instead of closing the focused pane's active tab (`app/src/store/actions/panes.ts:44`).
- `cycleTab` always cycles the primary pane's strip regardless of `focusedPaneId` (`app/src/store/actions/panes.ts:200`).

## Model

### Pane geometry

```ts
export type SplitOrientation = "vertical" | "horizontal";

export type PaneLayout = {
  panes: readonly PaneState[];      // length 1 or 2, unchanged
  orientation: SplitOrientation;    // "vertical" = side by side; "horizontal" = stacked
  /** Fraction of the split axis taken by pane 1, clamped to [0.15, 0.85]. */
  ratio: number;
};
```

`orientation` and `ratio` are layout-level, not per-pane: with two panes there is exactly one divider, so one orientation and one ratio fully describe the geometry. They persist even while the split is closed, so reopening a split restores the last shape the user chose rather than snapping back to 50/50.

Naming: `vertical` means a **vertical divider** (panes side by side, the current behaviour); `horizontal` means a horizontal divider (panes stacked). This matches the divider, and the labels shown to the user are the unambiguous "Split right" / "Split down" rather than the axis words.

### Ratio bounds

- Stored as a fraction of the split axis, not pixels, so window resizing preserves proportion.
- Clamped to `[0.15, 0.85]`.
- Additionally floored in pixels — **not yet implemented**; today the fraction clamp is the only floor, so on a narrow window a pane can reach the 15% bound at a width the editor's text column cannot use. Neither pane may render narrower than `320px` (vertical) or shorter than `200px` (horizontal). When the container is too small to honour both the minimum and the ratio, the ratio is clamped for rendering but the stored value is left untouched, so widening the window restores the user's proportion. When the container cannot fit two minimums at all (very narrow window), the split renders stacked regardless of `orientation`, without mutating stored state.
- `0.5` is the default and the reset target.

### Persistence and migration

`PANE_LAYOUT_VERSION` goes `2 → 3`; the payload gains `orientation` and `ratio`. `parsePaneLayout` currently returns `null` for any version mismatch, which would silently discard every open tab on upgrade. It must instead **migrate v2 forward**: accept a v2 payload, keep its `panes`, and fill `orientation: "vertical"`, `ratio: 0.5`. Versions below 2 and unparseable payloads still return `null`.

Everything else about persistence is unchanged: same debounced binder, same `app_state` key, still excluded from portable archives (ADR-0021).

## Behaviour

### Opening a split

A split opens when a note is targeted at the "other pane" and no second pane exists yet. Entry points:

| Entry point | Result |
| --- | --- |
| `Open beside` shortcut / palette command | Active note opens in a new pane using the persisted orientation |
| `Split right` / `Split down` toolbar buttons | Same, forcing that orientation and persisting it |
| Sidebar row context menu → "Open beside" | That note opens in the new pane |
| Drag a sidebar row onto the right/bottom third of the editor area | Split in the implied direction with that note |
| Drag a tab out of its strip onto the other half of the editor area | Split in the implied direction, tab **moves** (removed from its origin strip) |
| Reference / wiki-link click with the split modifier held | Target note opens in the other pane |

On open, focus moves to the new pane and its active note. Opening beside a note that is already open in the other pane is allowed and expected — see *Same note in both panes*.

When a split already exists, every one of these targets the non-focused pane instead of creating a third.

### Closing

| Action | Result |
| --- | --- |
| `Close split` | The focused pane is discarded; the surviving pane becomes primary and keeps all of its tabs |
| Closing the last tab in a pane | That pane collapses; the split closes; focus moves to the survivor |
| `Close tab` (`mod+w`) | Closes the focused pane's active tab. Never closes the split directly — only via the rule above |
| Closing the primary pane | The secondary pane's tabs are promoted into `PRIMARY_PANE_ID`; its active note becomes the store's `activeNoteId` |

Promotion matters: the store's `activeNoteId` and everything bound to it (metadata panel, note history, save path, title) always follow pane 1, so collapsing a split must rewrite pane identity rather than delete the wrong list.

`closedTabsByPaneId` for a discarded pane is dropped, as it is today (`app/src/store/actions/panes.ts:225`).

### Focus

- `focusedPaneId` decides the target of every pane-scoped action: tab cycling, tab index keys, close tab, reopen closed tab, move tab, resize, orientation-independent directional focus.
- Focus follows creation (opening beside focuses the new pane) and follows collapse (closing a pane focuses the survivor).
- Focus moves on `focusin` anywhere inside a pane — already implemented, keep it.
- The focused pane carries a persistent visual marker independent of DOM focus: a 2px accent line on its inner edge of the divider, plus a subtly brighter tab strip. This must be visible when focus is in the sidebar or metadata panel, so "which pane will this act on?" is always answerable.

### Orientation

- One toggle flips between side-by-side and stacked. Pane order is preserved: pane 1 is left in vertical, top in horizontal.
- `ratio` is preserved across the flip (a 70/30 vertical split becomes a 70/30 stacked split).
- The toggle is a no-op with one pane, but still updates the persisted `orientation`, so the next `Open beside` uses it.
- Directional focus shortcuts remain bound to the same action IDs in both orientations; in stacked mode the arrow-up/down alternates fire the same commands (see the shortcut table).

### Resizing

Shipped as `SplitDivider` (`app/src/shell/split-divider.tsx`), a sibling of `PanelResizeHandle` rather than a generalization of it. **This supersedes the original "reuse `PanelResizeHandle`" instruction**, on the grounds that the two handles share a drag skeleton but no bound model: the sidebar handle is px-width with a collapse threshold and an animated settle, the split divider is a fraction with a hard clamp, no collapse, and two axes. Folding both into one component meant a props union where half the props are inert per call site. What is shared is the *pattern* — rAF-coalesced pointer move, direct DOM preview, one commit on release — and that is duplicated deliberately, about 60 lines.

The three generalizations the original instruction asked for still hold, they just live in the new component:

1. `aria-orientation` and the drag axis follow `SplitOrientation`.
2. Bounds expressed as a fraction, replacing the sidebar's px-width + collapse-threshold bounds. The split divider **never collapses** a pane — it clamps at `[0.15, 0.85]`; collapsing is `Close split`, which is a different action with different state. The pixel floor is **not yet implemented** — see the note under *Ratio bounds*.
3. Keyboard nudge steps by `0.02` of the axis per press, Shift+arrow takes the coarse `0.10` step.

Interaction rules:

- Drag: pointer capture, `requestAnimationFrame`-coalesced, previewed by mutating the divider's inline offset only. The pane track widths commit once on pointer-up — dragging must not re-render either editor, and must not dispatch a store update per frame.
- Double-click the divider: reset to `0.5`.
- The divider is a `role="separator"` with `tabIndex={0}`, `aria-orientation`, `aria-valuenow` (percentage, integer), `aria-valuemin={15}`, `aria-valuemax={85}`, and `aria-label="Resize split panes"`. Arrow keys nudge (←/→ when side by side, ↑/↓ when stacked), Shift+arrow takes the coarse step, `Enter` resets to 0.5. `Home`/`End` are deliberately **not** bound: they do not exist on every keyboard, and Shift+arrow is the reachable equivalent.
- Persisted on commit only (drag end, keyboard nudge, reset), through the same debounced pane-layout binder.

Keyboard users must never need the divider's DOM focus: `Grow focused pane` / `Shrink focused pane` shortcuts do the same job from inside the editor, and they are orientation-aware (they change width when side by side, height when stacked).

### Per-pane tab strips

Each pane renders its own strip with its own: tab order, pinned set, active tab, closed-tab stack, context menu, and drag reordering. Concretely, every function in `store/panes.ts` that currently calls `primaryPane(panes)` takes a `paneId` instead — `closeTab`, `closeOtherTabs`, `closeTabsToSide`, `closeAllTabs`, `togglePinTab`, `reorderTab`, `cycleTabId`, `openNoteInTab`. Their `CloseTabResult.nextActiveNoteId` contract (which drives `activateNote`) applies **only when `paneId === PRIMARY_PANE_ID`**; secondary-pane activation goes through `activateTabInPane`, as it already does for tab-index keys (`app/src/store/actions/panes.ts:190`).

Strip visibility rule stays as it is: a strip renders when it carries information — more than one tab in that pane, or a split is open.

Dragging a tab between strips moves it (removed from origin, inserted at the drop index in the target, becomes the target's active tab, and focus moves with it). Dropping a tab onto its own strip reorders, as today. A pinned tab cannot be dragged, in either sense.

### Same note in both panes

This is a first-class case, not an edge case.

**Independent view state.** `NoteEditor` holds its `EditorWorkingSet` in a component-instance ref (`app/src/features/editor/note-editor.tsx:332`), so two mounted instances already keep separate `EditorState`, `scrollTop`, selection, bounded-document window, and search state per note. Two panes showing the same note therefore scroll and select independently by construction. This spec makes that a tested guarantee rather than an accident:

- Scrolling pane B does not move pane A, for the same note.
- Selection and caret position are per pane.
- Find-in-note state, the bounded-document window, and the outline highlight are per pane.
- Raw-Markdown mode is per note, not per pane (it is a note-level setting) — flipping it in one pane flips both, and both re-render from the same document.

**Edit propagation.** Edits reach the other pane through the store's `documents` subscription (`app/src/features/editor/note-editor.tsx:1216`), which currently reconciles a mounted editor when the record changes and the pane is not itself dirty. That gives save-flush granularity: pane B updates when pane A's save lands, not per keystroke. That is acceptable and is what the spec requires — but the dirty guard opens a real divergence window when **both** panes are dirty on the same note, where each pane would ignore the other's write and the last flush would silently win.

Required rule: **one pane at a time owns editing for a given note.** Implemented as:

- The pane that receives the first keystroke for note N becomes N's edit owner.
- The other pane, while N has an owner, renders N read-only with a quiet inline affordance ("Editing in the other pane — click to take over"). Taking over flushes the owner's pending save first, then transfers ownership, then reconciles.
- Ownership releases on flush-and-blur, on the owner closing the tab, or on the split closing.
- Ownership is renderer-local state keyed by note ID; it is never persisted and never leaves the renderer.

This keeps the save sequencer's single-writer assumption intact without introducing a merge path, and it is honest about what is happening rather than losing keystrokes.

**Bindings that stay on pane 1.** The metadata panel, note history, note title in the top bar, and cover editing remain bound to `activeNoteId`, i.e. to the primary pane, per ADR-0021. A user editing note N in the secondary pane sees pane 1's metadata. This is a deliberate v1 limit; revisiting it is out of scope here and would need its own ADR amendment.

### Unavailable notes

Unchanged from ADR-0021 and applied per pane: a purged note's tab disappears during derivation; a note trashed this session keeps its tab with the struck-through affordance (`app/src/shell/editor-panes.tsx:171`) and its pane resolves to the empty state; restored layouts drop already-unavailable tabs on load. A pane whose every tab is dropped on restore collapses the split rather than restoring an empty pane (`restorePanes` already does this for index > 0 — `app/src/store/panes.ts:96`).

## Keyboard

Every action below is a rebindable definition in `app/src/commands/definitions.ts` with a matching entry in the `ShortcutActions` map and, where it is a discoverable verb, a command-palette entry. No hardcoded listeners.

### Existing bindings

The backslash family is gone. Backslash is missing or awkward on 60% and non-US layouts, so the split keys moved to a mnemonic `mod+alt+<letter>` family; `mod+alt` is the modifier pair the pane bindings already used.

| Action ID | Keys | Change |
| --- | --- | --- |
| `openBeside` | `mod+alt+v` (was `mod+\`) | Labelled "Split vertically". Opens the split side by side; with a split already open it only re-lays the panes, keeping what each holds |
| `openBelow` | `mod+alt+h` | New. Same, stacked |
| `closeSplit` | `mod+alt+w` (was `mod+shift+\`) | Now discards the **focused** pane, not always the secondary |
| `cyclePaneNext` / `cyclePanePrevious` | `mod+alt+tab` / `mod+alt+shift+tab` | New. The wrapping cycle, replacing the planned `focusOtherPane`. Bare `shift+tab` was rejected: the editor owns it for outdent |
| `focusPaneLeft` | `mod+alt+←`, secondary `mod+alt+↑` | Relabel to "Focus previous pane"; the alternate serves stacked mode |
| `focusPaneRight` | `mod+alt+→`, secondary `mod+alt+↓` | Relabel to "Focus next pane" |
| `closeTab` | `mod+w` | Acts on the focused pane; no longer closes the split as a special case |
| `nextTab` / `previousTab` | `ctrl+tab` / `ctrl+shift+tab` | Cycle the **focused** pane's strip, wrapping |
| `moveTabLeft` / `moveTabRight` | `ctrl+shift+pageup` / `pagedown` | Already pane-scoped; unchanged |
| `reopenClosedTab` | `mod+shift+w` | Already pane-scoped; unchanged |
| `openTab1..9`, `openLastTab` | `alt+1..9`, `alt+0` | Already pane-scoped; unchanged |

### New bindings

| Action ID | Keys | Label | Scope | Notes |
| --- | --- | --- | --- | --- |
| `toggleSplitOrientation` | *(palette only, no key)* | Toggle split orientation | — | **Shipped keyless.** `mod+alt+v`/`mod+alt+h` set the orientation directly, so a toggle key would be a third way to do the same thing. Reachable from the palette, the tab-strip button, and the strip context menu |
| `swapPanes` | `mod+alt+s` | Swap panes | `split` | Trades both panes' entire tab strips; focus follows the focused pane's content. Not implemented |
| `moveTabToOtherPane` | `mod+alt+m` | Move tab to other pane | `split` | Moves the focused pane's active tab; opens a split first if none exists. Not implemented |
| `growPane` | `mod+alt+shift+→`, secondary `mod+alt+shift+↓` | Grow focused pane | `split` | Orientation-aware; `+0.02` per press. Shift is already spent in the combo, so the coarse step is repeated presses (key repeat included) rather than a modifier |
| `shrinkPane` | `mod+alt+shift+←`, secondary `mod+alt+shift+↑` | Shrink focused pane | `split` | Orientation-aware; `-0.02` |
| `resetPaneRatio` | `mod+alt+0` | Reset split sizes | `split` | Back to 50/50; `mod+0` stays zoom reset. Shipped as a palette command and a divider `Enter`/double-click, no key yet |
| `maximizeFocusedPane` | `mod+alt+z` | Maximize focused pane | `split` | Temporary zoom to full width; a second press restores the stored ratio. State is renderer-local and not persisted |

All are `worksWhileTyping: true` and guarded by `["modal"]`, matching the existing pane and tab bindings, so they fire with the caret in a note but never over the command palette or a dialog.

Conflict notes to carry into the definitions' `description` fields, following the existing convention: `mod+alt+arrows` (and therefore the shifted variants) are claimed by some Linux desktops and macOS apps — already documented for `focusPaneLeft`/`focusPaneRight` and equally true for `growPane`/`shrinkPane`; rebinding is the answer. `mod+alt+m` is clear of `mod+m` (raw Markdown). `mod+alt+0` is clear of `mod+0` (zoom reset) and `alt+0` (last tab).

### Scopes

`split` is already computed in `activeShortcutScopes` from `state.panes.length > 1` (`app/src/commands/workspace-shortcuts.tsx`) — every binding that needs an open split uses it, so with one pane those keys fall through untouched. The two split-opening keys use `notes-route` instead, since their whole job is creating the split.

### Keyboard-only completeness

The following must each be reachable with no pointer, and each is covered by a binding or command above: open a split in either direction; move focus between panes; cycle panes; move a tab to the other pane; reorder tabs within a pane; activate any tab by index; resize the divider in both directions; reset the ratio; maximize a pane; flip orientation; swap panes; close a tab; close a pane; reopen a closed tab. Drag-and-drop is an accelerator for the tab-move and split-open cases, never the only route.

## Toolbar and menus

### Top action bar (`app/src/app.tsx:471`)

Two controls, placed between the note title and the version-history button:

- **Split** (`ColumnsIcon` / `RowsIcon`, reflecting the current orientation). Click toggles the split open or closed. `aria-pressed` reflects whether a split exists. Disabled with no active note. Shortcut hint from `openBeside`.
- **Orientation** (`RowsIcon` when currently vertical, i.e. "switch to stacked"). Only rendered while a split exists. Shortcut hint from `toggleSplitOrientation`.

Both follow the existing `toolbarIconButtonClass` and `TOOLBAR_SHORTCUT_IDS` hint plumbing (`app/src/shell/toolbar-styles.ts`, `app/src/app.tsx:145`).

### Tab strip context menu

Add to the existing menu (`app/src/shell/editor-panes.tsx:221`), after the pin separator:

- **Split right** / **Split down** — open that tab in a new pane with the given orientation.
- **Move to other pane** — only while a split exists.

The strip's empty-area menu keeps **Close all** and **Close split**, and gains **Toggle orientation**.

### Command palette

New entries in `app/src/commands/workspace-commands.tsx`, mirroring the shortcut table: Split right, Split down, Toggle split orientation, Swap panes, Focus other pane, Move tab to other pane, Reset split sizes, Maximize focused pane, Close split. Each carries its shortcut hint via `shortcutDefinition(...)`.

## Accessibility

- Each pane is a labelled region: `role="group"`, `aria-label="Editor pane 1 of 2"` / `"Editor pane 2 of 2"`, updated when orientation changes to "top"/"bottom" wording in stacked mode.
- Each strip keeps `role="tablist"` with `aria-label` disambiguated per pane ("Open notes, pane 1").
- The divider is a keyboard-operable `role="separator"` as specified above.
- Pane focus changes announce via a polite live region: "Pane 2 of 2 focused, editing <title>". Ratio changes announce the new percentage, throttled so a held arrow key does not flood the queue.
- The focused-pane marker is not colour-only — it is a border-weight change as well, so it survives high-contrast and colour-vision differences.
- Every new control has a visible focus ring from the existing token set; no new colour literals (see the destructive/colour conventions the repo already enforces).

## Performance

`docs/performance-contract.md` applies unchanged. Specific obligations this feature takes on:

- Editor-host mount count stays at one per visible pane: exactly 1 with no split, exactly 2 with a split, regardless of tab count in either strip.
- Divider drag produces zero editor re-renders and zero store updates per frame; one store update on commit. It must not appear in the "main-thread task during navigation" budget because it is not navigation, but it must hold the 16.67 ms frame ceiling.
- Orientation toggle is a CSS track change, not a remount. Both editors keep their views, scroll positions, and working sets across the flip — this is an explicit acceptance criterion, since a naive implementation that swaps `flex-row`/`flex-col` on a keyed container would remount both.
- Cross-pane tab moves are pure state updates. Moving a tab that is not the target pane's active tab mounts nothing.
- The 32-state working-set ceiling is per editor instance and unchanged; two panes means two ceilings, which is the intended cost of two visible editors.

## Acceptance criteria

1. With N tabs open and no split, exactly one editor instance is mounted; with a split, exactly two — asserted in `app/__tests__/shell/editor-panes.test.ts` alongside the existing assertions.
2. Both panes render an independent tab strip; closing, pinning, reordering, cycling, and index-activating operate on the focused pane only.
3. Orientation toggles between side-by-side and stacked, preserves `ratio` and pane order, and remounts neither editor.
4. The divider drags to any ratio in `[0.15, 0.85]`, honours the pixel minimums, resets on double-click, and is fully operable from the keyboard with correct `aria-valuenow`.
5. Orientation and ratio survive closing and reopening the split, and survive desktop restart.
6. A v2 persisted layout upgrades to v3 without losing tabs; a corrupt payload still falls back to the default single pane.
7. The same note open in both panes scrolls, selects, and searches independently; edits in the owning pane appear in the other at save-flush granularity; the non-owning pane is read-only with a take-over affordance while ownership is held.
8. Closing the last tab in a pane collapses the split and focuses the survivor; closing the primary pane promotes the secondary's tabs and rebinds `activeNoteId` correctly.
9. Every listed interaction is reachable by keyboard alone, verified by a keyboard-only pass through the acceptance list.
10. Pane focus, ratio changes, and orientation changes are announced to assistive technology.
11. Pane layout remains absent from portable archive export.
12. `./scripts/check.sh` is green, and the split-view path is measured against the performance contract before merge (editor-host mount counts, divider drag frames, orientation-toggle remount count).

## Out of scope

- More than two panes, nested grids, and per-pane splitting.
- Linked/synchronized scrolling between panes showing the same note.
- Per-pane metadata panel, history, or cover editing (these stay bound to pane 1).
- Concurrent multi-pane editing of one note with merge semantics — the ownership rule deliberately avoids needing it.
- Detaching a pane into a separate OS window.
