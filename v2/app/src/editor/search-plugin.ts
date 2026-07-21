import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
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

const SEPARATOR = "\n";

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

function getMatches(doc: ProseMirrorNode, regex: RegExp | null): SearchMatch[] {
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
      regex.lastIndex += 1;
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
  const matches = getMatches(doc, regex);
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

export function getSearchState(view: EditorView): SearchState | undefined {
  return searchPluginKey.getState(view.state);
}

function dispatchMeta(view: EditorView, meta: Partial<SearchState>): void {
  const tr = view.state.tr.setMeta(searchPluginKey, meta);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

function scrollMatchIntoView(view: EditorView, match: SearchMatch): void {
  try {
    const dom = view.domAtPos(match.from);
    const node = dom.node;
    const element = node instanceof Element ? node : node.parentElement;
    element?.scrollIntoView({ block: "center" });
  } catch {}
}

export function setSearch(view: EditorView, term: string, options: SearchOptions): void {
  dispatchMeta(view, { term, options, current: 0 });
  const state = getSearchState(view);
  const match = state?.matches[state.current];
  if (match) {
    scrollMatchIntoView(view, match);
  }
}

export function clearSearch(view: EditorView): void {
  dispatchMeta(view, { term: "", current: 0 });
}

export function goToMatch(view: EditorView, index: number): void {
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

export function nextMatch(view: EditorView): void {
  const state = getSearchState(view);
  if (!state || state.matches.length === 0) return;
  goToMatch(view, state.current + 1);
}

export function previousMatch(view: EditorView): void {
  const state = getSearchState(view);
  if (!state || state.matches.length === 0) return;
  goToMatch(view, state.current - 1);
}

export function replaceCurrent(view: EditorView, replacement: string): void {
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

export function replaceAll(view: EditorView, replacement: string): void {
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
