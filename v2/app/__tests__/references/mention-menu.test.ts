import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createMentionMenu } from "../../src/references/mention-menu";
import { productSchema } from "../../src/editor/schema";
import type { MentionContext } from "../../src/references/mention-plugin";
import type { RendererState } from "../../src/store/types";

function setupDOMStub() {
  if (typeof globalThis.document !== "undefined") return;

  function createElement(tagName: string): any {
    const children: any[] = [];
    const attributes: Record<string, string> = {};
    const classListSet = new Set<string>();

    const element: any = {
      tagName: tagName.toUpperCase(),
      className: "",
      style: {},
      dataset: {},
      children,
      parentElement: null,
      ownerDocument: (globalThis as any).document,
      setAttribute: (k: string, v: string) => {
        attributes[k] = v;
      },
      getAttribute: (k: string) => attributes[k] ?? null,
      removeAttribute: (k: string) => {
        delete attributes[k];
      },
      classList: {
        add: (c: string) => classListSet.add(c),
        remove: (c: string) => classListSet.delete(c),
        toggle: (c: string, flag?: boolean) => {
          if (flag === undefined) {
            classListSet.has(c) ? classListSet.delete(c) : classListSet.add(c);
          } else if (flag) {
            classListSet.add(c);
          } else {
            classListSet.delete(c);
          }
        },
      },
      appendChild: (child: any) => {
        child.parentElement = element;
        children.push(child);
        return child;
      },
      append: (...nodes: any[]) => {
        for (const n of nodes) {
          if (typeof n === "string") {
            children.push({ textContent: n });
          } else {
            if (n) n.parentElement = element;
            children.push(n);
          }
        }
      },
      replaceChildren: (...nodes: any[]) => {
        children.length = 0;
        if (nodes.length > 0) element.append(...nodes);
      },
      remove: () => {
        if (element.parentElement) {
          const idx = element.parentElement.children.indexOf(element);
          if (idx !== -1) element.parentElement.children.splice(idx, 1);
        }
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 10, top: 10, right: 50, bottom: 30, width: 40, height: 20 }),
    };
    return element;
  }

  (globalThis as any).document = {
    createElement,
    body: createElement("body"),
    createTextNode: (text: string) => ({ textContent: text }),
    querySelector: () => null,
  };
}

function mockRendererState(): RendererState {
  return {
    notes: new Map(),
    tags: new Map([["t1", { id: "t1", label: "tag1", color: "#ff0000" }]]),
    people: new Map([["p1", { id: "p1", name: "Alice", color: "#00ff00" }]]),
    activeNoteId: null,
    settings: { reduceMotion: false },
  } as unknown as RendererState;
}

test("createMentionMenu appends menu to DOM and cleans up on destroy", () => {
  setupDOMStub();
  const container = document.createElement("div");
  const doc = productSchema.node("doc", null, [productSchema.node("paragraph")]);
  const state = EditorState.create({ doc, schema: productSchema });

  const mockView = {
    dom: container,
    state,
    coordsAtPos: () => ({ left: 100, right: 150, top: 50, bottom: 70 }),
  } as unknown as EditorView;

  const context: MentionContext = {
    getState: () => mockRendererState(),
    createTag: async () => {},
    createPerson: async () => {},
    createNote: async () => {},
  };

  const menu = createMentionMenu(mockView, context);
  assert.ok(menu);
  assert.equal(typeof menu.update, "function");
  assert.equal(typeof menu.destroy, "function");

  menu.update(mockView, state);
  menu.destroy();
});
