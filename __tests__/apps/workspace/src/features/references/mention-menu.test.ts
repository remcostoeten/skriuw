import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createMentionMenu } from "@/features/references/mention-menu";
import {
  createMentionPlugin,
  mentionMenuItems,
  type MentionContext,
} from "@/features/references/mention-plugin";
import { productSchema } from "@/features/editor/schema";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { setupDOMStub } from "../../shared/dom-stub";
import { referenceFixture } from "./fixtures";

type StubElement = HTMLElement & { children: StubElement[] };

function createHarness() {
  setupDOMStub();
  const { snapshot, references } = referenceFixture();
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  const context: MentionContext = {
    getState: () => store.getState(),
    applyReferenceOperations: (operations) => {
      store.applyReferenceOperations(operations);
    },
    createNote: () => {},
  };
  const host = document.createElement("div") as StubElement;
  const dom = document.createElement("div") as StubElement;
  host.appendChild(dom);
  let editorState = EditorState.create({
    doc: productSchema.node("doc", null, [productSchema.node("paragraph")]),
    plugins: [createMentionPlugin(context)],
  });
  const view = {
    dom,
    get state() {
      return editorState;
    },
    dispatch(transaction: Transaction) {
      editorState = editorState.apply(transaction);
    },
    coordsAtPos: () => ({ left: 100, right: 150, top: 50, bottom: 70 }),
    focus() {},
  } as unknown as EditorView;
  function type(text: string) {
    for (const character of text) {
      view.dispatch(view.state.tr.insertText(character));
    }
  }
  return { host, dom, view, context, type };
}

function options(root: StubElement): StubElement[] {
  return root.children.filter((child) => child.getAttribute("role") === "option");
}

test("an active trigger renders a positioned listbox of suggestions beside the editor", () => {
  const { host, dom, view, context, type } = createHarness();
  type("see #al");

  createMentionMenu(view, context);

  const [, root, status] = host.children;
  assert.ok(root && status);
  assert.equal(root.getAttribute("role"), "listbox");
  assert.equal(root.hidden, false);
  assert.equal(root.style.left, "100px");
  assert.equal(root.style.top, "74px");
  const items = mentionMenuItems(context.getState(), "#", "al");
  const rendered = options(root);
  assert.equal(rendered.length, items.length);
  assert.equal(rendered[0]?.textContent, "#alpha");
  assert.equal(rendered[0]?.getAttribute("aria-selected"), "true");
  assert.equal(status.textContent, `${items.length} suggestion${items.length === 1 ? "" : "s"}`);
  assert.equal(dom.getAttribute("aria-activedescendant"), "mention-option-0");
});

test("closing the trigger hides the menu and destroy removes it from the DOM", () => {
  const { host, dom, view, context, type } = createHarness();
  type("see #al");
  const menu = createMentionMenu(view, context);
  const [, root] = host.children;
  assert.ok(root);

  const previous = view.state;
  type(" ");
  menu.update(view, previous);
  assert.equal(root.hidden, true);
  assert.equal(root.children.length, 0);
  assert.equal(dom.getAttribute("aria-activedescendant"), null);

  menu.destroy();
  assert.deepEqual(host.children, [dom]);
});
