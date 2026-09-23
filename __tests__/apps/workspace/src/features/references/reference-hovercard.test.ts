import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  cancelHovercard,
  destroyHovercard,
  scheduleHovercard,
} from "@/features/references/reference-hovercard";
import { referenceKey } from "@skriuw/renderer-core/references/types";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

import { setupDOMStub } from "../../shared/dom-stub";

type StubElement = HTMLElement & { children: StubElement[] };

function mockStore(): RendererStore {
  return {
    getState: () => ({
      tags: new Map([
        ["tag-1", { id: "tag-1", name: "urgent", color: "#ff0000", createdAt: 1000 }],
      ]),
      people: new Map([
        ["p-1", { id: "p-1", name: "Alice", color: null, note: "Engineer", createdAt: 1000 }],
      ]),
      nodes: new Map([["n-1", { id: "n-1", title: "My Note" }]]),
      documents: new Map([["n-1", { wordCount: 42 }]]),
      incomingReferences: new Map([[referenceKey("tag", "tag-1"), ["n-1"]]]),
      metadata: new Map([["n-1", { title: "My Note" }]]),
      referencingNotes: new Map(),
    }),
  } as unknown as RendererStore;
}

function anchor(): HTMLElement {
  const element = document.createElement("span");
  element.getBoundingClientRect = () => ({
    left: 20,
    top: 20,
    right: 50,
    bottom: 40,
    width: 30,
    height: 20,
    x: 20,
    y: 20,
    toJSON: () => {},
  });
  return element;
}

function tooltip(): StubElement | undefined {
  return (document.body as StubElement).children.find(
    (child) => child.getAttribute?.("role") === "tooltip",
  );
}

function texts(element: StubElement): string[] {
  return element.children.map((child) =>
    (child.children?.length ?? 0) > 0 ? texts(child).join("") : (child.textContent ?? ""),
  );
}

beforeEach(() => {
  setupDOMStub();
  vi.useFakeTimers();
});

afterEach(() => {
  destroyHovercard();
  vi.useRealTimers();
});

test("a hovered tag opens a tooltip with its name and note count after the delay", () => {
  scheduleHovercard(mockStore(), anchor(), "tag", "tag-1");
  vi.advanceTimersByTime(379);
  assert.equal(tooltip(), undefined);

  vi.advanceTimersByTime(1);
  const panel = tooltip();
  assert.ok(panel);
  assert.equal(panel.dataset.open, "true");
  const [title, meta] = texts(panel);
  assert.equal(title, "#urgent");
  assert.equal(meta, "1 note");
  assert.equal(panel.style.left, "20px");
  assert.equal(panel.style.top, "46px");

  cancelHovercard();
  assert.equal(panel.dataset.open, undefined);
});

test("cancelling before the delay never opens the tooltip", () => {
  scheduleHovercard(mockStore(), anchor(), "person", "p-1");
  cancelHovercard();
  vi.advanceTimersByTime(1000);
  assert.equal(tooltip(), undefined);
});

test("a note reference reports its word count and an unknown target renders nothing", () => {
  scheduleHovercard(mockStore(), anchor(), "tag", "missing");
  vi.advanceTimersByTime(380);
  assert.equal(tooltip(), undefined);

  scheduleHovercard(mockStore(), anchor(), "note", "n-1");
  vi.advanceTimersByTime(380);
  const panel = tooltip();
  assert.ok(panel);
  assert.deepEqual(texts(panel), ["@My Note", "42 words"]);

  destroyHovercard();
  assert.equal(tooltip(), undefined);
});
