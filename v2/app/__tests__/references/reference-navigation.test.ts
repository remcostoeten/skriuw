import assert from "node:assert/strict";
import test from "node:test";
import {
  activateReference,
  canNavigateBack,
  navigateBack,
} from "../../src/references/reference-navigation";
import type { RendererStore } from "../../src/store/types";

type WindowStub = { location: { hash: string }; innerWidth: number; innerHeight: number };

function stubWindow(hash: string): WindowStub {
  const stub: WindowStub = { location: { hash }, innerWidth: 1000, innerHeight: 800 };
  (globalThis as { window?: unknown }).window = stub;
  return stub;
}

function stubStore(activeNoteId: string | null): {
  store: RendererStore;
  activeNoteId: () => string | null;
} {
  let active = activeNoteId;
  const store = {
    getState: () => ({ activeNoteId: active }),
    setActiveNote: (id: string | null) => {
      active = id;
    },
  } as unknown as RendererStore;
  return { store, activeNoteId: () => active };
}

test("following a tag reference deep-links and remembers the origin note", () => {
  const win = stubWindow("#/notes");
  const { store, activeNoteId } = stubStore("note-a");

  activateReference(store, "tag", "tag-1");

  assert.equal(win.location.hash, "#/tags/tag-1");
  assert.equal(canNavigateBack(), true);

  navigateBack(store);
  assert.equal(win.location.hash, "#/notes");
  assert.equal(activeNoteId(), "note-a");
});

test("following a note reference opens the note and back restores state", () => {
  const win = stubWindow("#/notes");
  const { store, activeNoteId } = stubStore("note-a");

  activateReference(store, "note", "note-z");
  assert.equal(activeNoteId(), "note-z");
  assert.equal(win.location.hash, "#/notes");

  assert.equal(navigateBack(store), true);
  assert.equal(activeNoteId(), "note-a");
});

test("navigateBack reports false once the stack is drained", () => {
  stubWindow("#/notes");
  const { store } = stubStore(null);
  while (canNavigateBack()) {
    navigateBack(store);
  }
  assert.equal(navigateBack(store), false);
});
