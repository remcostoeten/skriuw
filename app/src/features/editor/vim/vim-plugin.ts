import { redo, undo } from "prosemirror-history";
import { chainCommands } from "prosemirror-commands";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import {
  buildRegex,
  clearSearch,
  getSearchState,
  goToMatch,
  setSearch,
  type EditorSearchTarget,
} from "../search-plugin";
import { productSchema } from "../schema";
import { vimKeyFromEvent, keyToCharacter, type VimKeyEvent } from "./vim-keys";
import {
  hasCharacterAt,
  lastCursorIndex,
  lineAbove,
  lineAt,
  lineOffset,
  lineStep,
  positionAt,
  contiguousText,
  allLines,
  type VimLine,
} from "./vim-lines";
import {
  resolveMotion,
  resolveTextObject,
  type LastFind,
  type MotionContext,
  type MotionTarget,
  type SearchRequest,
} from "./vim-motions";
import {
  adjustNumber,
  changeCase,
  clearLinesForChange,
  deleteRange,
  joinLines,
  putRegister,
  replaceCharacters,
  yankRange,
  type CaseChange,
  type OperatorRange,
} from "./vim-operators";
import { describePendingKeys, parseVimKeys, type VimCommand, type VimMotion, type VimOperator } from "./vim-parser";
import { stepDisplayRow, type RowRect } from "./vim-rows";
import {
  isClipboardRegister,
  readRegister,
  textRegister,
  writeRegister,
  type ClipboardBridge,
} from "./vim-registers";
import { firstNonBlank, numberAtOrAfter } from "./vim-text";

export type VimMode = "normal" | "insert" | "visual" | "visual-line";

/**
 * What the editor host lends the plugin. Everything that touches the bounded
 * window, the save pipeline, or note identity stays with the host so the
 * plugin itself only ever sees an EditorState.
 */
export type VimHost = {
  enabled(): boolean;
  /** Identity of the open note; a change resets pending keys and prompts. */
  noteKey(): string | null;
  /** `u` / `ctrl-r`. Returning false falls back to ProseMirror history. */
  undo(view: EditorView): boolean;
  redo(view: EditorView): boolean;
  /** `:w`, `:wq`, `ZZ`. */
  write(): void;
  /** `:q`. */
  quit(): void;
  /** `:N`, `NG`, `Ngg`: one-based Markdown line. */
  jumpToLine(line: number): void;
  /** `gg` / `G` in a bounded note: returns true after moving the window and caret. */
  documentEdge(edge: "start" | "end"): boolean;
  /** `j` / `k` at the edge of a bounded window: returns true after shifting it. */
  windowStep(direction: 1 | -1): boolean;
  scrollContainer(view: EditorView): HTMLElement | null;
  clipboard: ClipboardBridge;
};

type VimPluginState = {
  mode: VimMode;
  visualAnchor: number;
  visualHead: number;
  /** False until the first Vim transaction, so a state built while Vim was off still opens in normal mode. */
  initialized: boolean;
};

type VimMeta = Partial<Pick<VimPluginState, "mode" | "visualAnchor" | "visualHead">>;

type ReplayToken = { kind: "key"; key: string } | { kind: "text"; text: string };

type Prompt = { prefix: ":" | "/" | "?"; text: string; pendingKeys: string[] };

type VimSession = {
  keys: string[];
  prompt: Prompt | null;
  noteKey: string | null;
  macro: { register: string; tokens: ReplayToken[] } | null;
  insertCapture: ReplayToken[] | null;
  replaying: boolean;
  countOverride: number | null;
  message: string | null;
  desiredColumn: number | null;
  /** Screen x that display-row `j`/`k` return to; cleared with `desiredColumn`. */
  desiredX: number | null;
  lastVisual: { anchor: number; head: number; linewise: boolean } | null;
};

type LastChange = { keys: string[]; insertTokens: ReplayToken[] | null };

export const vimPluginKey = new PluginKey<VimPluginState>("skriuw-vim");

const VIM_CONTROL_KEYS = new Set(["<C-r>", "<C-d>", "<C-u>", "<C-f>", "<C-b>", "<C-a>", "<C-x>", "<Esc>"]);
const ROW_DOWN_KEYS = new Set(["j", "gj", "<Down>"]);
const ROW_UP_KEYS = new Set(["k", "gk", "<Up>"]);
const INSERT_RECORDED_KEYS = new Set(["<CR>", "<BS>", "<Tab>", "<Del>", "<Left>", "<Right>", "<Up>", "<Down>"]);
const DOM_KEY_NAMES: Record<string, { key: string; keyCode: number }> = {
  "<CR>": { key: "Enter", keyCode: 13 },
  "<BS>": { key: "Backspace", keyCode: 8 },
  "<Tab>": { key: "Tab", keyCode: 9 },
  "<Del>": { key: "Delete", keyCode: 46 },
  "<Left>": { key: "ArrowLeft", keyCode: 37 },
  "<Right>": { key: "ArrowRight", keyCode: 39 },
  "<Up>": { key: "ArrowUp", keyCode: 38 },
  "<Down>": { key: "ArrowDown", keyCode: 40 },
};

const shared = {
  lastFind: null as LastFind | null,
  lastSearch: null as { pattern: string; backward: boolean; wholeWord: boolean } | null,
  lastChange: null as LastChange | null,
  macros: new Map<string, ReplayToken[]>(),
  lastMacro: null as string | null,
};

const INITIAL_STATE: VimPluginState = {
  mode: "normal",
  visualAnchor: 0,
  visualHead: 0,
  initialized: false,
};

function pluginState(state: EditorState): VimPluginState {
  return vimPluginKey.getState(state) ?? INITIAL_STATE;
}

/** The mode the editor is effectively in: insert whenever Vim is off. */
export function vimModeOf(state: EditorState, enabled: boolean): VimMode {
  if (!enabled) return "insert";
  const current = pluginState(state);
  return current.initialized ? current.mode : "normal";
}

export function isVimVisual(state: EditorState, enabled: boolean): boolean {
  const mode = vimModeOf(state, enabled);
  return mode === "visual" || mode === "visual-line";
}

/** Re-applies a previous state's mode to a rebuilt state, e.g. after a bounded window move. */
export function carryVimState(previous: EditorState, next: EditorState): EditorState {
  const before = vimPluginKey.getState(previous);
  if (!before || !before.initialized) return next;
  return next.apply(
    next.tr.setMeta(vimPluginKey, { mode: before.mode === "insert" ? "insert" : "normal" } satisfies VimMeta),
  );
}

/** Flips the mode when the setting changes so the active note repaints immediately. */
export function setVimEnabled(view: EditorView, enabled: boolean): void {
  const meta: VimMeta = { mode: enabled ? "normal" : "insert" };
  view.dispatch(view.state.tr.setMeta(vimPluginKey, meta).setMeta("addToHistory", false));
}

function modeLabel(mode: VimMode): string {
  return mode === "visual-line" ? "visual line" : mode;
}

function clampNormalCursor(state: EditorState): number | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const line = lineAt(state.doc, selection.head);
  if (!line) return null;
  const column = lineOffset(line, selection.head);
  if (column >= line.text.length && line.text.length > 0) {
    return positionAt(line, line.text.length - 1);
  }
  return null;
}

function visualSelection(doc: EditorState["doc"], anchor: number, head: number, linewise: boolean): TextSelection {
  const size = doc.content.size;
  const clampedAnchor = Math.max(0, Math.min(anchor, size));
  const clampedHead = Math.max(0, Math.min(head, size));
  if (linewise) {
    const first = lineAt(doc, Math.min(clampedAnchor, clampedHead));
    const last = lineAt(doc, Math.max(clampedAnchor, clampedHead));
    if (first && last) {
      return clampedHead >= clampedAnchor
        ? TextSelection.create(doc, first.start, last.end)
        : TextSelection.create(doc, last.end, first.start);
    }
  }
  const pastChar = (pos: number) => {
    const line = lineAt(doc, pos);
    if (!line) return pos;
    const column = lineOffset(line, pos);
    return hasCharacterAt(line, column) ? positionAt(line, column + 1) : pos;
  };
  if (clampedHead >= clampedAnchor) {
    return TextSelection.create(doc, clampedAnchor, pastChar(clampedHead));
  }
  return TextSelection.create(doc, pastChar(clampedAnchor), clampedHead);
}

function cursorOf(state: EditorState, vim: VimPluginState, mode: VimMode): number {
  return mode === "visual" || mode === "visual-line" ? vim.visualHead : state.selection.head;
}

function scrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY)) return current;
    current = current.parentElement;
  }
  return null;
}

function domEventForKey(key: string): VimKeyEvent & { keyCode: number; preventDefault(): void } {
  const named = DOM_KEY_NAMES[key];
  return {
    key: named?.key ?? key,
    keyCode: named?.keyCode ?? 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: () => undefined,
  };
}

function buildSearchOptions(pattern: string, wholeWord: boolean) {
  const options = { caseSensitive: /\p{Lu}/u.test(pattern), wholeWord, regex: true };
  if (!buildRegex(pattern, options)) options.regex = false;
  return options;
}

/**
 * Modal Vim editing for the block editor. The plugin owns only modal state and
 * a small per-view session; every edit is an ordinary ProseMirror transaction,
 * so history, the schema, remote merges, and the save pipeline stay in charge.
 * Register it ahead of the product keymaps: in normal mode it swallows keys
 * before they can type.
 */
export function createVimPlugin(host: VimHost): Plugin<VimPluginState> {
  const session: VimSession = {
    keys: [],
    prompt: null,
    noteKey: null,
    macro: null,
    insertCapture: null,
    replaying: false,
    countOverride: null,
    message: null,
    desiredColumn: null,
    desiredX: null,
    lastVisual: null,
  };
  let statusElement: HTMLElement | null = null;
  let render: () => void = () => undefined;

  function meta(tr: Transaction, change: VimMeta = {}): Transaction {
    return tr.setMeta(vimPluginKey, change);
  }

  function mode(state: EditorState): VimMode {
    return vimModeOf(state, host.enabled());
  }

  function dispatchCursor(view: EditorView, pos: number, change: VimMeta = {}): void {
    const clamped = Math.max(0, Math.min(pos, view.state.doc.content.size));
    view.dispatch(
      meta(view.state.tr.setSelection(TextSelection.create(view.state.doc, clamped)), change).scrollIntoView(),
    );
  }

  function enterInsert(view: EditorView, pos: number, keys: readonly string[]): void {
    dispatchCursor(view, pos, { mode: "insert" });
    if (!session.replaying) {
      const tokens: ReplayToken[] = [];
      shared.lastChange = { keys: [...keys], insertTokens: tokens };
      session.insertCapture = tokens;
    }
  }

  function exitInsert(view: EditorView): void {
    const line = lineAt(view.state.doc, view.state.selection.head);
    const column = line ? lineOffset(line, view.state.selection.head) : 0;
    const pos = line && column > 0 ? positionAt(line, column - 1) : view.state.selection.head;
    session.insertCapture = null;
    forgetColumn();
    dispatchCursor(view, pos, { mode: "normal" });
  }

  function enterVisual(view: EditorView, anchor: number, head: number, linewise: boolean): void {
    const selection = visualSelection(view.state.doc, anchor, head, linewise);
    view.dispatch(
      meta(view.state.tr.setSelection(selection), {
        mode: linewise ? "visual-line" : "visual",
        visualAnchor: anchor,
        visualHead: head,
      }).scrollIntoView(),
    );
  }

  function leaveVisual(view: EditorView, cursor: number): void {
    const vim = pluginState(view.state);
    session.lastVisual = {
      anchor: vim.visualAnchor,
      head: vim.visualHead,
      linewise: mode(view.state) === "visual-line",
    };
    dispatchCursor(view, cursor, { mode: "normal" });
  }

  function recordChange(keys: readonly string[]): void {
    if (session.replaying) return;
    shared.lastChange = { keys: [...keys], insertTokens: null };
  }

  function searchPosition(view: EditorView, request: SearchRequest): number | null {
    const target: EditorSearchTarget = view;
    const options = buildSearchOptions(request.pattern, request.wholeWord);
    const current = getSearchState(target);
    if (!current || current.term !== request.pattern || current.options.wholeWord !== options.wholeWord) {
      setSearch(target, request.pattern, options);
    }
    const state = getSearchState(target);
    if (!state || state.matches.length === 0) return null;
    let index = -1;
    if (request.backward) {
      for (let at = state.matches.length - 1; at >= 0; at -= 1) {
        if (state.matches[at]!.from < request.from) {
          index = at;
          break;
        }
      }
      if (index === -1) index = state.matches.length - 1;
    } else {
      index = state.matches.findIndex((match) => match.from > request.from);
      if (index === -1) index = 0;
    }
    goToMatch(target, index);
    return state.matches[index]?.from ?? null;
  }

  function motionContext(view: EditorView, cursor: number, count: number | null, operatorPending: boolean, changeOperator: boolean): MotionContext {
    const container = host.scrollContainer(view);
    const pageLines = container ? Math.max(5, Math.floor(container.clientHeight / 28)) : 20;
    return {
      doc: view.state.doc,
      cursor,
      count,
      operatorPending,
      changeOperator,
      desiredColumn: session.desiredColumn,
      lastFind: shared.lastFind,
      pageLines,
      search: (request) => searchPosition(view, request),
      lastSearch: shared.lastSearch,
    };
  }

  function forgetColumn(): void {
    session.desiredColumn = null;
    session.desiredX = null;
  }

  function rememberMotion(target: MotionTarget): void {
    if (target.lastFind) shared.lastFind = target.lastFind;
    if (target.lastSearch) shared.lastSearch = target.lastSearch;
    if (target.keepColumn) return;
    session.desiredColumn = target.desiredColumn;
    session.desiredX = null;
  }

  function measureRow(view: EditorView, pos: number): RowRect | null {
    try {
      const coords = view.coordsAtPos(pos);
      return { left: coords.left, top: coords.top, bottom: coords.bottom };
    } catch {
      return null;
    }
  }

  /** `j`/`k` over the rows the view wrapped; null hands over to logical line stepping. */
  function displayRowTarget(view: EditorView, cursor: number, motion: VimMotion, count: number | null): number | null {
    if (motion.kind !== "simple") return null;
    const down = ROW_DOWN_KEYS.has(motion.key);
    if (!down && !ROW_UP_KEYS.has(motion.key)) return null;
    if (typeof view.coordsAtPos !== "function") return null;
    const goalX = session.desiredColumn === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : session.desiredX;
    const stepped = stepDisplayRow(view.state.doc, (pos) => measureRow(view, pos), cursor, down ? 1 : -1, count ?? 1, goalX);
    if (!stepped) return null;
    session.desiredX = stepped.x;
    return stepped.pos;
  }

  function moveToFirstNonBlank(view: EditorView, change: VimMeta): void {
    const line = lineAt(view.state.doc, view.state.selection.head);
    if (!line) return;
    dispatchCursor(view, positionAt(line, firstNonBlank(line.text)), change);
  }

  function runMotion(view: EditorView, motion: VimMotion, count: number | null): void {
    const current = mode(view.state);
    const vim = pluginState(view.state);
    const inVisual = current === "visual" || current === "visual-line";
    const cursor = cursorOf(view.state, vim, current);
    if (motion.kind === "textobject") {
      if (!inVisual) return;
      const range = resolveTextObject(view.state.doc, cursor, motion, count);
      if (!range) return;
      const linewise = range.linewise || current === "visual-line";
      enterVisual(view, range.from, Math.max(range.from, range.to - 1), linewise);
      return;
    }
    if (motion.kind === "simple" && (motion.key === "G" || motion.key === "gg") && count !== null) {
      host.jumpToLine(count);
      return;
    }
    if (!lineAt(view.state.doc, cursor)) {
      const $cursor = view.state.doc.resolve(cursor);
      const nearest = TextSelection.near($cursor, motion.kind === "simple" && (motion.key === "k" || motion.key === "<Up>") ? -1 : 1);
      if (nearest.head !== cursor) dispatchCursor(view, nearest.head);
      return;
    }
    const rowTarget = displayRowTarget(view, cursor, motion, count);
    if (rowTarget !== null) {
      if (inVisual) enterVisual(view, vim.visualAnchor, rowTarget, current === "visual-line");
      else dispatchCursor(view, rowTarget);
      return;
    }
    const target = resolveMotion(motionContext(view, cursor, count, false, false), motion);
    if (!target) return;
    rememberMotion(target);
    if (target.edge && target.pos === cursor) {
      if (motion.kind === "simple" && (motion.key === "G" || motion.key === "gg")) {
        if (host.documentEdge(target.edge)) moveToFirstNonBlank(view, {});
        return;
      }
      if (!inVisual) host.windowStep(target.edge === "end" ? 1 : -1);
      return;
    }
    if (motion.kind === "simple" && (motion.key === "G" || motion.key === "gg") && host.documentEdge(target.edge ?? "end")) {
      moveToFirstNonBlank(view, {});
      return;
    }
    if (inVisual) {
      enterVisual(view, vim.visualAnchor, target.pos, current === "visual-line");
      return;
    }
    dispatchCursor(view, target.pos);
  }

  function operatorRange(view: EditorView, command: Extract<VimCommand, { type: "operator" }>, count: number | null): OperatorRange | null {
    const cursor = view.state.selection.head;
    if (command.motion === null) {
      const line = lineAt(view.state.doc, cursor);
      if (!line) return null;
      const stepped = lineStep(view.state.doc, line, 1, (count ?? 1) - 1);
      return { from: line.start, to: stepped.line.end, linewise: true };
    }
    if (command.motion.kind === "textobject") {
      return resolveTextObject(view.state.doc, cursor, command.motion, count);
    }
    if (command.motion.kind === "simple" && (command.motion.key === "G" || command.motion.key === "gg") && count !== null) {
      return null;
    }
    const target = resolveMotion(
      motionContext(view, cursor, count, true, command.operator === "c"),
      command.motion,
    );
    if (!target || (target.edge && target.pos === cursor)) return null;
    rememberMotion(target);
    if (target.linewise) {
      return { from: Math.min(cursor, target.pos), to: Math.max(cursor, target.pos), linewise: true };
    }
    let from = Math.min(cursor, target.pos);
    let to = Math.max(cursor, target.pos);
    if (target.inclusive) {
      const line = lineAt(view.state.doc, to);
      if (line && hasCharacterAt(line, lineOffset(line, to))) to = positionAt(line, lineOffset(line, to) + 1);
    }
    if (from === to) return null;
    return { from, to, linewise: false };
  }

  function applyOperator(
    view: EditorView,
    operator: VimOperator,
    range: OperatorRange,
    register: string | null,
    keys: readonly string[],
    fromVisual: boolean,
  ): void {
    const { state } = view;
    const clipboard = host.clipboard;
    const finish = (tr: Transaction, cursor: number, nextMode: VimMode = "normal") => {
      view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, Math.max(0, Math.min(cursor, tr.doc.content.size)))), { mode: nextMode }).scrollIntoView());
    };
    if (fromVisual) {
      const vim = pluginState(state);
      session.lastVisual = { anchor: vim.visualAnchor, head: vim.visualHead, linewise: range.linewise };
    }
    switch (operator) {
      case "y": {
        yankRange(state.doc, range, register, { yank: true, clipboard });
        finish(state.tr, range.linewise && !fromVisual ? state.selection.head : range.from);
        return;
      }
      case "d": {
        yankRange(state.doc, range, register, { yank: false, clipboard });
        const tr = state.tr;
        const cursor = deleteRange(tr, range);
        recordChange(keys);
        finish(tr, cursor);
        return;
      }
      case "c": {
        yankRange(state.doc, range, register, { yank: false, clipboard });
        const tr = state.tr;
        const cursor = range.linewise ? clearLinesForChange(tr, range) : (tr.delete(range.from, range.to), range.from);
        view.dispatch(meta(tr, { mode: "insert" }));
        enterInsert(view, cursor, keys);
        return;
      }
      case ">":
      case "<": {
        const listItem = productSchema.nodes.list_item;
        const checkItem = productSchema.nodes.check_item;
        const toggleItem = productSchema.nodes.toggle_item;
        if (!listItem || !checkItem || !toggleItem) return;
        const command = operator === ">"
          ? chainCommands(sinkListItem(checkItem), sinkListItem(toggleItem), sinkListItem(listItem))
          : chainCommands(liftListItem(checkItem), liftListItem(toggleItem), liftListItem(listItem));
        const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)));
        let result: Transaction | null = null;
        const ran = command(selected, (tr) => {
          result = tr;
        });
        recordChange(keys);
        if (!ran || !result) {
          finish(state.tr, range.from);
          return;
        }
        const applied: Transaction = result;
        const mapped = applied.mapping.map(range.from);
        view.dispatch(meta(applied, { mode: "normal" }));
        moveToFirstNonBlank(view, {});
        if (mapped < 0) return;
        return;
      }
      case "g~":
      case "gu":
      case "gU": {
        const change: CaseChange = operator === "g~" ? "toggle" : operator === "gu" ? "lower" : "upper";
        const tr = state.tr;
        const cursor = changeCase(tr, range, change);
        recordChange(keys);
        finish(tr, cursor);
        return;
      }
      default:
        return;
    }
  }

  function visualRange(view: EditorView): OperatorRange {
    const vim = pluginState(view.state);
    const linewise = mode(view.state) === "visual-line";
    const from = Math.min(vim.visualAnchor, vim.visualHead);
    const head = Math.max(vim.visualAnchor, vim.visualHead);
    if (linewise) return { from, to: head, linewise: true };
    const line = lineAt(view.state.doc, head);
    const to = line && hasCharacterAt(line, lineOffset(line, head)) ? positionAt(line, lineOffset(line, head) + 1) : head;
    return { from, to, linewise: false };
  }

  function currentLineRange(view: EditorView, count: number | null): OperatorRange | null {
    const line = lineAt(view.state.doc, view.state.selection.head);
    if (!line) return null;
    const stepped = lineStep(view.state.doc, line, 1, (count ?? 1) - 1);
    return { from: line.start, to: stepped.line.end, linewise: true };
  }

  function put(view: EditorView, register: string | null, after: boolean, count: number, keys: readonly string[], cursorAfter: boolean): void {
    const apply = (content: ReturnType<typeof readRegister>) => {
      if (!content) return;
      const tr = view.state.tr;
      const cursor = putRegister(tr, view.state.selection.head, content, after, count);
      recordChange(keys);
      const finalCursor = cursorAfter ? Math.min(cursor + 1, tr.doc.content.size) : cursor;
      view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, finalCursor)), { mode: "normal" }).scrollIntoView());
    };
    if (isClipboardRegister(register)) {
      void host.clipboard.read().then((text) => {
        if (text.length > 0) apply(textRegister(text, text.includes("\n") && text.endsWith("\n")));
      });
      return;
    }
    apply(readRegister(register));
  }

  function runEditorKey(view: EditorView, key: string): boolean {
    const event = domEventForKey(key);
    const plugins = view.state.plugins;
    const start = plugins.indexOf(plugin) + 1;
    for (let index = start; index < plugins.length; index += 1) {
      const candidate = plugins[index];
      const handler = candidate?.props.handleKeyDown;
      if (candidate && handler && handler.call(candidate, view, event as unknown as KeyboardEvent)) return true;
    }
    return false;
  }

  function insertTypedText(view: EditorView, text: string): void {
    const { from, to } = view.state.selection;
    const plugins = view.state.plugins;
    const start = plugins.indexOf(plugin) + 1;
    const fallback = () => view.state.tr.insertText(text, from, to);
    for (let index = start; index < plugins.length; index += 1) {
      const candidate = plugins[index];
      const handler = candidate?.props.handleTextInput;
      if (candidate && handler && handler.call(candidate, view, from, to, text, fallback)) return;
    }
    view.dispatch(fallback());
  }

  function scrollCursor(view: EditorView, placement: "center" | "top" | "bottom"): void {
    if (typeof view.coordsAtPos !== "function" || typeof getComputedStyle !== "function") return;
    const container = host.scrollContainer(view) ?? scrollParent(view.dom);
    if (!container) return;
    const vim = pluginState(view.state);
    const cursor = cursorOf(view.state, vim, mode(view.state));
    const coords = view.coordsAtPos(cursor);
    const rect = container.getBoundingClientRect();
    const offset = coords.top - rect.top + container.scrollTop;
    const lineHeight = Math.max(16, coords.bottom - coords.top);
    const top =
      placement === "center"
        ? offset - container.clientHeight / 2 + lineHeight / 2
        : placement === "top"
          ? offset - 8
          : offset - container.clientHeight + lineHeight + 8;
    container.scrollTo({ top: Math.max(0, top) });
  }

  function openLineBelow(view: EditorView, keys: readonly string[]): void {
    const line = lineAt(view.state.doc, view.state.selection.head);
    if (!line) return;
    dispatchCursor(view, line.end, { mode: "insert" });
    runEditorKey(view, "<CR>");
    enterInsert(view, view.state.selection.head, keys);
  }

  function openLineAbove(view: EditorView, keys: readonly string[]): void {
    const line = lineAt(view.state.doc, view.state.selection.head);
    if (!line) return;
    dispatchCursor(view, line.start, { mode: "insert" });
    runEditorKey(view, "<CR>");
    const after = lineAt(view.state.doc, view.state.selection.head);
    const above = after ? lineAbove(view.state.doc, after) : null;
    enterInsert(view, above ? above.end : view.state.selection.head, keys);
  }

  function replayTokens(view: EditorView, tokens: readonly ReplayToken[]): void {
    for (const token of tokens) {
      if (token.kind === "text") {
        if (mode(view.state) === "insert") insertTypedText(view, token.text);
        continue;
      }
      if (mode(view.state) === "insert") {
        if (token.key === "<Esc>") exitInsert(view);
        else runEditorKey(view, token.key);
        continue;
      }
      feedKey(view, token.key);
    }
  }

  function repeatLastChange(view: EditorView, count: number | null): void {
    const change = shared.lastChange;
    if (!change || session.replaying) return;
    session.replaying = true;
    session.countOverride = count;
    try {
      const saved = session.keys;
      session.keys = [];
      for (const key of change.keys) feedKey(view, key);
      session.countOverride = null;
      if (change.insertTokens) {
        replayTokens(view, change.insertTokens);
        if (mode(view.state) === "insert") exitInsert(view);
      }
      session.keys = saved;
    } finally {
      session.replaying = false;
      session.countOverride = null;
    }
  }

  function playMacro(view: EditorView, name: string, count: number | null): void {
    const register = name === "@" ? shared.lastMacro : name;
    if (!register) return;
    const tokens = shared.macros.get(register.toLowerCase());
    if (!tokens || session.replaying) return;
    shared.lastMacro = register;
    session.replaying = true;
    try {
      for (let remaining = count ?? 1; remaining > 0; remaining -= 1) {
        const saved = session.keys;
        session.keys = [];
        replayTokens(view, tokens);
        session.keys = saved;
      }
    } finally {
      session.replaying = false;
    }
  }

  function runNormalAction(view: EditorView, command: Extract<VimCommand, { type: "action" }>, count: number | null, keys: readonly string[]): void {
    const { state } = view;
    const cursor = state.selection.head;
    const line = lineAt(state.doc, cursor);
    const column = line ? lineOffset(line, cursor) : 0;
    const n = count ?? 1;
    switch (command.action) {
      case "i":
        enterInsert(view, cursor, keys);
        return;
      case "a":
        enterInsert(view, line && hasCharacterAt(line, column) ? positionAt(line, column + 1) : cursor, keys);
        return;
      case "I":
        enterInsert(view, line ? positionAt(line, firstNonBlank(line.text)) : cursor, keys);
        return;
      case "A":
        enterInsert(view, line ? line.end : cursor, keys);
        return;
      case "o":
        openLineBelow(view, keys);
        return;
      case "O":
        openLineAbove(view, keys);
        return;
      case "gi":
        enterInsert(view, cursor, keys);
        return;
      case "x":
      case "<Del>":
      case "X":
      case "s": {
        if (!line) return;
        const backward = command.action === "X";
        const from = backward ? positionAt(line, Math.max(0, column - n)) : cursor;
        const to = backward ? cursor : positionAt(line, Math.min(line.text.length, column + n));
        if (from === to) return;
        applyOperator(view, command.action === "s" ? "c" : "d", { from, to, linewise: false }, command.register, keys, false);
        return;
      }
      case "S": {
        const range = currentLineRange(view, count);
        if (range) applyOperator(view, "c", range, command.register, keys, false);
        return;
      }
      case "D":
      case "C": {
        if (!line) return;
        const stepped = lineStep(state.doc, line, 1, n - 1).line;
        const range = { from: cursor, to: stepped.end, linewise: false };
        applyOperator(view, command.action === "D" ? "d" : "c", range, command.register, keys, false);
        return;
      }
      case "Y": {
        const range = currentLineRange(view, count);
        if (range) applyOperator(view, "y", range, command.register, keys, false);
        return;
      }
      case "p":
      case "P":
      case "gp":
      case "gP":
        put(view, command.register, command.action.endsWith("p"), n, keys, command.action.startsWith("g"));
        return;
      case "J":
      case "gJ": {
        const tr = state.tr;
        const joinPoint = joinLines(tr, cursor, n, command.action === "J");
        recordChange(keys);
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, joinPoint)), { mode: "normal" }).scrollIntoView());
        return;
      }
      case "u":
        if (!host.undo(view)) undo(state, (tr) => view.dispatch(meta(tr, { mode: "normal" })));
        return;
      case "<C-r>":
        if (!host.redo(view)) redo(state, (tr) => view.dispatch(meta(tr, { mode: "normal" })));
        return;
      case "replace": {
        if (!line || !command.character || column + n > line.text.length) return;
        if (command.character === "\n") {
          const tr = state.tr.delete(cursor, positionAt(line, column + n));
          view.dispatch(meta(tr, { mode: "insert" }));
          runEditorKey(view, "<CR>");
          recordChange(keys);
          dispatchCursor(view, view.state.selection.head, { mode: "normal" });
          return;
        }
        if (!contiguousText(line, column, column + n)) return;
        const tr = state.tr;
        const end = replaceCharacters(tr, { from: cursor, to: positionAt(line, column + n), linewise: false }, command.character);
        recordChange(keys);
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, end)), { mode: "normal" }));
        return;
      }
      case "~": {
        if (!line || !hasCharacterAt(line, column)) return;
        const to = positionAt(line, Math.min(line.text.length, column + n));
        const tr = state.tr;
        changeCase(tr, { from: cursor, to, linewise: false }, "toggle");
        recordChange(keys);
        const next = Math.min(lineOffset(line, to), lastCursorIndex(line));
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, positionAt(line, next))), { mode: "normal" }));
        return;
      }
      case ".":
        repeatLastChange(view, count);
        return;
      case "v":
        enterVisual(view, cursor, cursor, false);
        return;
      case "V":
        enterVisual(view, cursor, cursor, true);
        return;
      case "gv":
        if (session.lastVisual) {
          const last = session.lastVisual;
          enterVisual(view, last.anchor, last.head, last.linewise);
        }
        return;
      case "<C-a>":
      case "<C-x>": {
        if (!line) return;
        const number = numberAtOrAfter(line.text, column);
        if (!number || !contiguousText(line, number.from, number.to)) return;
        const tr = state.tr;
        const end = adjustNumber(tr, line, number, command.action === "<C-a>" ? n : -n);
        recordChange(keys);
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, end)), { mode: "normal" }));
        return;
      }
      case "zz":
      case "z.":
        scrollCursor(view, "center");
        return;
      case "zt":
      case "z<CR>":
        scrollCursor(view, "top");
        return;
      case "zb":
      case "z-":
        scrollCursor(view, "bottom");
        return;
      case "ZZ":
        host.write();
        return;
      case "startRecording":
        if (command.character) {
          session.macro = { register: command.character, tokens: [] };
        }
        return;
      case "stopRecording":
        if (session.macro) {
          const tokens = session.macro.tokens.slice(0, -1);
          shared.macros.set(session.macro.register.toLowerCase(), tokens);
          shared.lastMacro = session.macro.register;
          session.macro = null;
        }
        return;
      case "playMacro":
        if (command.character) playMacro(view, command.character, count);
        return;
      case "<Esc>":
      case "&":
      default:
        return;
    }
  }

  function runVisualAction(view: EditorView, command: Extract<VimCommand, { type: "action" }>, count: number | null, keys: readonly string[]): void {
    const { state } = view;
    const vim = pluginState(state);
    const linewise = mode(state) === "visual-line";
    const range = visualRange(view);
    const lineRange = (): OperatorRange => ({ from: range.from, to: range.to, linewise: true });
    switch (command.action) {
      case "<Esc>":
      case "v":
        if (command.action === "v" && !linewise) leaveVisual(view, vim.visualHead);
        else if (command.action === "v") enterVisual(view, vim.visualAnchor, vim.visualHead, false);
        else leaveVisual(view, vim.visualHead);
        return;
      case "V":
        if (linewise) leaveVisual(view, vim.visualHead);
        else enterVisual(view, vim.visualAnchor, vim.visualHead, true);
        return;
      case "o":
      case "O":
        enterVisual(view, vim.visualHead, vim.visualAnchor, linewise);
        return;
      case "d":
      case "x":
      case "<Del>":
        applyOperator(view, "d", range, command.register, keys, true);
        return;
      case "D":
      case "X":
        applyOperator(view, "d", lineRange(), command.register, keys, true);
        return;
      case "c":
      case "s":
        applyOperator(view, "c", range, command.register, keys, true);
        return;
      case "C":
      case "S":
      case "R":
        applyOperator(view, "c", lineRange(), command.register, keys, true);
        return;
      case "y":
        applyOperator(view, "y", range, command.register, keys, true);
        return;
      case "Y":
        applyOperator(view, "y", lineRange(), command.register, keys, true);
        return;
      case ">":
      case "<":
        applyOperator(view, command.action, lineRange(), command.register, keys, true);
        return;
      case "~":
      case "u":
      case "U":
      case "g~":
      case "gu":
      case "gU": {
        const change: CaseChange =
          command.action === "u" || command.action === "gu"
            ? "lower"
            : command.action === "U" || command.action === "gU"
              ? "upper"
              : "toggle";
        const tr = state.tr;
        const cursor = changeCase(tr, range, change);
        recordChange(keys);
        session.lastVisual = { anchor: vim.visualAnchor, head: vim.visualHead, linewise };
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, cursor)), { mode: "normal" }));
        return;
      }
      case "J":
      case "gJ": {
        const first = lineAt(state.doc, range.from);
        const last = lineAt(state.doc, range.linewise ? range.to : Math.max(range.from, range.to - 1));
        if (!first || !last) return;
        let lines = 1;
        let current: VimLine | null = first;
        while (current && !(current.blockPos === last.blockPos && current.segmentIndex === last.segmentIndex)) {
          current = lineStep(state.doc, current, 1, 1).line;
          lines += 1;
          if (lines > 10_000) break;
        }
        const tr = state.tr;
        const joinPoint = joinLines(tr, first.start, Math.max(2, lines), command.action === "J");
        recordChange(keys);
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, joinPoint)), { mode: "normal" }));
        return;
      }
      case "p":
      case "P": {
        const content = isClipboardRegister(command.register) ? null : readRegister(command.register);
        if (!content) return;
        yankRange(state.doc, range, null, { yank: false, clipboard: host.clipboard });
        const tr = state.tr;
        const cursor = deleteRange(tr, range);
        const putAt = Math.max(0, Math.min(cursor, tr.doc.content.size));
        const afterPut = putRegister(tr.setSelection(TextSelection.create(tr.doc, putAt)), putAt, content, false, count ?? 1);
        recordChange(keys);
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, afterPut)), { mode: "normal" }).scrollIntoView());
        return;
      }
      case "replace": {
        if (!command.character) return;
        const tr = state.tr;
        replaceCharacters(tr, range, command.character);
        recordChange(keys);
        view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, range.from)), { mode: "normal" }));
        return;
      }
      case "I":
        enterInsert(view, range.from, keys);
        return;
      case "A":
        enterInsert(view, range.to, keys);
        return;
      case "gv":
        return;
      case "zz":
        scrollCursor(view, "center");
        return;
      case "zt":
        scrollCursor(view, "top");
        return;
      case "zb":
        scrollCursor(view, "bottom");
        return;
      default:
        return;
    }
  }

  function runCommand(view: EditorView, command: VimCommand, keys: readonly string[]): void {
    const current = mode(view.state);
    const count = session.countOverride ?? command.count;
    if (command.type === "motion") {
      runMotion(view, command.motion, count);
      return;
    }
    if (command.type === "operator") {
      const range = operatorRange(view, command, count);
      if (!range) return;
      applyOperator(view, command.operator, range, command.register, keys, false);
      return;
    }
    if (current === "visual" || current === "visual-line") {
      runVisualAction(view, command, count, keys);
      return;
    }
    runNormalAction(view, command, count, keys);
  }

  function substitute(view: EditorView, spec: string, scope: "line" | "all" | "visual"): void {
    const separator = spec.charAt(0);
    const parts: string[] = [];
    let current = "";
    for (let index = 1; index < spec.length; index += 1) {
      const character = spec[index]!;
      if (character === "\\" && spec[index + 1] === separator) {
        current += separator;
        index += 1;
        continue;
      }
      if (character === separator) {
        parts.push(current);
        current = "";
        continue;
      }
      current += character;
    }
    parts.push(current);
    const [pattern = "", replacement = "", flags = ""] = parts;
    if (pattern.length === 0) return;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, `${flags.includes("g") ? "g" : ""}${flags.includes("i") ? "i" : ""}u`);
    } catch {
      session.message = `Invalid pattern: ${pattern}`;
      return;
    }
    const { state } = view;
    let lines: VimLine[];
    if (scope === "all") lines = allLines(state.doc);
    else if (scope === "visual" && session.lastVisual) {
      const from = Math.min(session.lastVisual.anchor, session.lastVisual.head);
      const to = Math.max(session.lastVisual.anchor, session.lastVisual.head);
      lines = allLines(state.doc).filter((line) => line.end >= from && line.start <= to);
    } else {
      const line = lineAt(state.doc, state.selection.head);
      lines = line ? [line] : [];
    }
    const tr = state.tr;
    let replaced = 0;
    let lastPos: number | null = null;
    for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
      const line = lines[lineIndex]!;
      const matches: RegExpExecArray[] = [];
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line.text)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }
        matches.push(match);
        if (!regex.global) break;
      }
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const found = matches[index]!;
        const from = found.index;
        const to = from + found[0].length;
        if (!contiguousText(line, from, to)) continue;
        const single = new RegExp(regex.source, regex.flags.replace("g", ""));
        const text = found[0].replace(single, replacement);
        tr.insertText(text, positionAt(line, from), positionAt(line, to));
        replaced += 1;
        lastPos = positionAt(line, from);
      }
    }
    if (replaced === 0) {
      session.message = `Pattern not found: ${pattern}`;
      return;
    }
    recordChange([`<ex:${scope === "all" ? "%" : ""}s${spec}>`]);
    const cursor = lastPos ?? state.selection.head;
    view.dispatch(meta(tr.setSelection(TextSelection.create(tr.doc, Math.min(cursor, tr.doc.content.size))), { mode: "normal" }).scrollIntoView());
  }

  function runEx(view: EditorView, text: string): void {
    const command = text.trim();
    if (command.length === 0) return;
    if (/^\d+$/.test(command)) {
      host.jumpToLine(Number(command));
      return;
    }
    if (command === "w" || command === "write" || command === "ZZ") {
      host.write();
      return;
    }
    if (command === "q" || command === "quit" || command === "q!") {
      host.quit();
      return;
    }
    if (command === "wq" || command === "x" || command === "xit") {
      host.write();
      host.quit();
      return;
    }
    if (command === "noh" || command === "nohlsearch") {
      clearSearch(view);
      return;
    }
    const substitution = /^(%|'<,'>)?s(.+)$/su.exec(command);
    if (substitution) {
      const scope = substitution[1] === "%" ? "all" : substitution[1] ? "visual" : "line";
      substitute(view, substitution[2] ?? "", scope);
      return;
    }
    session.message = `Not an editor command: ${command}`;
  }

  function handlePromptKey(view: EditorView, key: string): void {
    const prompt = session.prompt;
    if (!prompt) return;
    if (key === "<Esc>") {
      session.prompt = null;
      return;
    }
    if (key === "<BS>") {
      if (prompt.text.length === 0) session.prompt = null;
      else prompt.text = prompt.text.slice(0, -1);
      return;
    }
    if (key === "<C-u>") {
      prompt.text = "";
      return;
    }
    if (key === "<CR>") {
      session.prompt = null;
      if (prompt.prefix === ":") {
        runEx(view, prompt.text);
        return;
      }
      const pattern = prompt.text.length > 0 ? prompt.text : shared.lastSearch?.pattern ?? "";
      if (pattern.length === 0) return;
      const keys = [...prompt.pendingKeys, `<search:${prompt.prefix}${pattern}>`];
      feedKeys(view, keys);
      return;
    }
    const character = keyToCharacter(key);
    if (character !== null && character !== "\n") prompt.text += character;
  }

  function feedKeys(view: EditorView, keys: readonly string[]): void {
    const saved = session.keys;
    session.keys = [];
    for (const key of keys) feedKey(view, key);
    session.keys = saved.length > 0 && session.keys.length === 0 ? [] : session.keys;
  }

  function feedKey(view: EditorView, key: string): void {
    const current = mode(view.state);
    if (session.macro && !session.replaying) session.macro.tokens.push({ kind: "key", key });
    if (key.startsWith("<ex:")) {
      runEx(view, key.slice(4, -1));
      return;
    }
    session.keys.push(key);
    session.message = null;
    const result = parseVimKeys(session.keys, {
      mode: current === "normal" ? "normal" : "visual",
      recording: session.macro !== null,
    });
    if (result.status === "pending") return;
    const keys = session.keys;
    session.keys = [];
    if (result.status === "invalid") return;
    if (result.status === "prompt") {
      const pendingKeys = keys.slice(0, -1);
      let text = "";
      if (result.prefix === ":" && (current === "visual" || current === "visual-line")) {
        text = "'<,'>";
        leaveVisual(view, pluginState(view.state).visualHead);
      }
      session.prompt = { prefix: result.prefix, text, pendingKeys };
      return;
    }
    runCommand(view, result.command, keys);
  }

  function resetSession(): void {
    session.keys = [];
    session.prompt = null;
    session.insertCapture = null;
    session.macro = null;
    session.message = null;
    forgetColumn();
  }

  function renderStatus(view: EditorView): void {
    if (!statusElement) return;
    const enabled = host.enabled();
    statusElement.hidden = !enabled;
    if (!enabled) return;
    const current = mode(view.state);
    statusElement.dataset.mode = current;
    const parts: string[] = [];
    const badge = statusElement.querySelector<HTMLElement>(".vim-mode-badge");
    if (badge) {
      badge.dataset.mode = modeLabel(current);
      badge.textContent = modeLabel(current);
    }
    const detail = statusElement.querySelector<HTMLElement>(".vim-status-detail");
    if (session.prompt) parts.push(`${session.prompt.prefix}${session.prompt.text}`);
    else if (session.message) parts.push(session.message);
    else if (session.keys.length > 0) parts.push(describePendingKeys(session.keys));
    if (session.macro) parts.push(`recording @${session.macro.register}`);
    if (detail) detail.textContent = parts.join("  ");
    statusElement.dataset.prompt = session.prompt ? "true" : "false";
  }

  const plugin: Plugin<VimPluginState> = new Plugin<VimPluginState>({
    key: vimPluginKey,
    state: {
      init: () => ({ ...INITIAL_STATE }),
      apply(tr, previous) {
        const change = tr.getMeta(vimPluginKey) as VimMeta | undefined;
        if (change) {
          return { ...previous, ...change, initialized: true };
        }
        let next = previous;
        if (tr.docChanged) {
          next = {
            ...next,
            visualAnchor: tr.mapping.map(next.visualAnchor),
            visualHead: tr.mapping.map(next.visualHead),
          };
        }
        if (tr.selectionSet && host.enabled()) {
          const { selection } = tr;
          const effective = next.initialized ? next.mode : "normal";
          const visual = effective === "visual" || effective === "visual-line";
          if (visual && selection.empty) {
            next = { ...next, mode: "normal", initialized: true };
          } else if (effective === "normal" && !selection.empty && selection instanceof TextSelection) {
            next = {
              ...next,
              mode: "visual",
              visualAnchor: selection.anchor,
              visualHead: selection.head > selection.anchor ? Math.max(selection.anchor, selection.head - 1) : selection.head,
              initialized: true,
            };
          }
        }
        return next;
      },
    },
    appendTransaction(_transactions, _oldState, newState) {
      if (!host.enabled() || mode(newState) !== "normal") return null;
      const clamped = clampNormalCursor(newState);
      if (clamped === null) return null;
      return meta(newState.tr.setSelection(TextSelection.create(newState.doc, clamped)));
    },
    props: {
      handleKeyDown(view, event) {
        if (!host.enabled()) return false;
        const current = mode(view.state);
        const key = vimKeyFromEvent(event);
        if (current === "insert") {
          if (key === "<Esc>") {
            if (session.macro && !session.replaying) session.macro.tokens.push({ kind: "key", key });
            exitInsert(view);
            render();
            return true;
          }
          if (key && INSERT_RECORDED_KEYS.has(key) && !session.replaying) {
            session.insertCapture?.push({ kind: "key", key });
            session.macro?.tokens.push({ kind: "key", key });
          }
          return false;
        }
        if (key === null) return false;
        if (key.startsWith("<C-") && !VIM_CONTROL_KEYS.has(key)) return false;
        if (key === "<Tab>") return false;
        if (session.prompt) {
          handlePromptKey(view, key);
          render();
          return true;
        }
        feedKey(view, key);
        render();
        return true;
      },
      handleTextInput(view, _from, _to, text) {
        if (!host.enabled()) return false;
        if (mode(view.state) !== "insert") return true;
        if (!session.replaying) {
          session.insertCapture?.push({ kind: "text", text });
          session.macro?.tokens.push({ kind: "text", text });
        }
        return false;
      },
      decorations(state) {
        if (!host.enabled()) return null;
        const current = mode(state);
        if (current === "insert") return null;
        const vim = pluginState(state);
        const cursor = cursorOf(state, vim, current);
        const line = lineAt(state.doc, cursor);
        if (!line) return null;
        const column = lineOffset(line, cursor);
        if (hasCharacterAt(line, column)) {
          const pos = positionAt(line, column);
          const next = positionAt(line, column + 1);
          const isText = next === pos + 1 && line.text[column] !== "￼";
          return DecorationSet.create(state.doc, [
            isText
              ? Decoration.inline(pos, next, { class: "vim-cursor" })
              : Decoration.node(pos, next, { class: "vim-cursor-node" }),
          ]);
        }
        return DecorationSet.create(state.doc, [
          Decoration.widget(
            cursor,
            () => {
              const marker = document.createElement("span");
              marker.className = "vim-cursor-eol";
              return marker;
            },
            { side: 1, key: "vim-cursor-eol" },
          ),
        ]);
      },
    },
    view(view) {
      statusElement = document.createElement("div");
      statusElement.className = "vim-status";
      statusElement.setAttribute("role", "status");
      statusElement.setAttribute("aria-live", "polite");
      const badge = document.createElement("span");
      badge.className = "vim-mode-badge";
      const detail = document.createElement("span");
      detail.className = "vim-status-detail";
      statusElement.append(badge, detail);
      view.dom.parentElement?.appendChild(statusElement);
      const syncDom = () => {
        const current = mode(view.state);
        view.dom.classList.toggle("vim-normal", current !== "insert");
        view.dom.dataset.vimMode = host.enabled() ? current : "off";
      };
      render = () => {
        syncDom();
        renderStatus(view);
      };
      session.noteKey = host.noteKey();
      render();
      return {
        update() {
          const noteKey = host.noteKey();
          if (noteKey !== session.noteKey) {
            session.noteKey = noteKey;
            resetSession();
          }
          render();
        },
        destroy() {
          statusElement?.remove();
          statusElement = null;
          render = () => undefined;
        },
      };
    },
  });

  return plugin;
}

/** Test seam: forgets registers of repeat state shared across views. */
export function resetVimSharedState(): void {
  shared.lastFind = null;
  shared.lastSearch = null;
  shared.lastChange = null;
  shared.macros.clear();
  shared.lastMacro = null;
}

export function lastVimChangeKeys(): readonly string[] | null {
  return shared.lastChange?.keys ?? null;
}

export { writeRegister, readRegister };
