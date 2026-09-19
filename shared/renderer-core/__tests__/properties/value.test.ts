import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyNotePropertyValue,
  normalizeNotePropertyField,
  normalizeNotePropertyFields,
  normalizeNotePropertyValue,
} from "../../src/properties/value";

const options = [
  { id: "open", label: "Open", color: "blue" as const },
  { id: "done", label: "Done", color: "green" as const },
];

test("empty values match all twelve property types", () => {
  assert.deepEqual(emptyNotePropertyValue("text"), {
    valueVersion: 1,
    type: "text",
    value: "",
  });
  assert.deepEqual(emptyNotePropertyValue("number"), {
    valueVersion: 1,
    type: "number",
    value: null,
  });
  assert.deepEqual(emptyNotePropertyValue("select"), {
    valueVersion: 1,
    type: "select",
    value: null,
  });
  assert.deepEqual(emptyNotePropertyValue("multi-select"), {
    valueVersion: 1,
    type: "multi-select",
    value: [],
  });
  assert.deepEqual(emptyNotePropertyValue("person"), {
    valueVersion: 1,
    type: "person",
    value: [],
  });
  assert.deepEqual(emptyNotePropertyValue("checkbox"), {
    valueVersion: 1,
    type: "checkbox",
    value: false,
  });
  assert.deepEqual(emptyNotePropertyValue("rating"), {
    valueVersion: 1,
    type: "rating",
    value: null,
  });
  for (const type of ["date", "url", "location", "email", "phone"] as const) {
    assert.deepEqual(emptyNotePropertyValue(type), { valueVersion: 1, type, value: "" });
  }
});

test("normalization clones valid ordered values without coercing payloads", () => {
  const input = { valueVersion: 1, type: "multi-select", value: ["done", "open"] };
  const normalized = normalizeNotePropertyValue(input, options);

  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.value, input.value);
});

test("normalization rejects unsupported versions and mismatched payloads", () => {
  assert.throws(
    () => normalizeNotePropertyValue({ valueVersion: 2, type: "checkbox", value: true }),
    /property value version must be 1/,
  );
  assert.throws(
    () => normalizeNotePropertyValue({ valueVersion: 1, type: "checkbox", value: "true" }),
    /checkbox value must be boolean/,
  );
  assert.throws(
    () => normalizeNotePropertyValue({ valueVersion: 1, type: "number", value: Number.NaN }),
    /number value must be finite/,
  );
});

test("ratings must be integer values between zero and five", () => {
  for (const value of [-1, 1.5, 6, "4"]) {
    assert.throws(
      () => normalizeNotePropertyValue({ valueVersion: 1, type: "rating", value }),
      /rating value/,
    );
  }
  for (const value of [null, 0, 3, 5]) {
    assert.deepEqual(normalizeNotePropertyValue({ valueVersion: 1, type: "rating", value }), {
      valueVersion: 1,
      type: "rating",
      value,
    });
  }
});

test("option and person references must be unique and resolvable", () => {
  assert.throws(
    () =>
      normalizeNotePropertyValue(
        { valueVersion: 1, type: "multi-select", value: ["open", "missing"] },
        options,
      ),
    /unknown option missing/,
  );
  assert.throws(
    () =>
      normalizeNotePropertyValue(
        { valueVersion: 1, type: "multi-select", value: ["open", "open"] },
        options,
      ),
    /contain duplicates/,
  );
  assert.throws(
    () => normalizeNotePropertyValue({ valueVersion: 1, type: "person", value: ["person_1"] }),
    /unknown person person_1/,
  );
  assert.deepEqual(
    normalizeNotePropertyValue(
      { valueVersion: 1, type: "person", value: ["person_1"] },
      [],
      { personIds: new Set(["person_1"]) },
    ),
    { valueVersion: 1, type: "person", value: ["person_1"] },
  );
});

test("field normalization rejects malformed options and options on unrelated types", () => {
  assert.throws(
    () =>
      normalizeNotePropertyField({
        id: "status",
        name: "Status",
        position: 0,
        options: [...options, options[0]],
        value: { valueVersion: 1, type: "select", value: null },
      }),
    /option IDs contain duplicates/,
  );
  assert.throws(
    () =>
      normalizeNotePropertyField({
        id: "title",
        name: "Title",
        position: 0,
        options,
        value: { valueVersion: 1, type: "text", value: "" },
      }),
    /text properties cannot own options/,
  );
});

test("field collection normalization requires unique IDs and contiguous positions", () => {
  const field = {
    id: "title",
    name: "Title",
    position: 0,
    options: [],
    value: { valueVersion: 1, type: "text", value: "" },
  };
  assert.throws(() => normalizeNotePropertyFields([field, field]), /property IDs contain duplicates/);
  assert.throws(
    () => normalizeNotePropertyFields([{ ...field, position: 2 }]),
    /positions must be contiguous/,
  );
  assert.deepEqual(
    normalizeNotePropertyFields([
      { ...field, id: "second", position: 1 },
      { ...field, id: "first", position: 0 },
    ]).map(({ id }) => id),
    ["first", "second"],
  );
});
