import type { Node as ProseMirrorNode } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { MATH_EDIT_EVENT } from "./math-commands";
import {
  cachedMathRender,
  renderMath,
  type MathRenderResult,
  type MathRenderer,
} from "./math-render";

const BLOCK_RERENDER_DEBOUNCE_MS = 120;
const INLINE_PREVIEW_DEBOUNCE_MS = 60;

export type MathNodeViewDeps = {
  render: MathRenderer;
  cached: (tex: string, displayMode: boolean) => MathRenderResult | null;
  schedule: (callback: () => void) => void;
  debounceMs: number;
};

function idleSchedule(callback: () => void): void {
  const host = globalThis as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (typeof host.requestIdleCallback === "function") {
    host.requestIdleCallback(callback, { timeout: 300 });
    return;
  }
  setTimeout(callback, 0);
}

const blockDeps: MathNodeViewDeps = {
  render: (tex, displayMode) => renderMath(tex, displayMode),
  cached: cachedMathRender,
  schedule: idleSchedule,
  debounceMs: BLOCK_RERENDER_DEBOUNCE_MS,
};

const inlineDeps: MathNodeViewDeps = { ...blockDeps, debounceMs: INLINE_PREVIEW_DEBOUNCE_MS };

type MathPaintState = "empty" | "pending" | "rendered" | "error";

let inlineEditorSequence = 0;

function renderer(deps: MathNodeViewDeps, displayMode: boolean) {
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function cancel(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function run(tex: string, apply: (result: MathRenderResult) => void): void {
    const current = ++sequence;
    deps.schedule(() => {
      if (destroyed || current !== sequence) return;
      void deps.render(tex, displayMode).then(
        (result) => {
          if (!destroyed && current === sequence) apply(result);
        },
        (error: unknown) => {
          if (!destroyed && current === sequence) {
            apply({ ok: false, message: error instanceof Error ? error.message : String(error) });
          }
        },
      );
    });
  }

  return {
    request(tex: string, immediate: boolean, apply: (result: MathRenderResult) => void): void {
      cancel();
      const cached = deps.cached(tex, displayMode);
      if (cached) {
        ++sequence;
        apply(cached);
        return;
      }
      if (immediate) {
        run(tex, apply);
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        run(tex, apply);
      }, deps.debounceMs);
    },
    destroy(): void {
      destroyed = true;
      cancel();
    },
  };
}

/**
 * @name createMathBlockNodeView
 * @description Display math: the TeX source is the node's editable content
 * and a KaTeX rendering sits below it. The source collapses while the caret is
 * elsewhere, and parse errors show as a quiet line under the last good render.
 *
 * @example
 * nodeViews: { math_block: (node, view, getPos) => createMathBlockNodeView(node, view, getPos) }
 */
export function createMathBlockNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
  deps: MathNodeViewDeps = blockDeps,
): NodeView {
  let node = initialNode;
  const dom = document.createElement("div");
  dom.className = "math-block";
  dom.dataset.math = "block";
  dom.setAttribute("role", "group");
  dom.setAttribute("aria-label", "Math block");
  const source = document.createElement("pre");
  source.className = "math-block-source";
  source.setAttribute("aria-label", "TeX source");
  const contentDOM = document.createElement("code");
  source.append(contentDOM);
  const preview = document.createElement("div");
  preview.className = "math-block-preview";
  preview.contentEditable = "false";
  const error = document.createElement("div");
  error.className = "math-error";
  error.contentEditable = "false";
  error.setAttribute("role", "status");
  error.hidden = true;
  dom.append(source, preview, error);

  const pipeline = renderer(deps, true);
  let hasRendering = false;

  function setState(state: MathPaintState): void {
    dom.dataset.state = state;
  }

  function apply(result: MathRenderResult): void {
    if (result.ok) {
      preview.innerHTML = result.html;
      hasRendering = true;
      error.textContent = "";
      error.hidden = true;
      setState("rendered");
      return;
    }
    error.textContent = result.message;
    error.hidden = false;
    setState("error");
  }

  function paint(immediate: boolean): void {
    const tex = node.textContent;
    if (tex.trim() === "") {
      preview.innerHTML = "";
      hasRendering = false;
      error.textContent = "";
      error.hidden = true;
      setState("empty");
      return;
    }
    if (!hasRendering) setState("pending");
    pipeline.request(tex, immediate, apply);
  }

  preview.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const pos = getPos();
    if (pos === undefined || !view.editable) return;
    const end = pos + node.nodeSize - 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    view.focus();
  });

  paint(true);

  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type) return false;
      const changed = next.textContent !== node.textContent;
      node = next;
      if (changed) paint(false);
      return true;
    },
    stopEvent: (event) => event.target instanceof Node && preview.contains(event.target),
    ignoreMutation: (mutation) =>
      mutation.target !== contentDOM && !contentDOM.contains(mutation.target),
    destroy() {
      pipeline.destroy();
    },
  };
}

type InlineExit = "before" | "after" | "stay";

/**
 * @name createMathInlineNodeView
 * @description Inline math: an atom that shows its KaTeX rendering. Enter on
 * the selected node, a click, or the insert command opens a small popover
 * editor with a live preview. Enter, Escape, and Tab apply and return to the
 * text; arrow keys at either end of the field step out before or after the node.
 *
 * @example
 * nodeViews: { math_inline: (node, view, getPos) => createMathInlineNodeView(node, view, getPos) }
 */
export function createMathInlineNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
  deps: MathNodeViewDeps = inlineDeps,
): NodeView {
  let node = initialNode;
  const dom = document.createElement("span");
  dom.className = "math-inline";
  dom.dataset.math = "inline";
  dom.contentEditable = "false";
  dom.setAttribute("role", "group");
  dom.setAttribute("aria-label", "Inline math");
  dom.setAttribute("aria-keyshortcuts", "Enter");
  const rendered = document.createElement("span");
  rendered.className = "math-inline-render";
  dom.append(rendered);

  const pipeline = renderer(deps, false);
  let popover: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let status: HTMLElement | null = null;
  let closing = false;

  function tex(): string {
    return String(node.attrs.tex ?? "");
  }

  function apply(value: string, result: MathRenderResult): void {
    if (result.ok) {
      rendered.innerHTML = result.html;
      dom.dataset.state = "rendered";
    } else {
      rendered.textContent = value;
      dom.dataset.state = "error";
    }
    rendered.title = result.ok ? "" : result.message;
    if (status) status.textContent = result.ok ? "" : result.message;
  }

  function paint(value: string, immediate: boolean): void {
    if (value.trim() === "") {
      rendered.textContent = "";
      rendered.title = "";
      dom.dataset.state = "empty";
      if (status) status.textContent = "";
      return;
    }
    if (dom.dataset.state !== "rendered") {
      rendered.textContent = value;
      dom.dataset.state = "pending";
    }
    pipeline.request(value.trim(), immediate, (result) => apply(value, result));
  }

  function removePopover(): void {
    const current = popover;
    popover = null;
    input = null;
    status = null;
    delete dom.dataset.editing;
    current?.remove();
  }

  function close(exit: InlineExit): void {
    if (!input || closing) return;
    closing = true;
    const value = input.value.trim();
    removePopover();
    closing = false;
    const pos = getPos();
    const current = pos === undefined ? null : view.state.doc.nodeAt(pos);
    if (pos === undefined || !current || current.type !== node.type) {
      paint(tex(), true);
      return;
    }
    const transaction = view.state.tr;
    let caret: number;
    if (value === "") {
      transaction.delete(pos, pos + current.nodeSize);
      caret = pos;
    } else {
      if (value !== current.attrs.tex) {
        transaction.setNodeAttribute(pos, "tex", value);
      }
      caret = exit === "before" ? pos : pos + current.nodeSize;
    }
    if (exit !== "stay" || value === "") {
      transaction.setSelection(TextSelection.create(transaction.doc, caret));
    }
    if (transaction.docChanged || transaction.selectionSet) view.dispatch(transaction);
    paint(value === "" ? "" : value, true);
    if (exit !== "stay") view.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const field = input;
    if (!field) return;
    const atStart = field.selectionStart === 0 && field.selectionEnd === 0;
    const atEnd =
      field.selectionStart === field.value.length && field.selectionEnd === field.value.length;
    let exit: InlineExit | null = null;
    if (event.key === "Enter" || event.key === "Escape") exit = "after";
    else if (event.key === "Tab") exit = event.shiftKey ? "before" : "after";
    else if (event.key === "ArrowLeft" && atStart) exit = "before";
    else if (event.key === "ArrowRight" && atEnd) exit = "after";
    else if (event.key === "Backspace" && field.value === "") exit = "before";
    if (exit === null) return;
    event.preventDefault();
    event.stopPropagation();
    close(exit);
  }

  function open(): void {
    if (popover || !view.editable) return;
    const container = document.createElement("span");
    container.className = "math-inline-editor";
    const field = document.createElement("input");
    field.type = "text";
    field.className = "math-inline-input";
    field.spellcheck = false;
    field.autocomplete = "off";
    field.value = tex();
    field.placeholder = "TeX, e.g. x^2";
    field.setAttribute("aria-label", "Inline math TeX");
    const message = document.createElement("span");
    message.className = "math-error";
    message.id = `math-inline-status-${++inlineEditorSequence}`;
    message.setAttribute("role", "status");
    const hint = document.createElement("span");
    hint.className = "math-inline-hint";
    hint.textContent = "Enter to apply";
    field.setAttribute("aria-describedby", message.id);
    container.append(field, message, hint);
    field.addEventListener("keydown", onKeyDown);
    field.addEventListener("input", () => paint(field.value, false));
    field.addEventListener("blur", () => close("stay"));
    popover = container;
    input = field;
    status = message;
    dom.dataset.editing = "true";
    dom.append(container);
    paint(field.value, true);
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }

  function selectAndOpen(event: MouseEvent): void {
    if (event.target instanceof Node && popover?.contains(event.target)) return;
    event.preventDefault();
    const pos = getPos();
    if (pos === undefined || !view.editable) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    open();
  }

  dom.addEventListener("click", selectAndOpen);
  dom.addEventListener(MATH_EDIT_EVENT, open);

  paint(tex(), true);

  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      const changed = next.attrs.tex !== node.attrs.tex;
      node = next;
      if (changed && !popover) paint(tex(), true);
      return true;
    },
    stopEvent: (event) =>
      event.target instanceof Node && popover !== null && popover.contains(event.target),
    ignoreMutation: () => true,
    destroy() {
      pipeline.destroy();
      dom.removeEventListener("click", selectAndOpen);
      dom.removeEventListener(MATH_EDIT_EVENT, open);
      removePopover();
    },
  };
}
