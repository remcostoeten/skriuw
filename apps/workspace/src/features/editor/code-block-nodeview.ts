import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  NodeSelection,
  Plugin,
  TextSelection,
  type Command,
  type EditorState,
} from "prosemirror-state";
import type { ResolvedPos } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { CODE_LANGUAGES, codeLanguageLabel } from "./code-highlight";
import {
  MERMAID_FAMILY_LABELS,
  MERMAID_UNSUPPORTED_NOTE,
  detectMermaidFamily,
  isMermaidFence,
  primaryFontFamily,
  readMermaidPalette,
  renderMermaidSvg,
  type MermaidFamily,
  type MermaidRenderer,
  type MermaidRenderResult,
} from "./mermaid-render";

const LANGUAGE_MENU_LABEL = "Code language";
const TYPE_AHEAD_RESET_MS = 700;
const MERMAID_RERENDER_DEBOUNCE_MS = 250;

export const MERMAID_MODE_EVENT = "skriuw-mermaid-mode";

export type MermaidViewMode = "preview" | "source";
export type MermaidModeRequest = MermaidViewMode | "toggle";

export type CodeBlockNodeViewDeps = {
  render: MermaidRenderer;
  rerenderDebounceMs: number;
};

const defaultDeps: CodeBlockNodeViewDeps = {
  render: (source, palette, options) => renderMermaidSvg(source, palette, options),
  rerenderDebounceMs: MERMAID_RERENDER_DEBOUNCE_MS,
};

let menuSequence = 0;

/**
 * Rewrites a code block's fence info string. `pos` must address the code block
 * itself; the command is a no-op when the language is already set.
 */
export function setCodeBlockLanguage(pos: number, language: string): Command {
  return (state, dispatch) => {
    if (pos < 0 || pos >= state.doc.content.size) return false;
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== "code_block") return false;
    if (node.attrs.params === language) return false;
    dispatch?.(
      state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, params: language }),
    );
    return true;
  };
}

export function codeBlockClipboardText(node: ProseMirrorNode): string {
  return node.type.name === "code_block" ? node.textContent : "";
}

type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
};

export async function writeCodeBlockClipboard(
  text: string,
  clipboard: ClipboardWriter | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isRenderableMermaidNode(node: ProseMirrorNode): boolean {
  return (
    node.type.name === "code_block" &&
    isMermaidFence(String(node.attrs.params ?? "")) &&
    detectMermaidFamily(node.textContent) !== "unsupported"
  );
}

/**
 * The renderable Mermaid code block around the selection: the node-selected
 * block itself, or the block whose text holds the caret.
 */
export function mermaidBlockAtSelection(
  state: EditorState,
): { pos: number; node: ProseMirrorNode; selected: boolean } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    return isRenderableMermaidNode(selection.node)
      ? { pos: selection.from, node: selection.node, selected: true }
      : null;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "code_block") continue;
    return isRenderableMermaidNode(node)
      ? { pos: $from.before(depth), node, selected: false }
      : null;
  }
  return null;
}

function requestMermaidMode(view: EditorView | undefined, pos: number, mode: MermaidModeRequest): boolean {
  if (!view || typeof view.nodeDOM !== "function") return false;
  const dom = view.nodeDOM(pos);
  if (!dom || typeof (dom as HTMLElement).dispatchEvent !== "function") return false;
  (dom as HTMLElement).dispatchEvent(new CustomEvent(MERMAID_MODE_EVENT, { detail: mode }));
  return true;
}

/** Enter on a selected diagram preview opens its source with the caret at the end. */
export const enterMermaidSource: Command = (state, dispatch, view) => {
  const block = mermaidBlockAtSelection(state);
  if (!block || !block.selected) return false;
  if (dispatch) {
    const end = block.pos + block.node.nodeSize - 1;
    requestMermaidMode(view, block.pos, "source");
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)));
  }
  return true;
};

/** Escape inside diagram source returns to the preview and reselects the block. */
export const exitMermaidSource: Command = (state, dispatch, view) => {
  const block = mermaidBlockAtSelection(state);
  if (!block || block.selected) return false;
  if (dispatch) {
    dispatch(state.tr.setSelection(NodeSelection.create(state.doc, block.pos)));
    requestMermaidMode(view, block.pos, "preview");
  }
  return true;
};

/** Flips a diagram block between preview and source from wherever the caret sits in it. */
export const toggleMermaidSource: Command = (state, dispatch, view) => {
  const block = mermaidBlockAtSelection(state);
  if (!block) return false;
  if (dispatch) requestMermaidMode(view, block.pos, "toggle");
  return true;
};

function previewBlockAround(view: EditorView, $anchor: ResolvedPos, $head: ResolvedPos): number | null {
  for (let depth = $anchor.depth; depth > 0; depth -= 1) {
    const node = $anchor.node(depth);
    if (node.type.name !== "code_block") continue;
    if (!isRenderableMermaidNode(node)) return null;
    const pos = $anchor.before(depth);
    if ($head.pos < pos || $head.pos > pos + node.nodeSize) return null;
    const dom = view.nodeDOM(pos) as { dataset?: DOMStringMap } | null;
    return dom?.dataset?.mermaid === "preview" ? pos : null;
  }
  return null;
}

/**
 * Keeps a previewed diagram block node-selected. Chrome cannot hold a DOM
 * range around an element with editable text: it canonicalizes the range into
 * that text, and ProseMirror would read it back as a text selection inside
 * the collapsed source. Selections the browser reports inside a preview block
 * therefore resolve to the block itself.
 */
export function createMermaidPreviewSelectionPlugin(): Plugin {
  return new Plugin({
    props: {
      createSelectionBetween(view, $anchor, $head) {
        const pos = previewBlockAround(view, $anchor, $head);
        return pos === null ? null : NodeSelection.create(view.state.doc, pos);
      },
    },
  });
}

function prefersStaticDiagrams(): boolean {
  const reducedMotion =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const connection = (globalThis.navigator as { connection?: { saveData?: boolean } } | undefined)
    ?.connection;
  return reducedMotion || connection?.saveData === true;
}

function documentFont(): string {
  const root = globalThis.document?.documentElement ?? null;
  if (!root || typeof globalThis.getComputedStyle !== "function") return primaryFontFamily("");
  return primaryFontFamily(globalThis.getComputedStyle(root).getPropertyValue("--font-sans"));
}

type IdleScheduler = (callback: () => void) => void;

function idleScheduler(): IdleScheduler {
  const host = globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
  const requestIdle = host.requestIdleCallback;
  if (typeof requestIdle === "function") {
    return (callback) => requestIdle(callback, { timeout: 500 });
  }
  return (callback) => setTimeout(callback, 0);
}

export function createCodeBlockNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
  deps: CodeBlockNodeViewDeps = defaultDeps,
): NodeView {
  let node = initialNode;
  let open = false;

  const dom = document.createElement("pre");
  dom.className = "code-block";
  const contentDOM = document.createElement("code");
  const toolbar = document.createElement("div");
  toolbar.className = "code-block-toolbar";
  toolbar.contentEditable = "false";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "code-block-language";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "code-block-copy";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", "Copy code");
  const menu = document.createElement("ul");
  menu.className = "code-block-language-menu";
  menu.id = `code-block-language-menu-${++menuSequence}`;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("tabindex", "-1");
  menu.setAttribute("aria-label", LANGUAGE_MENU_LABEL);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-controls", menu.id);
  trigger.setAttribute("aria-label", LANGUAGE_MENU_LABEL);
  const modeToggle = document.createElement("button");
  modeToggle.type = "button";
  modeToggle.className = "code-block-mode";
  modeToggle.hidden = true;
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "code-block-expand";
  expand.textContent = "Expand";
  expand.setAttribute("aria-label", "Expand diagram");
  expand.hidden = true;
  toolbar.append(trigger, copy, menu, modeToggle, expand);
  const preview = document.createElement("div");
  preview.className = "mermaid-preview";
  preview.contentEditable = "false";
  preview.setAttribute("role", "img");
  preview.hidden = true;
  const error = document.createElement("div");
  error.className = "mermaid-error";
  error.contentEditable = "false";
  error.setAttribute("role", "status");
  error.hidden = true;
  const note = document.createElement("div");
  note.className = "mermaid-note";
  note.contentEditable = "false";
  note.textContent = MERMAID_UNSUPPORTED_NOTE;
  note.hidden = true;
  dom.append(toolbar, preview, contentDOM, error, note);
  let copyReset: number | null = null;
  let typeAhead = "";
  let typeAheadReset: number | null = null;

  let mode: MermaidViewMode = "preview";
  let family: MermaidFamily = "unsupported";
  let renderedSource: string | null = null;
  let renderedSvg: string | null = null;
  let renderSequence = 0;
  let hasAnimated = false;
  let rerenderTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let themeObserver: MutationObserver | null = null;
  let expandDialog: HTMLDialogElement | null = null;
  const scheduleIdle = idleScheduler();

  const items: HTMLButtonElement[] = [];

  function currentLanguage(): string {
    return String(node.attrs.params ?? "");
  }

  function isMermaid(): boolean {
    return isMermaidFence(currentLanguage());
  }

  function isRenderable(): boolean {
    return isMermaid() && family !== "unsupported";
  }

  function paint(): void {
    const params = currentLanguage();
    dom.dataset.language = params;
    trigger.textContent = codeLanguageLabel(params);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    toolbar.dataset.open = open ? "true" : "false";
    for (const item of items) {
      item.setAttribute("aria-selected", item.dataset.language === params ? "true" : "false");
    }
    paintMermaid();
  }

  function paintMermaid(): void {
    const renderable = isRenderable();
    const showPreview = renderable && mode === "preview";
    if (renderable) {
      dom.dataset.mermaid = mode;
    } else {
      delete dom.dataset.mermaid;
    }
    preview.hidden = !showPreview;
    preview.setAttribute("aria-label", `${MERMAID_FAMILY_LABELS[family]} preview`);
    if (showPreview) {
      contentDOM.dataset.collapsed = "true";
      dom.contentEditable = "false";
    } else {
      delete contentDOM.dataset.collapsed;
      dom.contentEditable = "inherit";
    }
    modeToggle.hidden = !renderable;
    modeToggle.textContent = mode === "preview" ? "Source" : "Preview";
    modeToggle.setAttribute(
      "aria-label",
      mode === "preview" ? "Show diagram source" : "Show diagram preview",
    );
    expand.hidden = !renderable || renderedSvg === null;
    note.hidden = !(isMermaid() && !renderable);
    error.hidden = !renderable || error.textContent === "";
  }

  function setMode(next: MermaidModeRequest): void {
    const resolved: MermaidViewMode = next === "toggle" ? (mode === "preview" ? "source" : "preview") : next;
    if (resolved === mode) return;
    mode = resolved;
    paintMermaid();
  }

  function applyRender(result: MermaidRenderResult): void {
    if (result.ok) {
      renderedSvg = result.svg;
      preview.innerHTML = result.svg;
      preview.dataset.wide =
        typeof preview.clientWidth === "number" && preview.clientWidth > 0 && result.width > preview.clientWidth
          ? "true"
          : "false";
      error.textContent = "";
    } else {
      error.textContent = result.message;
    }
    paintMermaid();
  }

  function renderNow(): void {
    if (destroyed || !isRenderable()) return;
    const source = node.textContent;
    const sequence = ++renderSequence;
    const animate = !hasAnimated && !prefersStaticDiagrams();
    hasAnimated = true;
    renderedSource = source;
    const palette = readMermaidPalette(globalThis.document?.documentElement ?? null);
    void deps
      .render(source, palette, { animate, font: documentFont() })
      .then(
        (result) => {
          if (destroyed || sequence !== renderSequence) return;
          applyRender(result);
        },
        (error: unknown) => {
          if (destroyed || sequence !== renderSequence) return;
          applyRender({ ok: false, message: error instanceof Error ? error.message : String(error) });
        },
      );
  }

  function scheduleRender(immediate: boolean): void {
    if (rerenderTimer !== null) {
      clearTimeout(rerenderTimer);
      rerenderTimer = null;
    }
    if (immediate) {
      scheduleIdle(renderNow);
      return;
    }
    rerenderTimer = setTimeout(() => {
      rerenderTimer = null;
      scheduleIdle(renderNow);
    }, deps.rerenderDebounceMs);
  }

  function caretInsideBlock(): boolean {
    const pos = getPos();
    if (pos === undefined) return false;
    const { selection } = view.state;
    return (
      !(selection instanceof NodeSelection) &&
      selection.from > pos &&
      selection.to < pos + node.nodeSize
    );
  }

  function syncMermaid(previousFamily: MermaidFamily, previousSource: string): void {
    family = isMermaid() ? detectMermaidFamily(node.textContent) : "unsupported";
    if (!isRenderable()) {
      renderedSource = null;
      renderedSvg = null;
      error.textContent = "";
      preview.innerHTML = "";
      return;
    }
    const becameRenderable = previousFamily === "unsupported";
    if (becameRenderable) {
      if (node.textContent.trim() === "" || caretInsideBlock()) mode = "source";
      scheduleRender(true);
      return;
    }
    if (node.textContent !== previousSource && node.textContent !== renderedSource) {
      scheduleRender(false);
    }
  }

  function observeTheme(): void {
    const root = globalThis.document?.documentElement;
    const Observer = globalThis.MutationObserver;
    if (!root || typeof Observer !== "function") return;
    themeObserver = new Observer(() => {
      if (isRenderable()) scheduleRender(true);
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
  }

  function selectBlock(): void {
    const pos = getPos();
    if (pos === undefined) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  }

  // While the preview shows, the block is not editable, so the browser never
  // drops a node-selecting range into the collapsed source. A caret that the
  // editor state places inside the block (keyboard navigation) reveals the
  // source, and focusing re-syncs the DOM selection into the now editable text.
  const revealSourceForCaret = () => {
    if (destroyed || mode !== "preview" || !isRenderable()) return;
    if (!caretInsideBlock()) return;
    setMode("source");
    view.focus();
  };

  function closeExpand(): void {
    if (!expandDialog) return;
    const dialog = expandDialog;
    expandDialog = null;
    if (dialog.open) dialog.close();
    dialog.remove();
    if (!destroyed) view.focus();
  }

  function openExpand(): void {
    if (renderedSvg === null || expandDialog !== null) return;
    const dialog = document.createElement("dialog");
    if (typeof dialog.showModal !== "function") return;
    dialog.className = "mermaid-expand";
    dialog.setAttribute("aria-label", `${MERMAID_FAMILY_LABELS[family]}, expanded`);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "mermaid-expand-close";
    close.textContent = "Close";
    close.setAttribute("aria-label", "Close expanded diagram");
    const canvas = document.createElement("div");
    canvas.className = "mermaid-expand-canvas";
    canvas.innerHTML = renderedSvg;
    dialog.append(close, canvas);
    dialog.addEventListener("close", closeExpand);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeExpand();
    });
    close.addEventListener("click", closeExpand);
    document.body.append(dialog);
    expandDialog = dialog;
    dialog.showModal();
    close.focus();
  }

  function selectedIndex(): number {
    const params = currentLanguage();
    const index = items.findIndex((item) => item.dataset.language === params);
    return index === -1 ? 0 : index;
  }

  function focusItem(index: number): void {
    const count = items.length;
    if (count === 0) return;
    const item = items[((index % count) + count) % count];
    if (!item) return;
    for (const other of items) {
      if (other !== item) delete other.dataset.active;
    }
    item.dataset.active = "true";
    item.focus();
  }

  function focusedIndex(): number {
    return items.findIndex((item) => item === document.activeElement);
  }

  const closeOnOutside = (event: MouseEvent) => {
    if (event.target instanceof Node && toolbar.contains(event.target)) return;
    setOpen(false);
  };

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    if (open) {
      document.addEventListener("mousedown", closeOnOutside, true);
    } else {
      document.removeEventListener("mousedown", closeOnOutside, true);
      for (const item of items) delete item.dataset.active;
    }
    paint();
  }

  function openAndFocus(index: number): void {
    setOpen(true);
    focusItem(index);
  }

  function closeToTrigger(): void {
    setOpen(false);
    trigger.focus();
  }

  function chooseLanguage(value: string): void {
    setOpen(false);
    const pos = getPos();
    if (pos === undefined || !view.editable) return;
    setCodeBlockLanguage(pos, value)(view.state, view.dispatch);
    view.focus();
  }

  function jumpToTypeAhead(character: string): void {
    if (typeAheadReset !== null) window.clearTimeout(typeAheadReset);
    typeAheadReset = window.setTimeout(() => {
      typeAheadReset = null;
      typeAhead = "";
    }, TYPE_AHEAD_RESET_MS);
    typeAhead += character.toLowerCase();
    const sameLetterRepeated = /^(.)\1+$/.test(typeAhead);
    const query = sameLetterRepeated ? typeAhead.slice(0, 1) : typeAhead;
    const start = focusedIndex();
    const count = items.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (start + step) % count;
      const label = items[index]?.textContent?.toLowerCase() ?? "";
      if (label.startsWith(query)) {
        focusItem(index);
        return;
      }
    }
  }

  for (const option of CODE_LANGUAGES) {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("role", "option");
    button.dataset.language = option.value;
    button.textContent = option.label;
    button.addEventListener("click", () => chooseLanguage(option.value));
    item.append(button);
    menu.append(item);
    items.push(button);
  }

  trigger.addEventListener("click", () => {
    if (!view.editable) return;
    setOpen(!open);
  });

  trigger.addEventListener("keydown", (event) => {
    if (!view.editable) return;
    switch (event.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        event.preventDefault();
        openAndFocus(selectedIndex());
        break;
      case "ArrowUp":
        event.preventDefault();
        openAndFocus(items.length - 1);
        break;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        closeToTrigger();
        break;
      default:
        break;
    }
  });

  menu.addEventListener("keydown", (event) => {
    const index = focusedIndex();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const item = items[index];
        if (item) chooseLanguage(item.dataset.language ?? "");
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeToTrigger();
        break;
      case "Tab":
        closeToTrigger();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          jumpToTypeAhead(event.key);
        }
        break;
    }
  });

  toolbar.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && toolbar.contains(next)) return;
    setOpen(false);
  });

  copy.addEventListener("click", () => {
    void writeCodeBlockClipboard(codeBlockClipboardText(node)).then((copied) => {
      copy.textContent = copied ? "Copied" : "Copy unavailable";
      if (copyReset !== null) window.clearTimeout(copyReset);
      copyReset = window.setTimeout(() => {
        copyReset = null;
        copy.textContent = "Copy";
      }, 1_500);
    });
  });

  modeToggle.addEventListener("click", () => {
    const next: MermaidViewMode = mode === "preview" ? "source" : "preview";
    setMode(next);
    const pos = getPos();
    if (pos === undefined) return;
    if (next === "source") {
      const end = pos + node.nodeSize - 1;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    } else {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    }
    view.focus();
  });

  expand.addEventListener("click", openExpand);

  preview.addEventListener("mousedown", (event) => {
    event.preventDefault();
    selectBlock();
  });

  dom.addEventListener(MERMAID_MODE_EVENT, (event) => {
    const request = (event as CustomEvent<MermaidModeRequest>).detail;
    if (request === "preview" || request === "source" || request === "toggle") setMode(request);
  });

  // Keeping the editor selection alive means the picker never has to restore
  // it, so choosing a language leaves the caret exactly where it was.
  toolbar.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  document.addEventListener("selectionchange", revealSourceForCaret);
  syncMermaid("unsupported", "");
  if (isRenderable()) observeTheme();
  paint();

  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type) return false;
      const previousFamily = family;
      const previousSource = node.textContent;
      const wasRenderable = isRenderable();
      node = next;
      syncMermaid(previousFamily, previousSource);
      if (!wasRenderable && isRenderable() && themeObserver === null) observeTheme();
      paint();
      return true;
    },
    stopEvent: (event) =>
      event.target instanceof Node &&
      (toolbar.contains(event.target) || preview.contains(event.target)),
    ignoreMutation: (mutation) =>
      (mutation.type === "attributes" && mutation.target === contentDOM) ||
      (mutation.target !== contentDOM && !contentDOM.contains(mutation.target)),
    destroy() {
      destroyed = true;
      document.removeEventListener("mousedown", closeOnOutside, true);
      document.removeEventListener("selectionchange", revealSourceForCaret);
      themeObserver?.disconnect();
      themeObserver = null;
      closeExpand();
      if (rerenderTimer !== null) clearTimeout(rerenderTimer);
      if (copyReset !== null) window.clearTimeout(copyReset);
      if (typeAheadReset !== null) window.clearTimeout(typeAheadReset);
    },
  };
}
