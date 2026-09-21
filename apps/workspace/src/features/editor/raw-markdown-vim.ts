import type { EditorView } from "@codemirror/view";
import { Vim, getCM, vim } from "@replit/codemirror-vim";
import type { Extension } from "@codemirror/state";

/** What the raw editor's `:` commands can reach in the host application. */
export type RawMarkdownVimHandlers = {
  /** `:w` — flush the pending save now. */
  write(): void;
  /** `:q` — leave raw Markdown mode for the rendered editor. */
  quit(): void;
};

export type RawMarkdownVimMode = "normal" | "insert" | "visual" | "visual line" | "visual block" | "replace";

type VimModeChange = { mode: string; subMode?: string };

type ExTarget = { cm6: EditorView };

type RawMarkdownVimFeedbackInput = {
  keys: readonly string[];
  before: string;
  after: string;
  selectionFrom: number;
  selectionTo: number;
  visualLine: boolean;
};

const handlersByView = new WeakMap<EditorView, RawMarkdownVimHandlers>();

let exCommandsDefined = false;

function handlersOf(target: ExTarget): RawMarkdownVimHandlers | undefined {
  return handlersByView.get(target.cm6);
}

/**
 * Ex commands are registered on the module-wide Vim singleton once; each one
 * resolves the editor it was typed into so split panes and the journal never
 * cross wires.
 */
function defineExCommands(): void {
  if (exCommandsDefined) return;
  exCommandsDefined = true;
  mapRowMotions();
  Vim.defineEx("write", "w", (cm) => {
    handlersOf(cm as unknown as ExTarget)?.write();
  });
  Vim.defineEx("quit", "q", (cm) => {
    handlersOf(cm as unknown as ExTarget)?.quit();
  });
  Vim.defineEx("wq", undefined, (cm) => {
    const handlers = handlersOf(cm as unknown as ExTarget);
    handlers?.write();
    handlers?.quit();
  });
  Vim.defineEx("xit", "x", (cm) => {
    const handlers = handlersOf(cm as unknown as ExTarget);
    handlers?.write();
    handlers?.quit();
  });
}

/**
 * Plain `j` and `k` walk the rows a wrapped line is displayed on, like the
 * rendered editor's Vim layer. The maps only cover the normal and visual
 * contexts, so `dj` and other operator motions keep counting source lines.
 */
function mapRowMotions(): void {
  for (const context of ["normal", "visual"]) {
    Vim.noremap("j", "gj", context);
    Vim.noremap("k", "gk", context);
  }
}

export function rawMarkdownVim(): Extension {
  defineExCommands();
  return vim();
}

function pluralized(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function changedText(before: string, after: string): { removed: string; inserted: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return { removed: before.slice(start, beforeEnd), inserted: after.slice(start, afterEnd) };
}

function lineCount(text: string): number {
  return Math.max(1, (text.match(/\n/gu)?.length ?? 0) + (text.endsWith("\n") ? 0 : 1));
}

function keyCommand(keys: readonly string[]): { command: string; count: number } {
  const joined = keys.join("").replace(/^"(?:[a-zA-Z0-9+*_-])/, "");
  const doubled = /^(\d*)([dyc<>])(\d*)\2$/u.exec(joined);
  if (doubled) {
    const prefixCount = Number(doubled[1] || 1);
    const motionCount = Number(doubled[3] || 1);
    return { command: `${doubled[2]}${doubled[2]}`, count: prefixCount * motionCount };
  }
  const match = /^(\d+)?(.*)$/u.exec(joined);
  return { command: match?.[2] ?? joined, count: Number(match?.[1] ?? 1) };
}

export function describeRawMarkdownVimFeedback(input: RawMarkdownVimFeedbackInput): string | null {
  const { command, count } = keyCommand(input.keys);
  const selected = input.before.slice(input.selectionFrom, input.selectionTo);
  const change = changedText(input.before, input.after);
  const visualCount = input.visualLine ? lineCount(selected) : Math.max(1, Array.from(selected).length);
  const visualUnit = input.visualLine ? "line" : "character";
  if (/^(?:y|Y)$/u.test(command) && input.selectionFrom !== input.selectionTo) {
    return `${pluralized(visualCount, visualUnit)} yanked`;
  }
  if (/^(?:d|x|D|X)$/u.test(command) && input.selectionFrom !== input.selectionTo) {
    return `${pluralized(visualCount, visualUnit)} deleted`;
  }
  if (/^(?:c|s|C|S|R)$/u.test(command) && input.selectionFrom !== input.selectionTo) {
    return `${pluralized(visualCount, visualUnit)} changed`;
  }
  if (/^(?:yy|Y)$/u.test(command)) return `${pluralized(count, "line")} yanked`;
  if (/^dd$/u.test(command)) return `${pluralized(count, "line")} deleted`;
  if (/^(?:cc|S)$/u.test(command)) return `${pluralized(count, "line")} changed`;
  if (/^(?:>>|<<)$/u.test(command)) return `${pluralized(count, "line")} ${command === ">>" ? "indented" : "outdented"}`;
  if (/^(?:x|X)$/u.test(command) && change.removed.length > 0) {
    return `${pluralized(Array.from(change.removed).length, "character")} deleted`;
  }
  if (/^[dD]/u.test(command) && change.removed.length > 0) {
    return `${pluralized(Array.from(change.removed).length, "character")} deleted`;
  }
  if (/^[cCsS]/u.test(command) && change.removed.length > 0) {
    return `${pluralized(Array.from(change.removed).length, "character")} changed`;
  }
  if (/^[yY]/u.test(command)) return "Yanked";
  if (/^(?:p|P|gp|gP)$/u.test(command) && change.inserted.length > 0) {
    const lines = change.inserted.match(/\n/gu)?.length ?? 0;
    return lines > 0
      ? `${pluralized(lines, "line")} put`
      : `${pluralized(Array.from(change.inserted).length, "character")} put`;
  }
  if (/^(?:J|gJ)$/u.test(command)) return `${pluralized(Math.max(2, count), "line")} joined`;
  if (/^(?:~|g~|gu|gU|r.)$/u.test(command)) return "Text changed";
  if (command === "<C-a>") return `Number increased by ${count}`;
  if (command === "<C-x>") return `Number decreased by ${count}`;
  return null;
}

export function bindRawMarkdownVimHandlers(
  view: EditorView,
  handlers: RawMarkdownVimHandlers,
): () => void {
  handlersByView.set(view, handlers);
  return () => {
    if (handlersByView.get(view) === handlers) handlersByView.delete(view);
  };
}

export function describeRawMarkdownVimMode(change: VimModeChange): RawMarkdownVimMode {
  if (change.mode === "visual") {
    if (change.subMode === "linewise") return "visual line";
    if (change.subMode === "blockwise") return "visual block";
    return "visual";
  }
  if (change.mode === "insert") return "insert";
  if (change.mode === "replace") return "replace";
  return "normal";
}

/**
 * Reports mode changes for the status row. The Vim plugin exposes them through
 * the CodeMirror 5 compatibility events, which exist only while the extension
 * is installed, so binding must follow every reconfigure.
 */
export function observeRawMarkdownVimMode(
  view: EditorView,
  onChange: (mode: RawMarkdownVimMode | null) => void,
): () => void {
  const cm = getCM(view);
  if (!cm) {
    onChange(null);
    return () => undefined;
  }
  const listener = (change: VimModeChange) => {
    onChange(describeRawMarkdownVimMode(change));
  };
  cm.on("vim-mode-change", listener);
  const current = cm.state.vim;
  onChange(current ? describeRawMarkdownVimMode({ mode: current.insertMode ? "insert" : current.visualMode ? "visual" : "normal", subMode: current.visualLine ? "linewise" : current.visualBlock ? "blockwise" : undefined }) : "normal");
  return () => {
    cm.off("vim-mode-change", listener);
  };
}

export function observeRawMarkdownVimFeedback(
  view: EditorView,
  onChange: (message: string | null) => void,
): () => void {
  const cm = getCM(view);
  if (!cm) return () => undefined;
  let keys: string[] = [];
  let before = view.state.doc.toString();
  let selectionFrom = view.state.selection.main.from;
  let selectionTo = view.state.selection.main.to;
  let visualLine = cm.state.vim?.visualLine === true;
  const inputListener = (event: { type?: string; key?: string }) => {
    if (event.type !== "handleKey" || !event.key) return;
    if (keys.length === 0) {
      before = view.state.doc.toString();
      selectionFrom = view.state.selection.main.from;
      selectionTo = view.state.selection.main.to;
      visualLine = cm.state.vim?.visualLine === true;
      onChange(null);
    }
    keys.push(event.key);
  };
  const commandListener = () => {
    const vim = cm.state.vim;
    const input = vim?.inputState;
    const pending = Boolean(
      vim?.expectLiteralNext ||
      input?.operator ||
      input?.motion ||
      input?.keyBuffer.length ||
      input?.prefixRepeat.length ||
      input?.motionRepeat.length,
    );
    if (pending) return;
    const message = describeRawMarkdownVimFeedback({
      keys,
      before,
      after: view.state.doc.toString(),
      selectionFrom,
      selectionTo,
      visualLine,
    });
    keys = [];
    if (message) onChange(message);
  };
  cm.on("inputEvent", inputListener);
  cm.on("vim-keypress", commandListener);
  return () => {
    cm.off("inputEvent", inputListener);
    cm.off("vim-keypress", commandListener);
  };
}
