import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createRendererStore } from "../../src/store/store";
import {
  buildCreatePerson,
  buildCreateTag,
  buildDelete,
  buildRecolor,
  buildRename,
  deriveInitials,
  entityRowsEqual,
  projectEntities,
} from "../../src/references/entity-manager-model";
import { referenceFixture } from "./fixtures";

function createFixtureStore() {
  const { snapshot, references } = referenceFixture();
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

test("projectEntities returns tags sorted by name with referencing counts", () => {
  const store = createFixtureStore();
  const rows = projectEntities(store.getState(), "tag");
  assert.deepEqual(
    rows.map((row) => [row.name, row.noteCount]),
    [
      ["alpha", 2],
      ["beta", 0],
    ],
  );
});

test("projectEntities returns people with initials and note fields", () => {
  const store = createFixtureStore();
  const rows = projectEntities(store.getState(), "person");
  assert.deepEqual(
    rows.map((row) => [row.name, row.noteCount]),
    [
      ["Ada", 1],
      ["Bob", 0],
    ],
  );
  assert.equal(rows[0]?.kind, "person");
});

test("entityRowsEqual detects count changes", () => {
  const store = createFixtureStore();
  const before = projectEntities(store.getState(), "tag");
  assert.equal(entityRowsEqual(before, projectEntities(store.getState(), "tag")), true);
  store.applyReferenceOperations([{ type: "delete_tag", id: "tag-alpha" }]);
  const after = projectEntities(store.getState(), "tag");
  assert.equal(entityRowsEqual(before, after), false);
});

test("deriveInitials handles single and multi-word names", () => {
  assert.equal(deriveInitials("Ada"), "AD");
  assert.equal(deriveInitials("Ada Lovelace"), "AL");
  assert.equal(deriveInitials("  grace brewster hopper "), "GH");
  assert.equal(deriveInitials("   "), "");
});

test("buildCreateTag trims and rejects empty names", () => {
  assert.deepEqual(buildCreateTag("t1", "  focus ", "#3b82f6"), {
    type: "create_tag",
    tag: { id: "t1", name: "focus", color: "#3b82f6" },
  });
  assert.equal(buildCreateTag("t1", "   ", null), null);
});

test("buildCreatePerson derives initials when omitted and nulls empty note", () => {
  assert.deepEqual(buildCreatePerson("p1", "Ada Lovelace", "", null, "  "), {
    type: "create_person",
    person: { id: "p1", name: "Ada Lovelace", initials: "AL", color: null, note: null },
  });
  assert.deepEqual(buildCreatePerson("p1", "Ada", " AL ", "#ef4444", "friend"), {
    type: "create_person",
    person: { id: "p1", name: "Ada", initials: "AL", color: "#ef4444", note: "friend" },
  });
});

test("buildRename, buildRecolor, and buildDelete select the matching operation", () => {
  assert.deepEqual(buildRename("tag", "t1", " next "), {
    type: "rename_tag",
    id: "t1",
    name: "next",
  });
  assert.equal(buildRename("person", "p1", "  "), null);
  assert.deepEqual(buildRecolor("person", "p1", null), {
    type: "recolor_person",
    id: "p1",
    color: null,
  });
  assert.deepEqual(buildDelete("tag", "t1"), { type: "delete_tag", id: "t1" });
});

test("recolor operation updates the projected row color", () => {
  const store = createFixtureStore();
  store.applyReferenceOperations([buildRecolor("tag", "tag-beta", "#22c55e")]);
  const row = projectEntities(store.getState(), "tag").find((entry) => entry.id === "tag-beta");
  assert.equal(row?.color, "#22c55e");
});
