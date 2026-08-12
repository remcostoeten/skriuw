import assert from "node:assert/strict";
import test from "node:test";
import {
  addPropertyOperations,
  applyTemplateOperations,
  parseOptionalNumber,
  reorderPropertyOperations,
  replaceStringValue,
} from "../../../src/features/properties/property-editor-model";
import { BUILT_IN_PROPERTY_TEMPLATES } from "../../../src/features/properties/templates";
import type { NoteProperty, PropertyIdFactory } from "../../../src/features/properties/types";

function idFactory(): PropertyIdFactory {
  let id = 0;
  return (kind) => `${kind}_${++id}`;
}

function properties(): NoteProperty[] {
  return ["First", "Second", "Third"].map((name, position) => ({
    noteId: "note_1",
    id: `property_${position}`,
    name,
    position,
    options: [],
    value: { valueVersion: 1, type: "text", value: "" },
  }));
}

test("add plans one append operation with a usable default name", () => {
  const operations = addPropertyOperations(
    "note_1",
    properties(),
    "multi-select",
    " ",
    12,
    idFactory(),
  );

  assert.equal(operations.length, 1);
  const operation = operations[0]!;
  assert.equal(operation.type, "set_note_property");
  if (operation.type !== "set_note_property") return;
  assert.equal(operation.property.name, "Multi-select");
  assert.equal(operation.property.position, 3);
});

test("keyboard reorder plans a complete ordered ID set and stops at edges", () => {
  const source = properties();
  assert.deepEqual(reorderPropertyOperations(source, "property_1", -1, 8), [
    {
      type: "reorder_note_properties",
      noteId: "note_1",
      orderedPropertyIds: ["property_1", "property_0", "property_2"],
      at: 8,
    },
  ]);
  assert.deepEqual(reorderPropertyOperations(source, "property_0", -1, 8), []);
  assert.deepEqual(reorderPropertyOperations(source, "missing", 1, 8), []);
});

test("template application removes old fields before appending fresh fields", () => {
  const template = BUILT_IN_PROPERTY_TEMPLATES.find(({ id }) => id === "contact")!;
  const operations = applyTemplateOperations(
    "note_1",
    properties().slice(0, 2),
    template,
    21,
    idFactory(),
  );

  assert.deepEqual(
    operations.slice(0, 2).map(({ type }) => type),
    ["remove_note_property", "remove_note_property"],
  );
  assert.equal(operations.slice(2).length, 4);
  assert.ok(operations.slice(2).every(({ type }) => type === "set_note_property"));
});

test("number and string editor parsing keeps invalid input explicit", () => {
  assert.equal(parseOptionalNumber(""), null);
  assert.equal(parseOptionalNumber("12.5"), 12.5);
  assert.equal(parseOptionalNumber("not a number"), undefined);
  assert.deepEqual(
    replaceStringValue({ valueVersion: 1, type: "email", value: "" }, "hello@example.com"),
    { valueVersion: 1, type: "email", value: "hello@example.com" },
  );
  const checkbox = { valueVersion: 1, type: "checkbox", value: false } as const;
  assert.equal(replaceStringValue(checkbox, "true"), checkbox);
});
