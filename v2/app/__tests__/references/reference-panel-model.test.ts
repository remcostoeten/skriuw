import assert from "node:assert/strict";
import test from "node:test";
import {
  backlinksEqual,
  projectBacklinks,
  projectNoteReferenceDetails,
  projectReferencingNotes,
  referenceDetailsEqual,
} from "../../src/references/reference-panel-model";
import { createInitialState, createRendererStore } from "../../src/store/store";
import { referenceFixture } from "./fixtures";

function fixtureStore() {
  const { snapshot, references } = referenceFixture();
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

test("backlinks list hydrated referencing notes sorted by title", () => {
  const store = fixtureStore();
  assert.deepEqual(projectBacklinks(store.getState(), "note-a"), [
    { noteId: "note-b", title: "Beta note" },
    { noteId: "note-c", title: "Gamma note" },
  ]);
});

test("backlinks exclude trashed sources without dropping the stored reference", () => {
  const store = fixtureStore();
  store.applyOperations([{ type: "trash_subtree", rootId: "note-b", at: 9 }]);
  assert.deepEqual(projectBacklinks(store.getState(), "note-a"), [
    { noteId: "note-c", title: "Gamma note" },
  ]);
  store.applyOperations([
    {
      type: "restore_subtree",
      rootId: "note-b",
      placement: { parentId: null, position: { type: "last" } },
      at: 11,
    },
  ]);
  assert.equal(projectBacklinks(store.getState(), "note-a").length, 2);
});

test("tag and person detail views project their referencing notes", () => {
  const store = fixtureStore();
  assert.deepEqual(projectReferencingNotes(store.getState(), "tag", "tag-alpha"), [
    { noteId: "note-b", title: "Beta note" },
    { noteId: "note-c", title: "Gamma note" },
  ]);
  assert.deepEqual(projectReferencingNotes(store.getState(), "person", "person-ada"), [
    { noteId: "note-b", title: "Beta note" },
  ]);
});

test("note detail rows expose current names and reference counts", () => {
  const store = fixtureStore();
  assert.deepEqual(projectNoteReferenceDetails(store.getState(), "note-b"), [
    { kind: "tag", id: "tag-alpha", name: "alpha", color: null, noteCount: 2 },
    { kind: "person", id: "person-ada", name: "Ada", color: null, noteCount: 1 },
  ]);
  store.applyReferenceOperations([{ type: "delete_tag", id: "tag-alpha" }]);
  assert.deepEqual(
    projectNoteReferenceDetails(store.getState(), "note-b").map((entry) => entry.kind),
    ["person"],
  );
});

test("panel equalities suppress renders for unchanged projections", () => {
  const store = fixtureStore();
  const first = projectBacklinks(store.getState(), "note-a");
  const second = projectBacklinks(store.getState(), "note-a");
  assert.notEqual(first, second);
  assert.equal(backlinksEqual(first, second), true);
  const details = projectNoteReferenceDetails(store.getState(), "note-b");
  assert.equal(
    referenceDetailsEqual(details, projectNoteReferenceDetails(store.getState(), "note-b")),
    true,
  );
  assert.equal(referenceDetailsEqual(details, details.slice(1)), false);
});
