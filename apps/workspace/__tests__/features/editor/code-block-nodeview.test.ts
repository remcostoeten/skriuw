import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  MERMAID_MODE_EVENT,
  codeBlockClipboardText,
  createCodeBlockNodeView,
  createMermaidPreviewSelectionPlugin,
  enterMermaidSource,
  exitMermaidSource,
  mermaidBlockAtSelection,
  setCodeBlockLanguage,
  toggleMermaidSource,
  writeCodeBlockClipboard,
  type CodeBlockNodeViewDeps,
} from "../../../src/features/editor/code-block-nodeview";
import type { MermaidRenderResult } from "../../../src/features/editor/mermaid-render";
import {
  CODE_LANGUAGES,
  resolveHighlightLanguage,
} from "../../../src/features/editor/code-highlight";
import { productSchema, serializeProductMarkdown } from "../../../src/features/editor/schema";

function stateWithCodeBlock(params: string, code: string): EditorState {
  return EditorState.create({
    doc: productSchema.node("doc", null, [
      productSchema.node("code_block", { params }, [productSchema.text(code)]),
    ]),
  });
}

function applyLanguage(state: EditorState, pos: number, language: string): EditorState {
  let applied: Transaction | null = null;
  setCodeBlockLanguage(pos, language)(state, (transaction) => {
    applied = transaction;
  });
  return applied ? state.apply(applied) : state;
}

test("setting a language writes the params attribute", () => {
  const state = stateWithCodeBlock("", "const a = 1;");
  const next = applyLanguage(state, 0, "ts");
  assert.equal(next.doc.firstChild?.attrs.params, "ts");
  assert.equal(next.doc.firstChild?.textContent, "const a = 1;");
});

test("clearing a language writes an empty params attribute", () => {
  const state = stateWithCodeBlock("rust", "fn main() {}");
  const next = applyLanguage(state, 0, "");
  assert.equal(next.doc.firstChild?.attrs.params, "");
});

test("setting the language already in place is a no-op", () => {
  const state = stateWithCodeBlock("go", "func main() {}");
  assert.equal(setCodeBlockLanguage(0, "go")(state, undefined), false);
});

test("the command refuses a position that is not a code block", () => {
  const state = EditorState.create({
    doc: productSchema.node("doc", null, [
      productSchema.node("paragraph", null, [productSchema.text("prose")]),
    ]),
  });
  assert.equal(setCodeBlockLanguage(0, "ts")(state, undefined), false);
  assert.equal(setCodeBlockLanguage(99, "ts")(state, undefined), false);
});

test("a language change round-trips into the markdown fence", () => {
  const state = stateWithCodeBlock("", "SELECT 1;");
  const next = applyLanguage(state, 0, "sql");
  assert.equal(serializeProductMarkdown(next.doc).trimEnd(), "```sql\nSELECT 1;\n```");
});

test("codeBlockClipboardText returns only code block content", () => {
  const code = productSchema.node("code_block", { params: "ts" }, [
    productSchema.text("const answer = 42;"),
  ]);
  const paragraph = productSchema.node("paragraph", null, [productSchema.text("not code")]);

  assert.equal(codeBlockClipboardText(code), "const answer = 42;");
  assert.equal(codeBlockClipboardText(paragraph), "");
});

test("writeCodeBlockClipboard reports missing, successful, and rejected writers", async () => {
  assert.equal(await writeCodeBlockClipboard("code", undefined), false);
  let written = "";
  assert.equal(
    await writeCodeBlockClipboard("code", {
      writeText: async (text) => {
        written = text;
      },
    }),
    true,
  );
  assert.equal(written, "code");
  assert.equal(
    await writeCodeBlockClipboard("code", {
      writeText: async () => {
        throw new Error("denied");
      },
    }),
    false,
  );
});

test("every offered language except plain text resolves to a grammar", () => {
  for (const option of CODE_LANGUAGES) {
    const resolved = resolveHighlightLanguage(option.value);
    assert.equal(resolved === null, option.value === "", `${option.value} did not resolve`);
  }
});

type Listener = (event: any) => void;

class FakeElement {
  tagName: string;
  id = "";
  className = "";
  textContent = "";
  innerHTML = "";
  hidden = false;
  type = "";
  tabIndex = 0;
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
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((entry) => entry !== listener),
    );
  }

  dispatchEvent(event: FakeEvent): boolean {
    event.target = this;
    let cursor: FakeElement | null = event.target;
    while (cursor && !event.propagationStopped) {
      for (const listener of cursor.listeners.get(event.type) ?? []) listener(event);
      cursor = cursor.parentElement;
    }
    return !event.defaultPrevented;
  }

  focus(): void {
    const previous = fakeDocument.activeElement;
    if (previous === this) return;
    fakeDocument.activeElement = this;
    previous?.dispatchEvent(new FakeEvent("focusout", { relatedTarget: this }));
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

class FakeEvent {
  type: string;
  key: string;
  detail: unknown = null;
  ctrlKey = false;
  metaKey = false;
  altKey = false;
  target: FakeElement | null = null;
  relatedTarget: FakeElement | null;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string, init: { key?: string; relatedTarget?: FakeElement | null } = {}) {
    this.type = type;
    this.key = init.key ?? "";
    this.relatedTarget = init.relatedTarget ?? null;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  disconnected = false;
  target: unknown = null;
  constructor(readonly callback: () => void) {
    FakeMutationObserver.instances.push(this);
  }
  observe(target: unknown): void {
    this.target = target;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

const fakeDocument = {
  activeElement: null as FakeElement | null,
  body: new FakeElement("body"),
  documentElement: new FakeElement("html"),
  createElement: (tagName: string) => new FakeElement(tagName),
  createTextNode: (text: string) => ({ textContent: text }),
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const GLOBAL_DOM_KEYS = ["document", "Node", "window", "MutationObserver"] as const;
const hostGlobals = new Map<string, unknown>();

afterEach(() => {
  for (const key of GLOBAL_DOM_KEYS) {
    if (!hostGlobals.has(key)) continue;
    const previous = hostGlobals.get(key);
    if (previous === undefined) {
      delete (globalThis as any)[key];
    } else {
      (globalThis as any)[key] = previous;
    }
  }
  hostGlobals.clear();
});

function installFakeDom(): void {
  for (const key of GLOBAL_DOM_KEYS) {
    if (!hostGlobals.has(key)) hostGlobals.set(key, (globalThis as any)[key]);
  }
  (globalThis as any).document = fakeDocument;
  (globalThis as any).Node = FakeElement;
  (globalThis as any).MutationObserver = FakeMutationObserver;
  FakeMutationObserver.instances = [];
  (globalThis as any).window = {
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  fakeDocument.activeElement = null;
}

function mountCodeBlock(params: string) {
  installFakeDom();
  let state = stateWithCodeBlock(params, "code");
  const view = {
    editable: true,
    get state() {
      return state;
    },
    dispatch: (transaction: Transaction) => {
      state = state.apply(transaction);
    },
    focus: () => {
      fakeDocument.activeElement = null;
    },
  } as unknown as EditorView;
  const nodeView = createCodeBlockNodeView(state.doc.firstChild!, view, () => 0);
  const dom = nodeView.dom as unknown as FakeElement;
  const toolbar = dom.children[0];
  const [trigger, copy, menu] = toolbar.children;
  const items = menu.children.map((item) => item.children[0]);
  return {
    nodeView,
    toolbar,
    trigger,
    copy,
    menu,
    items,
    language: () => String(state.doc.firstChild?.attrs.params ?? ""),
  };
}

function keydown(target: FakeElement, key: string): FakeEvent {
  const event = new FakeEvent("keydown", { key });
  target.dispatchEvent(event);
  return event;
}

test("the language trigger and menu carry listbox popup semantics", () => {
  const { trigger, menu, items } = mountCodeBlock("ts");
  assert.equal(trigger.getAttribute("aria-haspopup"), "listbox");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(trigger.getAttribute("aria-label"), "Code language");
  assert.ok(menu.id.length > 0);
  assert.equal(trigger.getAttribute("aria-controls"), menu.id);
  assert.equal(menu.getAttribute("role"), "listbox");
  assert.equal(menu.getAttribute("tabindex"), "-1");
  assert.equal(items.length, CODE_LANGUAGES.length);
  for (const item of items) {
    assert.equal(item.tabIndex, -1);
    assert.equal(item.getAttribute("role"), "option");
    assert.equal(item.parentElement?.getAttribute("role"), "presentation");
  }
  const selected = items.filter((item) => item.getAttribute("aria-selected") === "true");
  assert.deepEqual(
    selected.map((item) => item.dataset.language),
    ["ts"],
  );
});

test("every node view gets its own menu id", () => {
  const first = mountCodeBlock("");
  const second = mountCodeBlock("");
  assert.notEqual(first.menu.id, second.menu.id);
});

test("ArrowDown on the trigger opens the menu and focuses the selected item", () => {
  const { trigger, toolbar, items } = mountCodeBlock("rust");
  trigger.focus();
  const event = keydown(trigger, "ArrowDown");
  assert.equal(event.defaultPrevented, true);
  assert.equal(toolbar.dataset.open, "true");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  const rust = items.find((item) => item.dataset.language === "rust")!;
  assert.equal(fakeDocument.activeElement, rust);
  assert.equal(rust.dataset.active, "true");
});

test("ArrowUp on the trigger opens the menu at the last item", () => {
  const { trigger, items } = mountCodeBlock("");
  keydown(trigger, "ArrowUp");
  assert.equal(fakeDocument.activeElement, items[items.length - 1]);
});

test("arrow keys move focus with wrap and Home/End jump to the ends", () => {
  const { trigger, menu, items } = mountCodeBlock("");
  keydown(trigger, "Enter");
  assert.equal(fakeDocument.activeElement, items[0]);
  keydown(menu, "ArrowUp");
  assert.equal(fakeDocument.activeElement, items[items.length - 1]);
  keydown(menu, "ArrowDown");
  assert.equal(fakeDocument.activeElement, items[0]);
  keydown(menu, "End");
  assert.equal(fakeDocument.activeElement, items[items.length - 1]);
  keydown(menu, "Home");
  assert.equal(fakeDocument.activeElement, items[0]);
});

test("Escape in the menu closes it and returns focus to the trigger", () => {
  const { trigger, toolbar, menu } = mountCodeBlock("go");
  keydown(trigger, " ");
  assert.equal(toolbar.dataset.open, "true");
  const event = keydown(menu, "Escape");
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  assert.equal(toolbar.dataset.open, "false");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(fakeDocument.activeElement, trigger);
});

test("Enter on a focused item sets the language", () => {
  const { trigger, menu, toolbar, items, language } = mountCodeBlock("");
  keydown(trigger, "ArrowDown");
  const sql = items.findIndex((item) => item.dataset.language === "sql");
  for (let step = 0; step < sql; step += 1) keydown(menu, "ArrowDown");
  keydown(menu, "Enter");
  assert.equal(language(), "sql");
  assert.equal(toolbar.dataset.open, "false");
});

test("Tab closes the menu without cancelling the default so focus continues from the trigger", () => {
  const { trigger, menu, toolbar } = mountCodeBlock("");
  keydown(trigger, "ArrowDown");
  const event = keydown(menu, "Tab");
  assert.equal(event.defaultPrevented, false);
  assert.equal(toolbar.dataset.open, "false");
  assert.equal(fakeDocument.activeElement, trigger);
});

test("typing a letter jumps to the next matching language", () => {
  const { trigger, menu, items } = mountCodeBlock("");
  keydown(trigger, "ArrowDown");
  keydown(menu, "j");
  assert.equal(fakeDocument.activeElement?.dataset.language, "js");
  keydown(menu, "j");
  assert.equal(fakeDocument.activeElement?.dataset.language, "json");
  keydown(menu, "j");
  assert.equal(fakeDocument.activeElement?.dataset.language, "jsx");
  keydown(menu, "j");
  assert.equal(fakeDocument.activeElement?.dataset.language, "js");
  assert.ok(items.length > 0);
});

test("focus leaving the toolbar closes the menu", () => {
  const { trigger, toolbar } = mountCodeBlock("");
  keydown(trigger, "ArrowDown");
  const outside = new FakeElement("div");
  outside.focus();
  assert.equal(toolbar.dataset.open, "false");
});

const SEQUENCE = "sequenceDiagram\n  Alice->>Bob: Hello";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"></svg>';

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function mountMermaid(
  params: string,
  source: string,
  result: MermaidRenderResult = { ok: true, svg: SVG, width: 200, height: 80 },
  caretInside = false,
) {
  installFakeDom();
  const calls: { source: string; animate: boolean }[] = [];
  let nextResult = result;
  const deps: CodeBlockNodeViewDeps = {
    render: async (text, _palette, options) => {
      calls.push({ source: text, animate: options.animate });
      return nextResult;
    },
    rerenderDebounceMs: 10,
  };
  let state = stateWithCodeBlock(params, source);
  state = state.apply(
    state.tr.setSelection(
      caretInside ? TextSelection.create(state.doc, 1) : NodeSelection.create(state.doc, 0),
    ),
  );
  const view = {
    editable: true,
    get state() {
      return state;
    },
    dispatch: (transaction: Transaction) => {
      state = state.apply(transaction);
    },
    focus: () => {
      fakeDocument.activeElement = null;
    },
  } as unknown as EditorView;
  const nodeView = createCodeBlockNodeView(state.doc.firstChild!, view, () => 0, deps);
  const dom = nodeView.dom as unknown as FakeElement;
  const [toolbar, preview, code, error, note] = dom.children;
  const [, , , modeToggle, expand] = toolbar.children;
  function replaceSource(text: string): void {
    state = stateWithCodeBlock(params, text);
    nodeView.update!(state.doc.firstChild!, [], null as never);
  }
  return {
    nodeView,
    dom,
    preview,
    code,
    error,
    note,
    modeToggle,
    expand,
    calls,
    replaceSource,
    setResult: (value: MermaidRenderResult) => {
      nextResult = value;
    },
    selection: () => state.selection,
  };
}

test("a sequence fence renders a preview and hides its source", async () => {
  const { dom, preview, code, modeToggle, expand, calls } = mountMermaid("mermaid", SEQUENCE);
  assert.equal(dom.dataset.mermaid, "preview");
  assert.equal(preview.getAttribute("aria-label"), "Sequence diagram preview");
  assert.equal(preview.getAttribute("role"), "img");
  assert.equal(code.dataset.collapsed, "true");
  assert.equal(modeToggle.hidden, false);
  assert.equal(modeToggle.textContent, "Source");
  assert.equal(expand.hidden, true);
  await sleep(5);
  assert.deepEqual(calls, [{ source: SEQUENCE, animate: true }]);
  assert.equal(preview.innerHTML, SVG);
  assert.equal(expand.hidden, false);
});

test("a block mounted with the caret inside it opens in source mode", async () => {
  const { dom, code, calls } = mountMermaid("mermaid", SEQUENCE, undefined, true);
  assert.equal(dom.dataset.mermaid, "source");
  assert.equal(code.dataset.collapsed, undefined);
  await sleep(5);
  assert.equal(calls.length, 1);
});

test("an unsupported family keeps plain source with a quiet note and no toggle", async () => {
  const { dom, preview, code, note, modeToggle, calls } = mountMermaid(
    "mermaid",
    "gantt\n  title Plan",
  );
  assert.equal(dom.dataset.mermaid, undefined);
  assert.equal(preview.hidden, true);
  assert.equal(code.dataset.collapsed, undefined);
  assert.equal(note.hidden, false);
  assert.ok(note.textContent.includes("flowchart, sequence, state, class, and ER"));
  assert.equal(modeToggle.hidden, true);
  await sleep(5);
  assert.equal(calls.length, 0);
});

test("a non-mermaid fence shows neither preview nor note", () => {
  const { dom, note, modeToggle } = mountMermaid("ts", SEQUENCE);
  assert.equal(dom.dataset.mermaid, undefined);
  assert.equal(note.hidden, true);
  assert.equal(modeToggle.hidden, true);
});

test("the toggle flips between preview and source and moves the selection", async () => {
  const { dom, code, modeToggle, selection } = mountMermaid("mermaid", SEQUENCE);
  await sleep(5);
  modeToggle.dispatchEvent(new FakeEvent("click"));
  assert.equal(dom.dataset.mermaid, "source");
  assert.equal(code.dataset.collapsed, undefined);
  assert.equal(modeToggle.textContent, "Preview");
  assert.equal(selection().constructor.name, "TextSelection");
  assert.equal(selection().from, SEQUENCE.length + 1);
  modeToggle.dispatchEvent(new FakeEvent("click"));
  assert.equal(dom.dataset.mermaid, "preview");
  assert.equal(code.dataset.collapsed, "true");
  assert.equal(selection().constructor.name, "NodeSelection");
});

test("a mode event from an editor command switches the view", async () => {
  const { dom } = mountMermaid("mermaid", SEQUENCE);
  const toggle = new FakeEvent(MERMAID_MODE_EVENT);
  toggle.detail = "toggle";
  dom.dispatchEvent(toggle);
  assert.equal(dom.dataset.mermaid, "source");
  const preview = new FakeEvent(MERMAID_MODE_EVENT);
  preview.detail = "preview";
  dom.dispatchEvent(preview);
  assert.equal(dom.dataset.mermaid, "preview");
});

test("editing the source re-renders once after the debounce, without animation", async () => {
  const { calls, replaceSource } = mountMermaid("mermaid", SEQUENCE);
  await sleep(5);
  replaceSource(`${SEQUENCE}\n  Bob-->>Alice: Hi`);
  replaceSource(`${SEQUENCE}\n  Bob-->>Alice: Hi there`);
  await sleep(40);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { source: `${SEQUENCE}\n  Bob-->>Alice: Hi there`, animate: false });
});

test("a failed render shows the message and keeps the last good preview", async () => {
  const { preview, error, setResult, replaceSource } = mountMermaid("mermaid", SEQUENCE);
  await sleep(5);
  assert.equal(error.hidden, true);
  setResult({ ok: false, message: "Parse error on line 2" });
  replaceSource(`${SEQUENCE}\n  Bob-->>`);
  await sleep(40);
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, "Parse error on line 2");
  assert.equal(error.getAttribute("role"), "status");
  assert.equal(preview.innerHTML, SVG);
});

test("a theme change re-renders and destroy disconnects the observer", async () => {
  const { nodeView, calls } = mountMermaid("mermaid", SEQUENCE);
  await sleep(5);
  const observer = FakeMutationObserver.instances[0];
  assert.ok(observer);
  assert.equal(observer.target, fakeDocument.documentElement);
  observer.callback();
  await sleep(5);
  assert.equal(calls.length, 2);
  nodeView.destroy!();
  assert.equal(observer.disconnected, true);
  observer.callback();
  await sleep(5);
  assert.equal(calls.length, 2);
});

test("a fence that becomes mermaid later starts observing and rendering", async () => {
  const { calls, nodeView } = mountMermaid("ts", SEQUENCE);
  await sleep(5);
  assert.equal(calls.length, 0);
  assert.equal(FakeMutationObserver.instances.length, 0);
  nodeView.update!(stateWithCodeBlock("mermaid", SEQUENCE).doc.firstChild!, [], null as never);
  await sleep(5);
  assert.equal(calls.length, 1);
  assert.equal(FakeMutationObserver.instances.length, 1);
});

function mermaidState(source: string, params = "mermaid"): EditorState {
  return EditorState.create({
    doc: productSchema.node("doc", null, [
      productSchema.node("paragraph", null, [productSchema.text("before")]),
      productSchema.node("code_block", { params }, [productSchema.text(source)]),
    ]),
  });
}

function runCommand(
  state: EditorState,
  command: typeof enterMermaidSource,
): { handled: boolean; state: EditorState } {
  let next = state;
  const handled = command(state, (transaction) => {
    next = state.apply(transaction);
  });
  return { handled, state: next };
}

test("Enter on a selected diagram opens the source with the caret at the end", () => {
  const base = mermaidState(SEQUENCE);
  const selected = base.apply(base.tr.setSelection(NodeSelection.create(base.doc, 8)));
  assert.deepEqual(mermaidBlockAtSelection(selected)?.selected, true);
  const { handled, state } = runCommand(selected, enterMermaidSource);
  assert.equal(handled, true);
  assert.equal(state.selection.constructor.name, "TextSelection");
  assert.equal(state.selection.from, 9 + SEQUENCE.length);
  assert.equal(enterMermaidSource(selected, undefined), true);
  const plainSelected = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 1)));
  assert.equal(enterMermaidSource(plainSelected, undefined), false);
});

test("Escape inside diagram source reselects the block", () => {
  const base = mermaidState(SEQUENCE);
  const inside = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 12)));
  assert.deepEqual(mermaidBlockAtSelection(inside), {
    pos: 8,
    node: inside.doc.child(1),
    selected: false,
  });
  const { handled, state } = runCommand(inside, exitMermaidSource);
  assert.equal(handled, true);
  assert.equal(state.selection.constructor.name, "NodeSelection");
  assert.equal(state.selection.from, 8);
  const outside = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 2)));
  assert.equal(exitMermaidSource(outside, undefined), false);
});

test("the commands ignore code blocks that are not renderable mermaid", () => {
  const gantt = mermaidState("gantt\n  title x");
  const inside = gantt.apply(gantt.tr.setSelection(TextSelection.create(gantt.doc, 12)));
  assert.equal(mermaidBlockAtSelection(inside), null);
  assert.equal(exitMermaidSource(inside, undefined), false);
  assert.equal(toggleMermaidSource(inside, undefined), false);
  const typescript = mermaidState(SEQUENCE, "ts");
  const insideTs = typescript.apply(
    typescript.tr.setSelection(TextSelection.create(typescript.doc, 12)),
  );
  assert.equal(toggleMermaidSource(insideTs, undefined), false);
  const renderable = mermaidState(SEQUENCE);
  const insideRenderable = renderable.apply(
    renderable.tr.setSelection(TextSelection.create(renderable.doc, 12)),
  );
  assert.equal(toggleMermaidSource(insideRenderable, undefined), true);
});

test("a browser selection inside a previewed block resolves to the block itself", () => {
  const plugin = createMermaidPreviewSelectionPlugin();
  const between = plugin.props.createSelectionBetween!;
  const state = mermaidState(SEQUENCE);
  function viewFor(mode: string | null) {
    return {
      state,
      nodeDOM: () => (mode === null ? null : { dataset: { mermaid: mode } }),
    } as unknown as EditorView;
  }
  const inside = between(viewFor("preview"), state.doc.resolve(12), state.doc.resolve(20));
  assert.ok(inside instanceof NodeSelection);
  assert.equal(inside?.from, 8);
  assert.equal(between(viewFor("source"), state.doc.resolve(12), state.doc.resolve(20)), null);
  assert.equal(between(viewFor(null), state.doc.resolve(12), state.doc.resolve(20)), null);
  assert.equal(between(viewFor("preview"), state.doc.resolve(2), state.doc.resolve(12)), null);
  const gantt = mermaidState("gantt\n  title x");
  assert.equal(between(viewFor("preview"), gantt.doc.resolve(12), gantt.doc.resolve(14)), null);
});
