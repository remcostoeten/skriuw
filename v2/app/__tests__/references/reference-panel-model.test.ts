import assert from "node:assert/strict";
import test from "node:test";
import {
  backlinksEqual,
  buildDeleteReferenceOperation,
  buildRecolorReferenceOperation,
  buildRenameReferenceOperation,
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

function detailRows(store: ReturnType<typeof fixtureStore>) {
  const [tagRow, personRow] = projectNoteReferenceDetails(store.getState(), "note-b");
  assert.ok(tagRow && personRow);
  return { tagRow, personRow };
}

test("rename builder returns kind-specific operations and ignores no-op edits", () => {
  const { tagRow, personRow } = detailRows(fixtureStore());
  assert.deepEqual(buildRenameReferenceOperation(tagRow, "beta"), {
    type: "rename_tag",
    id: "tag-alpha",
    name: "beta",
  });
  assert.deepEqual(buildRenameReferenceOperation(personRow, "Grace"), {
    type: "rename_person",
    id: "person-ada",
    name: "Grace",
  });
  assert.equal(buildRenameReferenceOperation(tagRow, "  alpha  "), null);
  assert.equal(buildRenameReferenceOperation(tagRow, "   "), null);
});

test("recolor builder emits color operations and skips unchanged colors", () => {
  const { tagRow, personRow } = detailRows(fixtureStore());
  assert.deepEqual(buildRecolorReferenceOperation(tagRow, "#ef4444"), {
    type: "recolor_tag",
    id: "tag-alpha",
    color: "#ef4444",
  });
  assert.deepEqual(buildRecolorReferenceOperation(personRow, "#3b82f6"), {
    type: "recolor_person",
    id: "person-ada",
    color: "#3b82f6",
  });
  assert.equal(buildRecolorReferenceOperation(tagRow, null), null);
});

test("delete builder returns kind-specific removal operations", () => {
  const { tagRow, personRow } = detailRows(fixtureStore());
  assert.deepEqual(buildDeleteReferenceOperation(tagRow), { type: "delete_tag", id: "tag-alpha" });
  assert.deepEqual(buildDeleteReferenceOperation(personRow), {
    type: "delete_person",
    id: "person-ada",
  });
});

test("recolor operations flow through the store into projected detail rows", () => {
  const store = fixtureStore();
  store.applyReferenceOperations([{ type: "recolor_tag", id: "tag-alpha", color: "#22c55e" }]);
  store.applyReferenceOperations([
    { type: "recolor_person", id: "person-ada", color: "#8b5cf6" },
  ]);
  assert.deepEqual(
    projectNoteReferenceDetails(store.getState(), "note-b").map((entry) => ({
      id: entry.id,
      color: entry.color,
    })),
    [
      { id: "tag-alpha", color: "#22c55e" },
      { id: "person-ada", color: "#8b5cf6" },
    ],
  );
  assert.equal(store.getState().tags.get("tag-alpha")?.color, "#22c55e");
  store.applyReferenceOperations([{ type: "recolor_tag", id: "tag-alpha", color: null }]);
  assert.equal(store.getState().tags.get("tag-alpha")?.color, null);
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
