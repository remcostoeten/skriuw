import assert from "node:assert/strict";
import test from "node:test";
import {
  referenceAriaLabel,
  referenceText,
  resolveReference,
} from "../../../src/features/references/reference-resolver";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import { referenceFixture } from "./fixtures";

function fixtureStore() {
  const { snapshot, references } = referenceFixture();
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

test("resolution reads the current name for every kind by stable identifier", () => {
  const store = fixtureStore();
  const state = store.getState();
  assert.deepEqual(resolveReference(state, "tag", "tag-alpha", "stale"), {
    label: "alpha",
    availability: "resolved",
  });
  assert.deepEqual(resolveReference(state, "person", "person-ada", "stale"), {
    label: "Ada",
    availability: "resolved",
  });
  assert.deepEqual(resolveReference(state, "note", "note-a", "stale"), {
    label: "Alpha note",
    availability: "resolved",
  });
});

test("rename updates resolution immediately without touching stored labels", () => {
  const store = fixtureStore();
  store.applyReferenceOperations([{ type: "rename_tag", id: "tag-alpha", name: "omega" }]);
  const resolved = resolveReference(store.getState(), "tag", "tag-alpha", "alpha");
  assert.deepEqual(resolved, { label: "omega", availability: "resolved" });
  assert.equal(referenceText("tag", resolved), "#omega");
});

test("trashed note targets resolve to an unavailable state with their old title", () => {
  const store = fixtureStore();
  store.applyOperations([{ type: "trash_subtree", rootId: "note-a", at: 9 }]);
  const resolved = resolveReference(store.getState(), "note", "note-a", "stale");
  assert.deepEqual(resolved, { label: "Alpha note", availability: "unavailable" });
  assert.equal(referenceAriaLabel("note", resolved), "Note Alpha note, unavailable");
});

test("deleted targets keep the last committed label as unresolved text", () => {
  const store = fixtureStore();
  store.applyReferenceOperations([{ type: "delete_person", id: "person-ada" }]);
  store.applyOperations([
    { type: "trash_subtree", rootId: "note-a", at: 9 },
    { type: "purge_subtree", rootId: "note-a", trashedBefore: 10 },
  ]);
  const person = resolveReference(store.getState(), "person", "person-ada", "Ada");
  assert.deepEqual(person, { label: "Ada", availability: "unresolved" });
  assert.equal(referenceAriaLabel("person", person), "Person Ada, no longer exists");
  const note = resolveReference(store.getState(), "note", "note-a", "Alpha note");
  assert.deepEqual(note, { label: "Alpha note", availability: "unresolved" });
});
