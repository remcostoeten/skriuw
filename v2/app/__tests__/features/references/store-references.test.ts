import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import { referenceKey } from "../../../src/features/references/types";
import { referenceDocumentJson, referenceFixture } from "./fixtures";

function createFixtureStore() {
  const { snapshot, references } = referenceFixture();
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

test("bootstrap normalizes tags, people, and reverse-reference projections", () => {
  const store = createFixtureStore();
  const state = store.getState();
  assert.equal(state.tags.get("tag-alpha")?.name, "alpha");
  assert.equal(state.people.get("person-ada")?.name, "Ada");
  assert.deepEqual(state.incomingReferences.get(referenceKey("note", "note-a")), [
    "note-b",
    "note-c",
  ]);
  assert.deepEqual(state.incomingReferences.get(referenceKey("tag", "tag-alpha")), [
    "note-b",
    "note-c",
  ]);
  assert.deepEqual(state.incomingReferences.get(referenceKey("person", "person-ada")), [
    "note-b",
  ]);
});

test("saving a document updates outgoing and incoming projections atomically", () => {
  const store = createFixtureStore();
  store.applyOperations([
    {
      type: "save_document",
      noteId: "note-c",
      documentJson: referenceDocumentJson([{ kind: "person", targetId: "person-bob" }]),
      markdown: "",
      wordCount: 1,
      expectedRevision: 1,
      at: 10,
    },
  ]);
  const state = store.getState();
  assert.deepEqual(state.outgoingReferences.get("note-c"), [
    { kind: "person", targetId: "person-bob" },
  ]);
  assert.deepEqual(state.incomingReferences.get(referenceKey("note", "note-a")), ["note-b"]);
  assert.deepEqual(state.incomingReferences.get(referenceKey("tag", "tag-alpha")), ["note-b"]);
  assert.deepEqual(state.incomingReferences.get(referenceKey("person", "person-bob")), [
    "note-c",
  ]);
});

test("saving without reference changes keeps projection identities stable", () => {
  const store = createFixtureStore();
  const before = store.getState();
  store.applyOperations([
    {
      type: "save_document",
      noteId: "note-b",
      documentJson: referenceDocumentJson(
        before.outgoingReferences.get("note-b") ?? [],
        "edited body",
      ),
      markdown: "",
      wordCount: 2,
      expectedRevision: 1,
      at: 10,
    },
  ]);
  const after = store.getState();
  assert.equal(after.outgoingReferences, before.outgoingReferences);
  assert.equal(after.incomingReferences, before.incomingReferences);
});

test("rename resolves by stable identifier without rewriting documents", () => {
  const store = createFixtureStore();
  const documentBefore = store.getState().documents.get("note-b");
  const outgoingBefore = store.getState().outgoingReferences;
  store.applyReferenceOperations([{ type: "rename_tag", id: "tag-alpha", name: "released" }]);
  store.applyReferenceOperations([{ type: "rename_person", id: "person-ada", name: "Ada L" }]);
  const state = store.getState();
  assert.equal(state.tags.get("tag-alpha")?.name, "released");
  assert.equal(state.people.get("person-ada")?.name, "Ada L");
  assert.equal(state.documents.get("note-b"), documentBefore);
  assert.equal(state.outgoingReferences, outgoingBefore);
});

test("deleting a tag or person removes completion and index projections", () => {
  const store = createFixtureStore();
  store.applyReferenceOperations([
    { type: "delete_tag", id: "tag-alpha" },
    { type: "delete_person", id: "person-ada" },
  ]);
  const state = store.getState();
  assert.equal(state.tags.has("tag-alpha"), false);
  assert.equal(state.people.has("person-ada"), false);
  assert.equal(state.incomingReferences.has(referenceKey("tag", "tag-alpha")), false);
  assert.equal(state.incomingReferences.has(referenceKey("person", "person-ada")), false);
  assert.deepEqual(state.outgoingReferences.get("note-b"), [
    { kind: "note", targetId: "note-a" },
    { kind: "tag", targetId: "tag-alpha" },
    { kind: "person", targetId: "person-ada" },
  ]);
});

test("creating tags and people is idempotent per identifier", () => {
  const store = createFixtureStore();
  store.applyReferenceOperations([
    {
      type: "create_tag",
      tag: { id: "tag-new", name: "fresh", color: null, createdAt: 0, updatedAt: 0, createdIn: null },
    },
    {
      type: "create_tag",
      tag: {
        id: "tag-new",
        name: "duplicate",
        color: null,
        createdAt: 0,
        updatedAt: 0,
        createdIn: null,
      },
    },
    {
      type: "create_person",
      person: {
        id: "person-new",
        name: "Noor",
        initials: null,
        color: null,
        note: null,
        createdAt: 0,
        updatedAt: 0,
        createdIn: null,
      },
    },
  ]);
  const state = store.getState();
  assert.equal(state.tags.get("tag-new")?.name, "fresh");
  assert.equal(state.people.get("person-new")?.name, "Noor");
});

test("purging a source note removes it from reverse projections", () => {
  const store = createFixtureStore();
  store.applyOperations([
    { type: "trash_subtree", rootId: "note-c", at: 20 },
    { type: "purge_subtree", rootId: "note-c", trashedBefore: 30 },
  ]);
  const state = store.getState();
  assert.equal(state.outgoingReferences.has("note-c"), false);
  assert.deepEqual(state.incomingReferences.get(referenceKey("note", "note-a")), ["note-b"]);
  assert.deepEqual(state.incomingReferences.get(referenceKey("tag", "tag-alpha")), ["note-b"]);
});

test("purging a target note keeps mentions addressed to it for unavailable rendering", () => {
  const store = createFixtureStore();
  store.applyOperations([
    { type: "trash_subtree", rootId: "note-a", at: 20 },
    { type: "purge_subtree", rootId: "note-a", trashedBefore: 30 },
  ]);
  const state = store.getState();
  assert.deepEqual(state.incomingReferences.get(referenceKey("note", "note-a")), [
    "note-b",
    "note-c",
  ]);
  assert.deepEqual(state.outgoingReferences.get("note-b"), [
    { kind: "note", targetId: "note-a" },
    { kind: "tag", targetId: "tag-alpha" },
    { kind: "person", targetId: "person-ada" },
  ]);
});

test("references survive snapshot replacement after a rejected operation", () => {
  const { snapshot, references } = referenceFixture();
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  store.replaceFromSnapshot(snapshot);
  const state = store.getState();
  assert.equal(state.tags.size, 2);
  assert.deepEqual(state.incomingReferences.get(referenceKey("note", "note-a")), [
    "note-b",
    "note-c",
  ]);
});
