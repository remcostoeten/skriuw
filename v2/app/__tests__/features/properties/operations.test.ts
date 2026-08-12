import assert from "node:assert/strict";
import test from "node:test";
import {
  changeNotePropertyType,
  createNoteProperty,
  createPropertyOption,
  removeNoteProperty,
  removePropertyOption,
  reorderNoteProperties,
  reorderPropertyOptions,
  replacePropertyValue,
  upsertNoteProperty,
  upsertPropertyOption,
} from "../../../src/features/properties/operations";
import type { NoteProperty, PropertyIdFactory } from "../../../src/features/properties/types";

function idFactory(): PropertyIdFactory {
  let next = 0;
  return (kind) => `${kind}_${++next}`;
}

function statusProperty(): NoteProperty {
  return {
    noteId: "note_1",
    id: "status",
    name: "Status",
    position: 0,
    options: [
      { id: "open", label: "Open", color: "blue" },
      { id: "done", label: "Done", color: "green" },
    ],
    value: { valueVersion: 1, type: "multi-select", value: ["open", "done"] },
  };
}

test("property creation injects IDs and creates protocol-shaped empty values", () => {
  const property = createNoteProperty("note_1", "rating", idFactory());

  assert.equal(property.id, "property_1");
  assert.equal(property.name, "Rating");
  assert.deepEqual(property.value, { valueVersion: 1, type: "rating", value: null });
});

test("type changes reset values and options without mutating the source", () => {
  const source = statusProperty();
  const changed = changeNotePropertyType(source, "checkbox");

  assert.deepEqual(changed.value, { valueVersion: 1, type: "checkbox", value: false });
  assert.deepEqual(changed.options, []);
  assert.equal(source.options.length, 2);
});

test("upsert appends or replaces without changing the input collection", () => {
  const source = [statusProperty()];
  const appended = createNoteProperty("note_1", "text", idFactory(), "Summary", 1);
  const next = upsertNoteProperty(source, appended);
  const replaced = upsertNoteProperty(next, { ...next[0]!, name: "Stage" });

  assert.deepEqual(source.map(({ id }) => id), ["status"]);
  assert.deepEqual(next.map(({ id }) => id), ["status", "property_1"]);
  assert.equal(replaced[0]?.name, "Stage");
  assert.notEqual(replaced[1], next[1]);
});

test("upsert rejects foreign owners and hidden reorders", () => {
  const source = [statusProperty()];
  assert.throws(
    () =>
      upsertNoteProperty(source, {
        ...createNoteProperty("note_2", "text", idFactory()),
        position: 1,
      }),
    /foreign note owner/,
  );
  assert.throws(
    () => upsertNoteProperty(source, { ...source[0]!, position: 1 }),
    /cannot reorder/,
  );
});

test("remove and reorder produce contiguous positions and require complete IDs", () => {
  const createId = idFactory();
  const source = [
    statusProperty(),
    createNoteProperty("note_1", "text", createId, "Summary", 1),
    createNoteProperty("note_1", "date", createId, "Due", 2),
  ];
  const reordered = reorderNoteProperties(source, [source[2]!.id, "status", source[1]!.id]);
  const removed = removeNoteProperty(reordered, "status");

  assert.deepEqual(reordered.map(({ position }) => position), [0, 1, 2]);
  assert.deepEqual(removed.map(({ position }) => position), [0, 1]);
  assert.throws(() => reorderNoteProperties(source, ["status", "status", source[1]!.id]), /duplicate/);
  assert.throws(() => reorderNoteProperties(source, ["status"]), /complete ID set/);
});

test("option removal clears dangling selections and preserves source objects", () => {
  const source = statusProperty();
  const next = removePropertyOption(source, "open");

  assert.deepEqual(next.value, {
    valueVersion: 1,
    type: "multi-select",
    value: ["done"],
  });
  assert.deepEqual(next.options.map(({ id }) => id), ["done"]);
  assert.deepEqual(source.value.value, ["open", "done"]);
});

test("option create, update, and reorder remain immutable", () => {
  const source = statusProperty();
  const created = createPropertyOption(source, "Blocked", "red", idFactory());
  const updated = upsertPropertyOption(created, {
    id: "open",
    label: "Ready",
    color: "teal",
  });
  const reordered = reorderPropertyOptions(updated, ["option_1", "done", "open"]);

  assert.equal(source.options.length, 2);
  assert.equal(updated.options[0]?.label, "Ready");
  assert.deepEqual(reordered.options.map(({ id }) => id), ["option_1", "done", "open"]);
  assert.throws(() => reorderPropertyOptions(updated, ["open", "done", "missing"]), /foreign IDs/);
});

test("value replacement validates option and person references", () => {
  const source = statusProperty();
  assert.throws(
    () =>
      replacePropertyValue(source, {
        valueVersion: 1,
        type: "multi-select",
        value: ["missing"],
      }),
    /unknown option/,
  );
});
