import assert from "node:assert/strict";
import test from "node:test";
import {
  activateReference,
  canNavigateBack,
  installBackNavigation,
  navigateBack,
} from "../../../src/features/references/reference-navigation";
import type { RendererStore } from "../../../src/store/types";

type EventListenerMap = Record<string, (e: KeyboardEvent) => void>;

if (typeof (globalThis as any).HTMLElement === "undefined") {
  (globalThis as any).HTMLElement = class HTMLElement {};
}

type WindowStub = {
  location: { hash: string };
  innerWidth: number;
  innerHeight: number;
  listeners: EventListenerMap;
  addEventListener: (event: string, fn: (e: KeyboardEvent) => void) => void;
  removeEventListener: (event: string, fn: (e: KeyboardEvent) => void) => void;
};

function stubWindow(hash: string): WindowStub {
  const listeners: EventListenerMap = {};
  const stub: WindowStub = {
    location: { hash },
    innerWidth: 1000,
    innerHeight: 800,
    listeners,
    addEventListener: (event, fn) => {
      listeners[event] = fn;
    },
    removeEventListener: (event, fn) => {
      if (listeners[event] === fn) {
        delete listeners[event];
      }
    },
  };
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

test("following a person reference deep-links to people route", () => {
  const win = stubWindow("#/notes");
  const { store } = stubStore("note-a");

  activateReference(store, "person", "person-1");
  assert.equal(win.location.hash, "#/people/person-1");

  navigateBack(store);
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

test("installBackNavigation registers keydown listener for backspace", () => {
  const win = stubWindow("#/notes");
  const { store, activeNoteId } = stubStore("note-orig");

  const uninstall = installBackNavigation(store);
  assert.ok(win.listeners.keydown);

  activateReference(store, "note", "note-new");
  assert.equal(activeNoteId(), "note-new");

  let wasDefaultPrevented = false;
  const target = Object.create((globalThis as any).HTMLElement.prototype);
  target.tagName = "DIV";
  target.isContentEditable = false;

  win.listeners.keydown({
    key: "Backspace",
    preventDefault: () => {
      wasDefaultPrevented = true;
    },
    target,
  } as unknown as KeyboardEvent);

  assert.equal(wasDefaultPrevented, true);
  assert.equal(activeNoteId(), "note-orig");

  uninstall();
  assert.equal(win.listeners.keydown, undefined);
});
