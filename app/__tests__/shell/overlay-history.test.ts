import assert from "node:assert/strict";
import test from "node:test";
import { createOverlayHistory, overlayIdOf, type HistoryView } from "../../src/shell/overlay-history";

type Entry = { state: unknown };

type FakeView = HistoryView & {
  entries: Entry[];
  index: number;
  /** Completes the queued traversal the way a browser would, one task later. */
  settle: () => void;
  pushHash: () => void;
};

function fakeView(): FakeView {
  const listeners = new Set<() => void>();
  let queued = 0;
  const view: FakeView = {
    entries: [{ state: null }],
    index: 0,
    history: {
      get state() {
        return view.entries[view.index]!.state;
      },
      pushState(state: unknown) {
        view.entries.splice(view.index + 1);
        view.entries.push({ state });
        view.index += 1;
      },
      back() {
        queued += 1;
      },
    } as History,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    settle() {
      while (queued > 0) {
        queued -= 1;
        if (view.index > 0) {
          view.index -= 1;
        }
        for (const listener of listeners) {
          listener();
        }
      }
    },
    pushHash() {
      view.history.pushState(null, "");
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return view;
}

test("overlayIdOf reads only entries this module pushed", () => {
  assert.equal(overlayIdOf(null), null);
  assert.equal(overlayIdOf({ other: 1 }), null);
  assert.equal(overlayIdOf({ skriuwOverlay: 42 }), null);
  assert.equal(overlayIdOf({ skriuwOverlay: "abc-1" }), "abc-1");
});

test("opening pushes an entry and the back gesture closes the overlay", () => {
  const view = fakeView();
  const overlays = createOverlayHistory(view);
  let closed = 0;
  overlays.open(() => (closed += 1));
  assert.equal(view.entries.length, 2);
  assert.notEqual(overlayIdOf(view.history.state), null);
  view.history.back();
  view.settle();
  assert.equal(closed, 1);
  assert.equal(view.index, 0);
});

test("closing by other means pops the entry so back does not replay it", () => {
  const view = fakeView();
  const overlays = createOverlayHistory(view);
  let closed = 0;
  const release = overlays.open(() => (closed += 1));
  release();
  view.settle();
  assert.equal(closed, 0);
  assert.equal(view.index, 0);
  assert.equal(overlayIdOf(view.history.state), null);
});

test("an overlay opened while a pop is in flight keeps its entry", () => {
  const view = fakeView();
  const overlays = createOverlayHistory(view);
  const release = overlays.open(() => undefined);
  release();
  let closed = 0;
  overlays.open(() => (closed += 1));
  view.settle();
  assert.equal(closed, 0);
  assert.equal(view.index, 1);
  assert.notEqual(overlayIdOf(view.history.state), null);
  view.history.back();
  view.settle();
  assert.equal(closed, 1);
});

test("a stacked overlay closes on its own without taking the one below", () => {
  const view = fakeView();
  const overlays = createOverlayHistory(view);
  let lowerClosed = 0;
  let upperClosed = 0;
  overlays.open(() => (lowerClosed += 1));
  overlays.open(() => (upperClosed += 1));
  view.history.back();
  view.settle();
  assert.deepEqual({ lowerClosed, upperClosed }, { lowerClosed: 0, upperClosed: 1 });
  view.history.back();
  view.settle();
  assert.deepEqual({ lowerClosed, upperClosed }, { lowerClosed: 1, upperClosed: 1 });
});

test("a navigation while an overlay is open closes it, and its buried entry is skipped later", () => {
  const view = fakeView();
  const overlays = createOverlayHistory(view);
  let closed = 0;
  const release = overlays.open(() => (closed += 1));
  view.pushHash();
  assert.equal(closed, 1);
  release();
  assert.equal(view.entries.length, 3);
  view.history.back();
  view.settle();
  assert.equal(view.index, 0);
  assert.equal(overlayIdOf(view.history.state), null);
});
