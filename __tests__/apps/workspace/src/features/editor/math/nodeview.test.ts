import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { MATH_EDIT_EVENT } from "@/features/editor/math/commands";
import {
  createMathBlockNodeView,
  createMathInlineNodeView,
  type MathNodeViewDeps,
} from "@/features/editor/math/nodeview";
import type { MathRenderResult } from "@/features/editor/math/render";
import { productSchema } from "@/features/editor/schema";

type Listener = (event: FakeEvent) => void;

class FakeElement {
  tagName: string;
  id = "";
  className = "";
  textContent = "";
  innerHTML = "";
  title = "";
  hidden = false;
  type = "";
  value = "";
  placeholder = "";
  spellcheck = true;
  autocomplete = "";
  selectionStart = 0;
  selectionEnd = 0;
  contentEditable = "inherit";
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  private attributes = new Map<string, string>();
  private listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...nodes: FakeElement[]): void {
    for (const child of nodes) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  contains(other: FakeElement | null): boolean {
    let cursor: FakeElement | null = other;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parentElement;
    }
    return false;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((entry) => entry !== listener),
    );
  }

  dispatchEvent(event: FakeEvent): boolean {
    event.target ??= this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (!event.propagationStopped) this.parentElement?.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  focus(): void {
    fakeDocument.activeElement = this;
  }

  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  remove(): void {
    if (fakeDocument.activeElement && this.contains(fakeDocument.activeElement)) {
      const focused = fakeDocument.activeElement;
      fakeDocument.activeElement = null;
      focused.dispatchEvent(new FakeEvent("blur"));
    }
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

class FakeEvent {
  type: string;
  key: string;
  shiftKey: boolean;
  target: FakeElement | null = null;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string, key = "", shiftKey = false) {
    this.type = type;
    this.key = key;
    this.shiftKey = shiftKey;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

const fakeDocument = {
  activeElement: null as FakeElement | null,
  createElement: (tagName: string) => new FakeElement(tagName),
};

const saved = new Map<string, unknown>();

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete (globalThis as any)[key];
    else (globalThis as any)[key] = value;
  }
  saved.clear();
});

function installFakeDom(): void {
  for (const key of ["document", "Node"]) saved.set(key, (globalThis as any)[key]);
  (globalThis as any).document = fakeDocument;
  (globalThis as any).Node = FakeElement;
  fakeDocument.activeElement = null;
}

function syncDeps(results: Record<string, MathRenderResult>): MathNodeViewDeps & {
  rendered: string[];
} {
  const rendered: string[] = [];
  return {
    rendered,
    render: async (tex) => {
      rendered.push(tex);
      return results[tex] ?? { ok: true, html: `<math>${tex}</math>` };
    },
    cached: () => null,
    schedule: (callback) => callback(),
    debounceMs: 0,
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

function harness(
  document: ProseMirrorNode,
  selection?: (doc: ProseMirrorNode) => TextSelection | NodeSelection,
) {
  installFakeDom();
  let state = EditorState.create({ doc: document, selection: selection?.(document) });
  let focused = 0;
  const view = {
    editable: true,
    get state() {
      return state;
    },
    dispatch: (transaction: Transaction) => {
      state = state.apply(transaction);
    },
    focus: () => {
      focused += 1;
    },
  } as unknown as EditorView;
  return { view, state: () => state, focused: () => focused };
}

function inlineDocument(tex: string): ProseMirrorNode {
  const formula = productSchema.nodes.math_inline?.create({ tex });
  assert.ok(formula);
  return productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("a"),
      formula,
      productSchema.text("b"),
    ]),
  ]);
}

function mountInline(tex: string, results: Record<string, MathRenderResult> = {}) {
  const document = inlineDocument(tex);
  const context = harness(document, (doc) => NodeSelection.create(doc, 2));
  const deps = syncDeps(results);
  const nodeView = createMathInlineNodeView(
    document.firstChild!.child(1),
    context.view,
    () => 2,
    deps,
  );
  const dom = nodeView.dom as unknown as FakeElement;
  function openEditor(): FakeElement {
    dom.dispatchEvent(new FakeEvent(MATH_EDIT_EVENT));
    const editor = dom.children[1];
    assert.ok(editor, "the popover editor opened");
    return editor.children[0]!;
  }
  function key(input: FakeElement, name: string, shiftKey = false): FakeEvent {
    const event = new FakeEvent("keydown", name, shiftKey);
    input.dispatchEvent(event);
    return event;
  }
  return { ...context, deps, nodeView, dom, openEditor, key };
}

test("inline math renders KaTeX output and names itself for assistive technology", async () => {
  const { dom } = mountInline("x^2");
  await settle();
  assert.equal(dom.getAttribute("aria-label"), "Inline math");
  assert.equal(dom.getAttribute("role"), "group");
  assert.equal(dom.children[0]?.innerHTML, "<math>x^2</math>");
  assert.equal(dom.dataset.state, "rendered");
});

test("invalid inline TeX shows its source in the error state instead of throwing", async () => {
  const { dom } = mountInline("x^{", { "x^{": { ok: false, message: "Expected '}'" } });
  await settle();
  assert.equal(dom.dataset.state, "error");
  assert.equal(dom.children[0]?.textContent, "x^{");
  assert.equal(dom.children[0]?.title, "Expected '}'");
});

test("the edit event opens a labelled TeX field that has focus", () => {
  const { openEditor } = mountInline("x");
  const input = openEditor();
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.value, "x");
  assert.equal(input.getAttribute("aria-label"), "Inline math TeX");
  assert.ok(input.getAttribute("aria-describedby"));
  assert.equal(fakeDocument.activeElement, input);
});

test("Enter applies the edit and puts the caret after the formula", () => {
  const { openEditor, key, state, focused } = mountInline("x");
  const input = openEditor();
  input.value = "  y + 1 ";
  const event = key(input, "Enter");
  assert.equal(event.defaultPrevented, true);
  assert.equal(state().doc.firstChild?.child(1).attrs.tex, "y + 1");
  assert.ok(state().selection instanceof TextSelection);
  assert.equal(state().selection.from, 3);
  assert.equal(focused(), 1);
});

test("Escape keeps the edit and returns to the text after the formula", () => {
  const { openEditor, key, state, dom } = mountInline("x");
  const input = openEditor();
  input.value = "z";
  key(input, "Escape");
  assert.equal(state().doc.firstChild?.child(1).attrs.tex, "z");
  assert.equal(state().selection.from, 3);
  assert.equal(dom.children.length, 1);
});

test("arrow keys at the ends of the field step out before or after the formula", () => {
  const first = mountInline("x");
  const input = first.openEditor();
  input.setSelectionRange(0, 0);
  first.key(input, "ArrowLeft");
  assert.equal(first.state().selection.from, 2);

  const second = mountInline("x");
  const other = second.openEditor();
  second.key(other, "ArrowRight");
  assert.equal(second.state().selection.from, 3);
});

test("arrow keys inside the field move the text caret, not the editor", () => {
  const { openEditor, key, dom } = mountInline("xy");
  const input = openEditor();
  input.setSelectionRange(1, 1);
  const event = key(input, "ArrowLeft");
  assert.equal(event.defaultPrevented, false);
  assert.equal(dom.children.length, 2);
});

test("Shift+Tab applies and moves before the formula", () => {
  const { openEditor, key, state } = mountInline("x");
  key(openEditor(), "Tab", true);
  assert.equal(state().selection.from, 2);
});

test("an emptied formula is removed when the field closes", () => {
  const { openEditor, key, state } = mountInline("x");
  const input = openEditor();
  input.value = "";
  key(input, "Backspace");
  assert.equal(state().doc.textContent, "ab");
  assert.equal(state().doc.firstChild?.childCount, 1);
});

test("typing previews live without touching the document until applied", async () => {
  const { openEditor, state, dom, deps } = mountInline("x");
  const input = openEditor();
  input.value = "x^3";
  input.dispatchEvent(new FakeEvent("input"));
  await settle();
  assert.ok(deps.rendered.includes("x^3"));
  assert.equal(dom.children[0]?.innerHTML, "<math>x^3</math>");
  assert.equal(state().doc.firstChild?.child(1).attrs.tex, "x");
});

test("leaving the field applies the edit without moving the caret", () => {
  const { openEditor, state } = mountInline("x");
  const input = openEditor();
  input.value = "w";
  input.dispatchEvent(new FakeEvent("blur"));
  assert.equal(state().doc.firstChild?.child(1).attrs.tex, "w");
  assert.ok(state().selection instanceof NodeSelection);
});

test("a click selects the formula and opens the field", () => {
  const document = inlineDocument("x");
  const context = harness(document, (doc) => TextSelection.create(doc, 1));
  const nodeView = createMathInlineNodeView(
    document.firstChild!.child(1),
    context.view,
    () => 2,
    syncDeps({}),
  );
  const dom = nodeView.dom as unknown as FakeElement;
  dom.dispatchEvent(new FakeEvent("click"));
  assert.ok(context.state().selection instanceof NodeSelection);
  assert.equal(dom.children.length, 2);
});

function mountBlock(tex: string, results: Record<string, MathRenderResult> = {}) {
  const document = productSchema.node("doc", null, [
    productSchema.node("math_block", null, tex ? [productSchema.text(tex)] : []),
  ]);
  const context = harness(document);
  const nodeView = createMathBlockNodeView(
    document.firstChild!,
    context.view,
    () => 0,
    syncDeps(results),
  );
  const dom = nodeView.dom as unknown as FakeElement;
  const [source, preview, error] = dom.children;
  return { ...context, nodeView, dom, source: source!, preview: preview!, error: error! };
}

test("a math block keeps its source editable and renders a display preview", async () => {
  const { nodeView, dom, preview } = mountBlock("a^2 + b^2");
  await settle();
  assert.equal(dom.getAttribute("aria-label"), "Math block");
  assert.equal(dom.dataset.state, "rendered");
  assert.equal(preview.innerHTML, "<math>a^2 + b^2</math>");
  assert.equal(preview.contentEditable, "false");
  assert.ok(nodeView.contentDOM);
});

test("a math block with invalid TeX keeps the last good render and shows the error", async () => {
  const { nodeView, dom, preview, error } = mountBlock("x", {
    "x^{": { ok: false, message: "Missing }" },
  });
  await settle();
  nodeView.update?.(
    productSchema.node("math_block", null, [productSchema.text("x^{")]),
    [],
    {} as never,
  );
  await settle();
  assert.equal(dom.dataset.state, "error");
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, "Missing }");
  assert.equal(error.getAttribute("role"), "status");
  assert.equal(preview.innerHTML, "<math>x</math>");
});

test("an empty math block shows its source with a placeholder state", () => {
  const { dom } = mountBlock("");
  assert.equal(dom.dataset.state, "empty");
});

test("clicking the rendering moves the caret into the source", async () => {
  const { preview, state } = mountBlock("x");
  await settle();
  const event = new FakeEvent("mousedown");
  preview.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(state().selection.$from.parent.type.name, "math_block");
  assert.equal(state().selection.$from.parentOffset, 1);
});
