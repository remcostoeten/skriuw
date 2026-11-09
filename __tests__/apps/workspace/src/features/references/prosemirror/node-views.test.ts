import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { productSchema } from "@/features/editor/schema";
import { createReferenceNodeViews } from "@/features/references/prosemirror/node-views";
import { referenceFixture, tag } from "../fixtures";

class FakeToken {
  className = "";
  dataset: Record<string, string> = {};
  writes = 0;
  private text = "";
  private attributes = new Map<string, string>();
  readonly style = {
    values: new Map<string, string>(),
    setProperty: (name: string, value: string) => {
      this.writes += 1;
      this.style.values.set(name, value);
    },
    removeProperty: (name: string) => {
      this.writes += 1;
      this.style.values.delete(name);
    },
  };

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.writes += 1;
    this.text = value;
  }

  setAttribute(name: string, value: string): void {
    this.writes += 1;
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(): void {}

  removeEventListener(): void {}
}

const previousDocument = globalThis.document;

afterEach(() => {
  globalThis.document = previousDocument;
});

function mountTagToken() {
  const created: FakeToken[] = [];
  globalThis.document = Object.assign(Object.create(null), {
    createElement: () => {
      const token = new FakeToken();
      created.push(token);
      return token;
    },
  });
  const { snapshot, references } = referenceFixture();
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  const views = createReferenceNodeViews(store);
  const node = productSchema.node("tag_ref", { id: "tag-alpha", label: "alpha" });
  views.nodeViews.tag_ref?.(node);
  const token = created[0];
  assert.ok(token);
  return { store, views, token };
}

test("a save that renames nothing leaves reference tokens untouched", () => {
  const { store, views, token } = mountTagToken();
  const text = token.textContent;
  const writes = token.writes;
  store.update((state) => ({ ...state, sourceNodes: new Map(state.sourceNodes) }));
  assert.equal(token.writes, writes);
  assert.equal(token.textContent, text);
  views.destroy();
});

test("renaming a tag repaints its token", () => {
  const { store, views, token } = mountTagToken();
  store.update((state) => ({
    ...state,
    tags: new Map(state.tags).set("tag-alpha", tag("tag-alpha", "renamed")),
  }));
  assert.equal(token.textContent, "#renamed");
  assert.equal(token.getAttribute("aria-label")?.includes("renamed"), true);
  views.destroy();
});
