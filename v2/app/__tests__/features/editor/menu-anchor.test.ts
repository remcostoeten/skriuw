import assert from "node:assert/strict";
import test from "node:test";
import type { EditorView } from "prosemirror-view";
import { rangeMenuAnchor } from "../../../src/features/editor/menu-anchor";

const WIDTH = 300;

type Rect = { left: number; top: number; bottom: number };

function viewWith(start: Rect, end: Rect): EditorView {
  return {
    coordsAtPos: (pos: number) => (pos === 1 ? start : end),
  } as unknown as EditorView;
}

function withWindowWidth(width: number, run: () => void): void {
  const original = globalThis.window;
  globalThis.window = { innerWidth: width } as Window & typeof globalThis;
  try {
    run();
  } finally {
    globalThis.window = original;
  }
}

test("a single-line range anchors centered above the selection", () => {
  const view = viewWith({ left: 200, top: 400, bottom: 420 }, { left: 300, top: 400, bottom: 420 });
  withWindowWidth(1200, () => {
    const anchor = rangeMenuAnchor(view, 1, 2, WIDTH);
    assert.equal(anchor.x, 250);
    assert.equal(anchor.y, 400);
    assert.equal(anchor.below, false);
  });
});

test("a range too close to the top of the window flips below its end", () => {
  const view = viewWith({ left: 200, top: 30, bottom: 50 }, { left: 300, top: 30, bottom: 50 });
  withWindowWidth(1200, () => {
    const anchor = rangeMenuAnchor(view, 1, 2, WIDTH);
    assert.equal(anchor.below, true);
    assert.equal(anchor.y, 50);
  });
});

test("a multi-line range anchors from the start of the selection", () => {
  const view = viewWith({ left: 200, top: 400, bottom: 420 }, { left: 60, top: 440, bottom: 460 });
  withWindowWidth(1200, () => {
    const anchor = rangeMenuAnchor(view, 1, 2, WIDTH);
    assert.equal(anchor.x, 350);
    assert.equal(anchor.y, 400);
  });
});

test("anchors stay a gap away from both window edges", () => {
  withWindowWidth(1200, () => {
    const nearLeft = viewWith({ left: 4, top: 400, bottom: 420 }, { left: 8, top: 400, bottom: 420 });
    assert.equal(rangeMenuAnchor(nearLeft, 1, 2, WIDTH).x, 162);
    const nearRight = viewWith(
      { left: 1180, top: 400, bottom: 420 },
      { left: 1196, top: 400, bottom: 420 },
    );
    assert.equal(rangeMenuAnchor(nearRight, 1, 2, WIDTH).x, 1038);
  });
});
