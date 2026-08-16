# Find in note (Ctrl+F / find-and-replace)

A self-contained guide to replicating Skriuw's in-editor find-and-replace: a
VS Code-style search widget over a ProseMirror document, with match
highlighting, next/previous navigation, match case / whole word / regex
options, and replace / replace-all.

The implementation lives in `app/src/features/editor/`:

| File | Role |
| --- | --- |
| `search-plugin.ts` | ProseMirror plugin: matching, decorations, navigation, replace. Framework-free. |
| `use-editor-search.ts` | React hook: widget state, open/close/toggle semantics, shortcut bindings. |
| `search-widget.tsx` | The visible panel: find/replace inputs, option toggles, match counter. |
| `search-controller.ts` | Module-level bridge so the global command palette can open the panel. |
| `editor.css` | The two highlight classes. |

The dependency direction is strict: the plugin knows nothing about React, the
hook knows nothing about the widget's DOM, and the widget is a pure controlled
component. Any one layer can be swapped without touching the others.

## Behavior contract

- `mod+f` **toggles**: opens the panel and focuses/selects the query; a second
  press closes it and returns focus to the note (it does not just re-select).
- `mod+h` (or the palette command) opens the same panel with the replace row
  expanded. Opening replace over an already-open find panel expands in place
  and keeps the query and current match — it never re-arms the search.
- Reopening a closed panel with a remembered query immediately re-highlights.
- Typing in the find input searches live; the first match scrolls into view.
- `Enter` = next match, `Shift+Enter` = previous (wraps around), `Escape`
  closes and clears highlights. In the replace input, `Enter` replaces the
  current match.
- Option toggles (`alt+c` / `alt+w` / `alt+r` while the panel is open) re-run
  the search with the new options.
- Invalid regex shows "Invalid regex", paints the field border destructive,
  and is announced via `aria-invalid` + the live-region counter.
- Edits to the document while a search is active recompute matches
  automatically (the plugin watches `tr.docChanged`).
- Search-state transactions are flagged `addToHistory: false` so highlighting
  never pollutes undo.

## 1. The ProseMirror plugin (`search-plugin.ts`)

All matching logic lives in plugin state keyed by `searchPluginKey`. UI code
communicates exclusively through transaction metadata.

```ts
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

export type SearchMatch = { from: number; to: number };

export type SearchState = {
  term: string;
  options: SearchOptions;
  matches: SearchMatch[];
  current: number;
  decorations: DecorationSet;
};

export const defaultSearchOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

export const searchPluginKey = new PluginKey<SearchState>("skriuw-search");
```

### The view seam

The plugin's commands accept a structural `EditorSearchTarget` rather than a
concrete `EditorView`. This is what lets the same search drive both the rich
ProseMirror editor and any other surface that can expose `state`/`dispatch`
(Skriuw's bounded/virtualized editor implements `revealPosition` to scroll
windows that are not currently mounted in the DOM):

```ts
export type EditorSearchTarget = {
  readonly state: EditorState;
  dispatch(transaction: Transaction): void;
  focus(): void;
  domAtPos?(position: number): ReturnType<EditorView["domAtPos"]>;
  revealPosition?(position: number): void;
};
```

### Building the regex

Everything funnels through one regex builder. Literal searches are escaped;
whole-word wraps the pattern in `\b(?: … )\b`; an invalid user regex returns
`null` (never throws into the UI):

```ts
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildRegex(term: string, options: SearchOptions): RegExp | null {
  if (!term) return null;
  let pattern = options.regex ? term : escapeRegExp(term);
  if (options.wholeWord) pattern = `\\b(?:${pattern})\\b`;
  const flags = `g${options.caseSensitive ? "" : "i"}`;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}
```

### Finding matches: the flattened-text position map

This is the core trick. A ProseMirror document is a tree; regex wants one
string. The walker flattens all text into a single string while recording, for
every character of that string, its absolute document position. Block
boundaries insert a `\n` separator so a regex cannot match across paragraphs:

```ts
const SEPARATOR = "\n";

export function findSearchMatches(
  doc: ProseMirrorNode,
  regex: RegExp | null,
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  if (!regex) return matches;

  let text = "";
  const positionMap: number[] = [];

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let index = 0; index < node.text.length; index += 1) {
        positionMap[text.length + index] = pos + index;
      }
      text += node.text;
    } else if (node.isBlock && text.length > 0 && text[text.length - 1] !== SEPARATOR) {
      positionMap[text.length] = pos;
      text += SEPARATOR;
    }
    return true;
  });

  regex.lastIndex = 0;
  let result: RegExpExecArray | null;
  while ((result = regex.exec(text)) !== null) {
    if (result[0].length === 0) {
      regex.lastIndex += 1; // zero-width match: step forward or loop forever
      continue;
    }

    const start = result.index;
    const end = result.index + result[0].length;
    const from = positionMap[start];
    const to = positionMap[end - 1];
    if (from != null && to != null) {
      matches.push({ from, to: to + 1 });
    }
  }

  return matches;
}
```

Two subtleties worth keeping:

- **Zero-width matches** (regex like `a*`) must advance `lastIndex` manually
  or the loop never terminates.
- `to` is derived from the position of the **last matched character** plus
  one, not from `positionMap[end]` — the character after the match may sit in
  a different node (or not exist), so its mapped position would be wrong.

### Decorations and the plugin itself

Matches render as inline decorations; the current match gets a modifier class.
The plugin recomputes on two triggers: explicit metadata from the UI, and any
document change while a term is active:

```ts
function buildDecorations(
  doc: ProseMirrorNode,
  matches: SearchMatch[],
  current: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  const decorations = matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class:
        index === current
          ? "skriuw-search-match skriuw-search-match--current"
          : "skriuw-search-match",
    }),
  );
  return DecorationSet.create(doc, decorations);
}

function recompute(state: SearchState, doc: ProseMirrorNode): SearchState {
  const regex = buildRegex(state.term, state.options);
  const matches = findSearchMatches(doc, regex);
  let current = state.current;
  if (current >= matches.length) current = matches.length > 0 ? matches.length - 1 : 0;
  if (current < 0) current = 0;
  return {
    ...state,
    matches,
    current,
    decorations: buildDecorations(doc, matches, current),
  };
}

export function createSearchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init() {
        return {
          term: "",
          options: { ...defaultSearchOptions },
          matches: [],
          current: 0,
          decorations: DecorationSet.empty,
        };
      },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(searchPluginKey) as Partial<SearchState> | undefined;
        if (meta) {
          return recompute({ ...prev, ...meta }, newState.doc);
        }
        if (tr.docChanged && prev.term) {
          return recompute(prev, newState.doc);
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        return searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}
```

Register `createSearchPlugin()` in the editor's plugin list when creating the
`EditorState`.

### Commands

All commands are plain functions over the target. Search-state changes are
kept out of undo history; navigation wraps with a double-modulo so a negative
index wraps to the end:

```ts
export function getSearchState(view: EditorSearchTarget): SearchState | undefined {
  return searchPluginKey.getState(view.state);
}

function dispatchMeta(view: EditorSearchTarget, meta: Partial<SearchState>): void {
  const tr = view.state.tr.setMeta(searchPluginKey, meta);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

function scrollMatchIntoView(view: EditorSearchTarget, match: SearchMatch): void {
  if (view.revealPosition) {
    view.revealPosition(match.from);
    return;
  }
  try {
    const dom = view.domAtPos?.(match.from);
    if (!dom) return;
    const node = dom.node;
    const element = node instanceof Element ? node : node.parentElement;
    element?.scrollIntoView({ block: "center" });
  } catch {
    // domAtPos throws for positions outside the rendered window; the reveal
    // is best-effort, the match highlight is still correct.
  }
}

export function setSearch(view: EditorSearchTarget, term: string, options: SearchOptions): void {
  dispatchMeta(view, { term, options, current: 0 });
  const state = getSearchState(view);
  const match = state?.matches[state.current];
  if (match) {
    scrollMatchIntoView(view, match);
  }
}

export function clearSearch(view: EditorSearchTarget): void {
  dispatchMeta(view, { term: "", current: 0 });
}

export function goToMatch(view: EditorSearchTarget, index: number): void {
  const state = getSearchState(view);
  if (!state || state.matches.length === 0) return;
  const count = state.matches.length;
  const current = ((index % count) + count) % count;
  dispatchMeta(view, { current });
  const match = state.matches[current];
  if (match) {
    scrollMatchIntoView(view, match);
  }
}

export function nextMatch(view: EditorSearchTarget): void {
  const state = getSearchState(view);
  if (!state || state.matches.length === 0) return;
  goToMatch(view, state.current + 1);
}

export function previousMatch(view: EditorSearchTarget): void {
  const state = getSearchState(view);
  if (!state || state.matches.length === 0) return;
  goToMatch(view, state.current - 1);
}

export function replaceCurrent(view: EditorSearchTarget, replacement: string): void {
  const state = getSearchState(view);
  if (!state || state.matches.length === 0) return;
  const match = state.matches[state.current];
  if (!match) return;
  const tr = view.state.tr.insertText(replacement, match.from, match.to);
  view.dispatch(tr);
  const updated = getSearchState(view);
  const nextCurrent = updated?.matches[updated.current];
  if (nextCurrent) {
    scrollMatchIntoView(view, nextCurrent);
  }
  view.focus();
}

export function replaceAll(view: EditorSearchTarget, replacement: string): void {
  const state = getSearchState(view);
  if (!state || state.matches.length === 0) return;
  const tr = view.state.tr;
  for (let index = state.matches.length - 1; index >= 0; index -= 1) {
    const match = state.matches[index];
    if (match) {
      tr.insertText(replacement, match.from, match.to);
    }
  }
  view.dispatch(tr);
  view.focus();
}
```

Replace notes:

- `replaceCurrent` dispatches a **history-visible** transaction (no
  `addToHistory: false`), so it is undoable. The plugin's `docChanged` branch
  then recomputes matches, and because `recompute` clamps `current`, the
  selection naturally lands on the next remaining match.
- `replaceAll` applies all replacements **back to front** in one transaction —
  iterating forward would invalidate the positions of later matches, and one
  transaction means one undo step.

## 2. The React hook (`use-editor-search.ts`)

The hook owns everything the widget renders and encodes the open/close
semantics. It never holds the matches itself — `matchInfo` is copied out of
plugin state after each mutating call via `syncMatchInfo()`, keeping plugin
state the single source of truth.

Key decisions, then the code:

- `getView` is a **function**, not a captured view instance, because the
  editor view can be recreated (note switches, window remounts) while the
  panel stays open.
- `searchOpenRef` mirrors `searchOpen` so stable callbacks (`toggleSearch`,
  `resetSearch`) can read the latest value without re-subscribing shortcuts.
- `openSearch` is the single open path for both find and find-and-replace;
  re-arming the search only happens when the panel was closed, so opening
  replace over an open find panel keeps the query and current match.
- Focus goes through `requestAnimationFrame` because the input only mounts on
  the render triggered by `setSearchOpen(true)`.
- `regexError` is derived during render (`buildRegex(...) === null`), never
  synchronized state.
- The panel-scoped shortcuts (`escape`, option toggles) bind only while the
  panel is open, with `ignoreInputs: false` so they fire while typing in the
  find field, and unbind on close.

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildRegex,
  clearSearch,
  defaultSearchOptions,
  getSearchState,
  nextMatch,
  previousMatch,
  replaceAll,
  replaceCurrent,
  setSearch,
  type SearchOptions,
  type EditorSearchTarget,
} from "./search-plugin";

type EditorSearchOptions = {
  onBeforeOpen?: () => void;
};

export function useEditorSearch(
  getView: () => EditorSearchTarget | null,
  { onBeforeOpen }: EditorSearchOptions = {},
) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    ...defaultSearchOptions,
  });
  const [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;

  const regexError = useMemo(() => {
    if (!searchOptions.regex || searchQuery.length === 0) return false;
    return buildRegex(searchQuery, searchOptions) === null;
  }, [searchOptions, searchQuery]);

  const syncMatchInfo = useCallback(() => {
    const view = getView();
    if (!view) return;
    const state = getSearchState(view);
    setMatchInfo({
      current: state?.current ?? 0,
      total: state?.matches.length ?? 0,
    });
  }, [getView]);

  const performSearch = useCallback(
    (query: string, options: SearchOptions) => {
      const view = getView();
      if (!view) return;
      setSearch(view, query, options);
      syncMatchInfo();
    },
    [getView, syncMatchInfo],
  );

  const handleSearchQueryChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      performSearch(value, searchOptions);
    },
    [performSearch, searchOptions],
  );

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const openSearch = useCallback(
    (withReplace: boolean) => {
      const wasOpen = searchOpenRef.current;
      onBeforeOpen?.();
      setSearchOpen(true);
      if (withReplace) {
        setShowReplace(true);
      }
      focusSearchInput();
      if (wasOpen || !searchQuery) {
        return;
      }
      const view = getView();
      if (view) {
        setSearch(view, searchQuery, searchOptions);
      }
    },
    [focusSearchInput, getView, onBeforeOpen, searchOptions, searchQuery],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    const view = getView();
    if (view) {
      clearSearch(view);
      view.focus();
    }
  }, [getView]);

  const resetSearch = useCallback(() => {
    if (!searchOpenRef.current) return;
    setSearchOpen(false);
    const view = getView();
    if (view) {
      clearSearch(view);
    }
  }, [getView]);

  const toggleSearch = useCallback(() => {
    if (searchOpenRef.current) {
      closeSearch();
      return;
    }
    openSearch(false);
  }, [closeSearch, openSearch]);

  const showSearchAndReplace = useCallback(() => {
    openSearch(true);
  }, [openSearch]);

  const toggleSearchOption = useCallback(
    (key: keyof SearchOptions) => {
      const next = { ...searchOptions, [key]: !searchOptions[key] };
      setSearchOptions(next);
      performSearch(searchQuery, next);
    },
    [performSearch, searchOptions, searchQuery],
  );

  const handleNextMatch = useCallback(() => {
    const view = getView();
    if (!view) return;
    nextMatch(view);
    syncMatchInfo();
  }, [getView, syncMatchInfo]);

  const handlePreviousMatch = useCallback(() => {
    const view = getView();
    if (!view) return;
    previousMatch(view);
    syncMatchInfo();
  }, [getView, syncMatchInfo]);

  const handleReplaceCurrent = useCallback(() => {
    const view = getView();
    if (!view) return;
    replaceCurrent(view, replaceValue);
    syncMatchInfo();
  }, [getView, replaceValue, syncMatchInfo]);

  const handleReplaceAll = useCallback(() => {
    const view = getView();
    if (!view) return;
    replaceAll(view, replaceValue);
    syncMatchInfo();
  }, [getView, replaceValue, syncMatchInfo]);

  return {
    searchOpen,
    searchQuery,
    setSearchQuery: handleSearchQueryChange,
    replaceValue,
    setReplaceValue,
    showReplace,
    setShowReplace,
    searchOptions,
    toggleSearchOption,
    matchInfo,
    regexError,
    findInputRef,
    closeSearch,
    resetSearch,
    toggleSearch,
    showSearchAndReplace,
    syncMatchInfo,
    handleNextMatch,
    handlePreviousMatch,
    handleReplaceCurrent,
    handleReplaceAll,
  };
}
```

Skriuw's real hook additionally wires panel-open shortcuts through
`@remcostoeten/use-shortcut` (with user overrides from settings) and registers
the controller (§4). The portable equivalent, if you don't use that library:
while `searchOpen`, listen for `Escape` (close) and `alt+c`/`alt+w`/`alt+r`
(toggle `caseSensitive`/`wholeWord`/`regex`) at the document level, call
`preventDefault()`, and remove the listener when the panel closes.

## 3. The widget (`search-widget.tsx`)

A fully controlled component — no internal state except a generated id for the
status region. Layout: a chevron that expands the replace row, the find field
with the three option toggles embedded on its right edge, a live match
counter, prev/next/close buttons, and (when expanded) a mirrored replace row.

Accessibility contract, all of which should survive any restyle:

- Root is the semantic `<search>` element with an `aria-label`.
- The counter is `role="status"` + `aria-live="polite"` + `aria-atomic`, and
  the find input points at it via `aria-describedby` — screen readers hear
  "3 of 14" as you type.
- Invalid regex sets `aria-invalid` on the input and turns the counter and
  field border destructive.
- Option toggles use `aria-pressed`; the replace chevron uses `aria-expanded`.
- Every icon button has an `aria-label` including its shortcut.

```tsx
import { useId } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import type { SearchOptions } from "./search-plugin";

// Substitute your own: icon set, tooltip component, and `cn` class joiner.

type Props = {
  ref?: Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (value: string) => void;
  replaceValue: string;
  onReplaceChange: (value: string) => void;
  showReplace: boolean;
  onToggleReplace: () => void;
  options: SearchOptions;
  onToggleOption: (key: keyof SearchOptions) => void;
  current: number;
  total: number;
  regexError: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
};

const fieldClass =
  "flex min-w-0 flex-1 items-center rounded-md border border-border bg-background pl-2 transition-[border-color,box-shadow] duration-150 focus-within:border-ring";
const inputClass =
  "min-w-0 flex-1 bg-transparent py-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground";
const countClass =
  "min-w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground";

function IconButton({
  label,
  shortcut,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        active &&
          "bg-foreground/14 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.28)]",
      )}
    >
      {children}
    </button>
  );
}

export function SearchWidget({
  ref,
  query,
  onQueryChange,
  replaceValue,
  onReplaceChange,
  showReplace,
  onToggleReplace,
  options,
  onToggleOption,
  current,
  total,
  regexError,
  onNext,
  onPrevious,
  onClose,
  onReplaceCurrent,
  onReplaceAll,
}: Props) {
  const statusId = useId();
  const countLabel = regexError
    ? "Invalid regex"
    : query.length === 0
      ? ""
      : total === 0
        ? "No results"
        : `${current + 1} of ${total}`;
  const noMatches = total === 0;

  function handleFindKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function handleReplaceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onReplaceCurrent();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <search aria-label="Find and replace" className="flex w-full items-stretch gap-1">
      <button
        type="button"
        aria-label={showReplace ? "Hide replace" : "Show replace"}
        aria-expanded={showReplace}
        onClick={onToggleReplace}
        className="flex w-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 hover:text-foreground"
      >
        {showReplace ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1">
          <div
            className={cn(
              fieldClass,
              regexError &&
                "border-destructive shadow-[inset_0_0_0_1px_hsl(var(--destructive))]",
            )}
          >
            <input
              ref={ref}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={handleFindKeyDown}
              placeholder="Find"
              aria-label="Find"
              aria-invalid={regexError}
              aria-describedby={statusId}
              spellCheck={false}
              className={inputClass}
            />
            <div className="flex items-center gap-0.5 pl-1 pr-0.5">
              <IconButton
                label="Match case"
                shortcut="Alt+C"
                active={options.caseSensitive}
                onClick={() => onToggleOption("caseSensitive")}
              >
                <CaseSensitiveIcon size={16} />
              </IconButton>
              <IconButton
                label="Match whole word"
                shortcut="Alt+W"
                active={options.wholeWord}
                onClick={() => onToggleOption("wholeWord")}
              >
                <WholeWordIcon size={16} />
              </IconButton>
              <IconButton
                label="Use regular expression"
                shortcut="Alt+R"
                active={options.regex}
                onClick={() => onToggleOption("regex")}
              >
                <RegexIcon size={16} />
              </IconButton>
            </div>
          </div>

          <span
            id={statusId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(countClass, noMatches && query.length > 0 && "text-destructive")}
          >
            {countLabel}
          </span>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Previous match" shortcut="Shift+Enter" onClick={onPrevious} disabled={total === 0}>
              <ArrowUpIcon size={16} />
            </IconButton>
            <IconButton label="Next match" shortcut="Enter" onClick={onNext} disabled={total === 0}>
              <ArrowDownIcon size={16} />
            </IconButton>
            <IconButton label="Close" shortcut="Esc" onClick={onClose}>
              <CloseIcon size={16} />
            </IconButton>
          </div>
        </div>

        {showReplace ? (
          <div className="flex items-center gap-1">
            <div className={fieldClass}>
              <input
                value={replaceValue}
                onChange={(event) => onReplaceChange(event.target.value)}
                onKeyDown={handleReplaceKeyDown}
                placeholder="Replace"
                aria-label="Replace"
                spellCheck={false}
                className={inputClass}
              />
            </div>

            <span className={countClass} aria-hidden />

            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton label="Replace" shortcut="Enter" onClick={onReplaceCurrent} disabled={total === 0}>
                <ReplaceIcon size={16} />
              </IconButton>
              <IconButton label="Replace all" onClick={onReplaceAll} disabled={total === 0}>
                <ReplaceAllIcon size={16} />
              </IconButton>
              <span className="h-6 w-6" aria-hidden />
            </div>
          </div>
        ) : null}
      </div>
    </search>
  );
}
```

The trailing empty `<span className="h-6 w-6" aria-hidden />` in the replace
row reserves the width of the close button so the replace buttons align in a
column with prev/next above them.

## 4. The controller bridge (`search-controller.ts`)

Global commands (palette entries, app-level `mod+f`) live outside the editor
tree, so they can't call the hook. A tiny module-level registration bridges
the two without context or a store:

```ts
export type EditorSearchController = {
  open: () => void;
  openReplace: () => void;
};

let controller: EditorSearchController | null = null;

export function registerEditorSearchController(next: EditorSearchController): () => void {
  controller = next;
  return () => {
    if (controller === next) {
      controller = null;
    }
  };
}

/** Toggles the find panel: opens it when closed, closes it when open. */
export function openEditorSearch(): void {
  controller?.open();
}

/**
 * Opens the same panel as `openEditorSearch` with the replace row expanded.
 * Never closes an open panel — a find-only panel expands in place.
 */
export function openEditorSearchAndReplace(): void {
  controller?.openReplace();
}
```

The hook registers itself in an effect:

```ts
useEffect(
  () =>
    registerEditorSearchController({
      open: toggleSearch,
      openReplace: showSearchAndReplace,
    }),
  [toggleSearch, showSearchAndReplace],
);
```

The identity guard in the deregister callback matters: with two editors
mounted (split view), an unmounting editor must not clear a registration a
newer editor already replaced.

## 5. Wiring it into the editor

1. Add `createSearchPlugin()` to the editor's plugins.
2. Call the hook with a getter for the current view:

   ```ts
   const getEditorSearchTarget = useCallback(() => viewRef.current, []);
   const search = useEditorSearch(getEditorSearchTarget, {
     onBeforeOpen: dismissOtherUtilityPanels,
   });
   ```

3. Render `<SearchWidget ref={search.findInputRef} … />` conditionally on
   `search.searchOpen`, in a bar anchored to the top of the editor pane
   (Skriuw portals it into the pane header and animates it with a 140ms
   layout transition, skipped under reduced motion).
4. Bind `mod+f` → `openEditorSearch()` and `mod+h` (or your choice) →
   `openEditorSearchAndReplace()`. In Skriuw the binding is scoped: it only
   fires when focus is inside the editor pane (tracked with `focusin`/
   `focusout` listeners checking `document.activeElement.closest(".editor-pane")`),
   with `worksWhileTyping: true` so it also fires from inside ProseMirror.
   Call `preventDefault()` to suppress the browser's native find.
5. When switching notes or opening a competing panel (e.g. jump-to-line),
   call `search.resetSearch()` — it closes without stealing focus back.

## 6. Highlight CSS

```css
.skriuw-search-match {
  background-color: hsl(var(--favorite) / 0.24);
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px hsl(var(--favorite) / 0.38);
}

.skriuw-search-match--current {
  background-color: hsl(var(--favorite) / 0.42);
  box-shadow: inset 0 0 0 1px hsl(var(--favorite) / 0.6);
}
```

Any yellow/amber token works; the inset box-shadow (instead of a border)
avoids shifting text layout.

## Gotchas checklist

- [ ] Zero-width regex matches must advance `lastIndex` manually.
- [ ] Map `to` from the last matched character + 1, never from the character after the match.
- [ ] Insert a separator between blocks so matches can't span paragraphs.
- [ ] Flag search transactions `addToHistory: false`; leave replace transactions history-visible.
- [ ] Replace-all back to front, in a single transaction.
- [ ] Wrap navigation with `((i % n) + n) % n` so previous-from-first lands on the last match.
- [ ] `buildRegex` returns `null` on invalid input; derive the error state during render.
- [ ] Pass a view *getter* into the hook; the view instance is not stable.
- [ ] Focus the input inside `requestAnimationFrame` — it doesn't exist until the open render commits.
- [ ] Re-opening with replace must not reset an already-open panel's query or current match.
- [ ] `mod+f` on an open panel closes it and returns focus to the editor.
- [ ] Guard controller deregistration by identity for split-view/multiple editors.
