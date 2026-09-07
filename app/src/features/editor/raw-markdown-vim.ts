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
