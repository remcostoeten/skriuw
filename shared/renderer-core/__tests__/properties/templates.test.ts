import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILT_IN_PROPERTY_TEMPLATES,
  deletePropertyTemplate,
  instantiatePropertyTemplate,
  reorderPropertyTemplates,
  upsertPropertyTemplate,
} from "../../src/properties/templates";
import type { PropertyIdFactory } from "../../src/properties/types";
import { normalizeNotePropertyFields } from "../../src/properties/value";

function idFactory(prefix: string): PropertyIdFactory {
  let next = 0;
  return (kind) => `${prefix}_${kind}_${++next}`;
}

test("built-in templates preserve the useful v1 preset catalog", () => {
  assert.deepEqual(
    BUILT_IN_PROPERTY_TEMPLATES.map(({ id, name }) => ({ id, name })),
    [
      { id: "blank", name: "Blank" },
      { id: "meeting", name: "Meeting" },
      { id: "project", name: "Project" },
      { id: "contact", name: "Contact" },
      { id: "journal", name: "Journal" },
      { id: "idea", name: "Idea" },
      { id: "reading", name: "Reading" },
    ],
  );
  for (const template of BUILT_IN_PROPERTY_TEMPLATES) {
    assert.doesNotThrow(() => normalizeNotePropertyFields(template.properties));
  }
});

test("instantiation generates fresh property and option IDs", () => {
  const project = BUILT_IN_PROPERTY_TEMPLATES.find(({ id }) => id === "project")!;
  const first = instantiatePropertyTemplate(project, "note_1", idFactory("first"));
  const second = instantiatePropertyTemplate(project, "note_2", idFactory("second"));

  assert.equal(first.length, 6);
  assert.ok(first.every(({ noteId }) => noteId === "note_1"));
  assert.deepEqual(first.map(({ position }) => position), [0, 1, 2, 3, 4, 5]);
  assert.notDeepEqual(first.map(({ id }) => id), second.map(({ id }) => id));
  assert.notDeepEqual(
    first.flatMap(({ options }) => options.map(({ id }) => id)),
    second.flatMap(({ options }) => options.map(({ id }) => id)),
  );
});

test("instantiated values and options are independent of templates and sibling notes", () => {
  const meeting = BUILT_IN_PROPERTY_TEMPLATES.find(({ id }) => id === "meeting")!;
  const first = instantiatePropertyTemplate(meeting, "note_1", idFactory("first"));
  const second = instantiatePropertyTemplate(meeting, "note_2", idFactory("second"));
  const firstStatus = first.find(({ name }) => name === "Status")!;
  const templateStatus = meeting.properties.find(({ name }) => name === "Status")!;

  firstStatus.options[0]!.label = "Changed";

  assert.equal(templateStatus.options[0]?.label, "Scheduled");
  assert.equal(second.find(({ name }) => name === "Status")?.options[0]?.label, "Scheduled");
});

test("instantiation remaps selected option references and rejects duplicate generated IDs", () => {
  const selectedTemplate = {
    id: "selected",
    name: "Selected",
    position: 0,
    properties: [
      {
        id: "status",
        name: "Status",
        position: 0,
        options: [{ id: "open", label: "Open", color: "blue" as const }],
        value: { valueVersion: 1 as const, type: "select" as const, value: "open" },
      },
    ],
  };
  const instantiated = instantiatePropertyTemplate(
    selectedTemplate,
    "note_1",
    idFactory("fresh"),
  );

  assert.equal(instantiated[0]?.value.value, instantiated[0]?.options[0]?.id);
  const project = BUILT_IN_PROPERTY_TEMPLATES.find(({ id }) => id === "project")!;
  assert.throws(
    () => instantiatePropertyTemplate(project, "note_1", () => "duplicate"),
    /option IDs contain duplicates|property IDs contain duplicates/,
  );
});

test("template operations append, replace, delete, and reorder immutably", () => {
  const blank = BUILT_IN_PROPERTY_TEMPLATES[0]!;
  const meeting = { ...BUILT_IN_PROPERTY_TEMPLATES[1]!, position: 1 };
  const source = [blank];
  const appended = upsertPropertyTemplate(source, meeting);
  const replaced = upsertPropertyTemplate(appended, { ...meeting, name: "Standup" });
  const reordered = reorderPropertyTemplates(replaced, ["meeting", "blank"]);
  const deleted = deletePropertyTemplate(reordered, "blank");

  assert.equal(source.length, 1);
  assert.equal(replaced[1]?.name, "Standup");
  assert.deepEqual(reordered.map(({ position }) => position), [0, 1]);
  assert.deepEqual(deleted.map(({ id, position }) => ({ id, position })), [
    { id: "meeting", position: 0 },
  ]);
});

test("template reorders reject missing, duplicate, and foreign IDs", () => {
  const source = BUILT_IN_PROPERTY_TEMPLATES.slice(0, 2);
  assert.throws(() => reorderPropertyTemplates(source, ["blank"]), /each owned ID/);
  assert.throws(() => reorderPropertyTemplates(source, ["blank", "blank"]), /each owned ID/);
  assert.throws(() => reorderPropertyTemplates(source, ["blank", "foreign"]), /each owned ID/);
});
