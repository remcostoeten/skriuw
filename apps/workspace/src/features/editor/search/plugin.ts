import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { noop } from "@skriuw/shared/helpers/noop";
import { changedRanges } from "../changed-ranges";

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

export type EditorSearchTarget = {
  readonly state: EditorState;
  dispatch(transaction: Transaction): void;
  focus(): void;
  domAtPos?(position: number): ReturnType<EditorView["domAtPos"]>;
  revealPosition?(position: number): void;
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

export function findSearchMatches(doc: ProseMirrorNode, regex: RegExp | null): SearchMatch[] {
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

const MATCH_CLASS = "skriuw-search-match";
const CURRENT_MATCH_CLASS = "skriuw-search-match skriuw-search-match--current";

type MatchSpec = { current: boolean };

function matchDecoration(match: SearchMatch, current: boolean): Decoration {
  const spec: MatchSpec = { current };
  return Decoration.inline(
    match.from,
    match.to,
    { class: current ? CURRENT_MATCH_CLASS : MATCH_CLASS },
    spec,
  );
}

function isCurrentSpec(spec: { current?: unknown }): boolean {
  return spec.current === true;
}

function buildDecorations(
  doc: ProseMirrorNode,
  matches: SearchMatch[],
  current: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((match, index) => matchDecoration(match, index === current)),
  );
}

/**
 * Moving the current match swaps two decorations instead of rebuilding the
 * set: the one painted as current near `previous` turns plain and `target`
 * turns current.
 */
function moveCurrentDecoration(
  set: DecorationSet,
  doc: ProseMirrorNode,
  previous: SearchMatch | undefined,
  target: SearchMatch | undefined,
): DecorationSet {
  let painted = previous ? set.find(previous.from, previous.to, isCurrentSpec) : [];
  if (previous && painted.length === 0) painted = set.find(undefined, undefined, isCurrentSpec);
  if (
    target &&
    painted.length === 1 &&
    painted[0]?.from === target.from &&
    painted[0]?.to === target.to
  ) {
    return set;
  }
  // DecorationSet.remove nulls out the entries of the array it is given.
  let next = set.remove([...painted]);
  next = next.add(
    doc,
    painted.map((decoration) => matchDecoration(decoration, false)),
  );
  if (!target) return next;
  const plain = next
    .find(target.from, target.to)
    .filter((decoration) => decoration.from === target.from && decoration.to === target.to);
  return next.remove(plain).add(doc, [matchDecoration(target, true)]);
}

function recompute(state: SearchState, doc: ProseMirrorNode): SearchState {
  const regex = buildRegex(state.term, state.options);
  return withMatches(state, doc, findSearchMatches(doc, regex));
}

function clampCurrent(current: number, count: number): number {
  if (current >= count) return count > 0 ? count - 1 : 0;
  return Math.max(current, 0);
}

function withMatches(
  state: SearchState,
  doc: ProseMirrorNode,
  matches: SearchMatch[],
): SearchState {
  const current = clampCurrent(state.current, matches.length);
  return {
    ...state,
    matches,
    current,
    decorations: buildDecorations(doc, matches, current),
  };
}

function canSearchIncrementally(state: SearchState): boolean {
  return !state.options.regex && !state.term.includes(SEPARATOR);
}

function searchTextblock(node: ProseMirrorNode, pos: number, regex: RegExp): SearchMatch[] {
  return findSearchMatches(node, regex).map((match) => ({
    from: match.from + pos + 1,
    to: match.to + pos + 1,
  }));
}

type Textblock = { node: ProseMirrorNode; pos: number };

function touchedTextblocks(tr: Transaction): Textblock[] {
  const { doc } = tr;
  const size = doc.content.size;
  const seen = new Set<number>();
  const blocks: Textblock[] = [];
  for (const range of changedRanges(tr)) {
    doc.nodesBetween(Math.max(0, range.from - 1), Math.min(size, range.to + 1), (node, pos) => {
      if (!node.isTextblock) return node.isBlock;
      if (!seen.has(pos)) {
        seen.add(pos);
        blocks.push({ node, pos });
      }
      return false;
    });
  }
  return blocks;
}

function mapMatches(matches: readonly SearchMatch[], tr: Transaction): SearchMatch[] {
  const mapped: SearchMatch[] = [];
  for (const match of matches) {
    const from = tr.mapping.mapResult(match.from, 1);
    const to = tr.mapping.mapResult(match.to, -1);
    if (from.deleted || to.deleted || from.pos >= to.pos) continue;
    mapped.push({ from: from.pos, to: to.pos });
  }
  return mapped;
}

function mapMatch(match: SearchMatch | undefined, tr: Transaction): SearchMatch | undefined {
  return match ? mapMatches([match], tr)[0] : undefined;
}

function rescanChanged(state: SearchState, tr: Transaction): SearchState {
  const regex = buildRegex(state.term, state.options);
  if (!regex) return withMatches(state, tr.doc, []);
  const { doc } = tr;
  const blocks = touchedTextblocks(tr);
  function inTouchedBlock(match: SearchMatch): boolean {
    return blocks.some(({ node, pos }) => match.from < pos + node.nodeSize && match.to > pos);
  }
  const matches = mapMatches(state.matches, tr).filter((match) => !inTouchedBlock(match));
  const found: SearchMatch[] = [];
  for (const { node, pos } of blocks) found.push(...searchTextblock(node, pos, regex));
  matches.push(...found);
  matches.sort((left, right) => left.from - right.from);
  let decorations = state.decorations.map(tr.mapping, doc);
  for (const { node, pos } of blocks) {
    decorations = decorations.remove(decorations.find(pos + 1, pos + node.nodeSize - 1));
  }
  decorations = decorations.add(
    doc,
    found.map((match) => matchDecoration(match, false)),
  );
  const current = clampCurrent(state.current, matches.length);
  const previous = mapMatch(state.matches[state.current], tr);
  return {
    ...state,
    matches,
    current,
    decorations: moveCurrentDecoration(
      decorations,
      doc,
      previous && !inTouchedBlock(previous) ? previous : undefined,
      matches[current],
    ),
  };
}

function sameOptions(left: SearchOptions, right: SearchOptions): boolean {
  return (
    left.caseSensitive === right.caseSensitive &&
    left.wholeWord === right.wholeWord &&
    left.regex === right.regex
  );
}

function movesCurrentOnly(previous: SearchState, meta: Partial<SearchState>): boolean {
  return (
    previous.term !== "" &&
    meta.matches === undefined &&
    meta.decorations === undefined &&
    (meta.term === undefined || meta.term === previous.term) &&
    (meta.options === undefined || sameOptions(meta.options, previous.options))
  );
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
        if (meta && !tr.docChanged && movesCurrentOnly(prev, meta)) {
          const current = clampCurrent(meta.current ?? prev.current, prev.matches.length);
          if (current === prev.current) return prev;
          return {
            ...prev,
            current,
            decorations: moveCurrentDecoration(
              prev.decorations,
              newState.doc,
              prev.matches[prev.current],
              prev.matches[current],
            ),
          };
        }
        if (meta) {
          return recompute({ ...prev, ...meta }, newState.doc);
        }
        if (tr.docChanged && prev.term) {
          return canSearchIncrementally(prev)
            ? rescanChanged(prev, tr)
            : recompute(prev, newState.doc);
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

/**
 * @name followSearchDocument
 * @description Brings a standalone search state to `document` with one
 * history-free replace of the range that differs, so the search plugin
 * rescans only the blocks that changed and keeps its term, options and
 * current match. Returns null when the change cannot be expressed that way.
 *
 * @example
 * entry.searchState = followSearchDocument(entry.searchState, bounded.fullDocument()) ?? rebuilt();
 */
export function followSearchDocument(
  state: EditorState,
  document: ProseMirrorNode,
): EditorState | null {
  if (state.doc === document) return state;
  if (!state.doc.sameMarkup(document)) return null;
  const start = state.doc.content.findDiffStart(document.content);
  if (start === null) return state;
  const end = state.doc.content.findDiffEnd(document.content);
  if (!end) return null;
  let endA = end.a;
  let endB = end.b;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  const tr = state.tr.replace(start, endA, document.slice(start, endB));
  tr.setMeta("addToHistory", false);
  return tr.doc.eq(document) ? state.apply(tr) : null;
}

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
    noop();
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
