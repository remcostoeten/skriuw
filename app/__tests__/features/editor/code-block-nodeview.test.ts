import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  codeBlockClipboardText,
  createCodeBlockNodeView,
  setCodeBlockLanguage,
  writeCodeBlockClipboard,
} from "../../../src/features/editor/code-block-nodeview";
import { CODE_LANGUAGES, resolveHighlightLanguage } from "../../../src/features/editor/code-highlight";
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
  const paragraph = productSchema.node("paragraph", null, [
    productSchema.text("not code"),
  ]);

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
    this.listeners.set(type, list.filter((entry) => entry !== listener));
  }

  dispatchEvent(event: FakeEvent): boolean {
    event.target = this;
    let cursor: FakeElement | null = this;
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
}

class FakeEvent {
  type: string;
  key: string;
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

const fakeDocument = {
  activeElement: null as FakeElement | null,
  body: new FakeElement("body"),
  createElement: (tagName: string) => new FakeElement(tagName),
  createTextNode: (text: string) => ({ textContent: text }),
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const GLOBAL_DOM_KEYS = ["document", "Node", "window"] as const;
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
