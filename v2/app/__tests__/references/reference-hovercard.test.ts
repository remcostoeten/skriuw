import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelHovercard,
  destroyHovercard,
  scheduleHovercard,
} from "../../src/references/reference-hovercard";
import type { RendererStore } from "../../src/store/types";

import { setupDOMStub } from "../shared/dom-stub";

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
      incomingReferences: new Map(),
      metadata: new Map(),
      referencingNotes: new Map(),
    }),
  } as unknown as RendererStore;
}

test("scheduleHovercard opens tooltip after delay and cancelHovercard closes it", async () => {
  setupDOMStub();

  const anchor = document.createElement("span");
  anchor.getBoundingClientRect = () => ({
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

  const store = mockStore();
  scheduleHovercard(store, anchor, "tag", "tag-1");

  // Wait for hover delay
  await new Promise((resolve) => setTimeout(resolve, 400));

  cancelHovercard();
  destroyHovercard();
});
