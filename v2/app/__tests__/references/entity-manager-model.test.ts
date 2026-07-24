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

test("buildCreateTag trims, rejects empty names, and stamps provenance", () => {
  const operation = buildCreateTag("t1", "  focus ", "#3b82f6");
  assert.equal(operation?.type, "create_tag");
  assert.equal(operation?.type === "create_tag" && operation.tag.name, "focus");
  assert.equal(operation?.type === "create_tag" && operation.tag.color, "#3b82f6");
  assert.equal(operation?.type === "create_tag" && operation.tag.createdIn, "tags");
  assert.ok(operation?.type === "create_tag" && operation.tag.createdAt > 0);
  assert.equal(
    operation?.type === "create_tag" && operation.tag.createdAt === operation.tag.updatedAt,
    true,
  );
  assert.equal(buildCreateTag("t1", "   ", null), null);
});

test("buildCreatePerson derives initials, nulls empty note, and stamps provenance", () => {
  const derived = buildCreatePerson("p1", "Ada Lovelace", "", null, "  ");
  assert.equal(derived?.type, "create_person");
  if (derived?.type === "create_person") {
    assert.equal(derived.person.initials, "AL");
    assert.equal(derived.person.note, null);
    assert.equal(derived.person.createdIn, "people");
    assert.ok(derived.person.createdAt > 0);
  }
  const explicit = buildCreatePerson("p1", "Ada", " AL ", "#ef4444", "friend");
  if (explicit?.type === "create_person") {
    assert.equal(explicit.person.initials, "AL");
    assert.equal(explicit.person.color, "#ef4444");
    assert.equal(explicit.person.note, "friend");
    assert.equal(explicit.person.createdIn, "people");
  }
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
