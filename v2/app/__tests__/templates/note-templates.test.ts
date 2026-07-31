import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTE_TEMPLATES,
  filterNoteTemplates,
  noteTemplate,
  planTemplateNote,
  templatePropertyTemplate,
} from "../../src/templates/note-templates";
import { BUILT_IN_PROPERTY_TEMPLATES } from "../../src/properties/templates";

const FIXED_AT = Date.UTC(2026, 6, 31, 12, 0, 0);

function sequentialIds(prefix = "id") {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

test("catalog ids are unique and every property template resolves", () => {
  const ids = NOTE_TEMPLATES.map((template) => template.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const template of NOTE_TEMPLATES) {
    if (template.propertyTemplateId !== null) {
      const resolved = templatePropertyTemplate(template);
      assert.ok(resolved, `${template.id} references a missing property template`);
      assert.equal(resolved.id, template.propertyTemplateId);
    }
  }
});

test("every template scaffold opens with a level-one heading", () => {
  for (const template of NOTE_TEMPLATES) {
    const markdown = template.buildMarkdown(FIXED_AT);
    assert.ok(
      markdown.startsWith("# "),
      `${template.id} scaffold must start with a title heading`,
    );
  }
});

test("noteTemplate resolves catalog entries and rejects unknown ids", () => {
  assert.equal(noteTemplate("meeting")?.name, "Meeting notes");
  assert.equal(noteTemplate("nope"), null);
});

test("filterNoteTemplates matches name and description, empty query returns all", () => {
  assert.equal(filterNoteTemplates(NOTE_TEMPLATES, "").length, NOTE_TEMPLATES.length);
  assert.deepEqual(
    filterNoteTemplates(NOTE_TEMPLATES, "MEETING").map((template) => template.id),
    ["meeting"],
  );
  const byDescription = filterNoteTemplates(NOTE_TEMPLATES, "checklist");
  assert.deepEqual(byDescription.map((template) => template.id), ["todo"]);
  assert.equal(filterNoteTemplates(NOTE_TEMPLATES, "zzz").length, 0);
});

test("planTemplateNote creates the note, derives the title, and activates it", () => {
  const template = noteTemplate("daily");
  assert.ok(template);

  const plan = planTemplateNote(template, "folder-1", FIXED_AT, sequentialIds());

  const [first] = plan.operations;
  assert.equal(first?.type, "create_note");
  if (first?.type !== "create_note") return;
  assert.equal(first.id, plan.noteId);
  assert.equal(first.at, FIXED_AT);
  assert.deepEqual(first.placement, {
    parentId: "folder-1",
    position: { type: "last" },
  });
  assert.equal(first.title, plan.title);
  assert.ok(plan.title.includes("2026"));
  assert.ok(first.markdown.startsWith(`# ${plan.title}`));

  const last = plan.operations[plan.operations.length - 1];
  assert.deepEqual(last, { type: "set_active_note", noteId: plan.noteId });
});

test("planTemplateNote stores a canonical document/markdown pair", () => {
  const template = noteTemplate("todo");
  assert.ok(template);

  const plan = planTemplateNote(template, null, FIXED_AT, sequentialIds());
  const [first] = plan.operations;
  assert.equal(first?.type, "create_note");
  if (first?.type !== "create_note") return;

  const document = first.documentJson as { type: string; content: unknown[] };
  assert.equal(document.type, "doc");
  const serialized = JSON.stringify(document);
  assert.ok(serialized.includes("check_list"), "checklist items become check_list nodes");
  assert.ok(first.markdown.includes("- [ ]"));
});

test("planTemplateNote instantiates the paired property template with fresh ids", () => {
  const template = noteTemplate("meeting");
  assert.ok(template);
  const meetingFields = BUILT_IN_PROPERTY_TEMPLATES.find(
    (entry) => entry.id === "meeting",
  );
  assert.ok(meetingFields);

  const plan = planTemplateNote(template, null, FIXED_AT, sequentialIds());
  const propertyOps = plan.operations.filter(
    (operation) => operation.type === "set_note_property",
  );

  assert.equal(propertyOps.length, meetingFields.properties.length);
  for (const operation of propertyOps) {
    if (operation.type !== "set_note_property") continue;
    assert.equal(operation.property.noteId, plan.noteId);
    assert.match(operation.property.id, /^property_id-\d+$/);
    for (const option of operation.property.options) {
      assert.match(option.id, /^option_id-\d+$/);
    }
    assert.equal(operation.at, FIXED_AT);
  }
});

test("planTemplateNote emits no property operations without a paired template", () => {
  const template = noteTemplate("weekly-review");
  assert.ok(template);

  const plan = planTemplateNote(template, null, FIXED_AT, sequentialIds());

  assert.equal(
    plan.operations.filter((operation) => operation.type === "set_note_property").length,
    0,
  );
  assert.equal(plan.operations.length, 2);
});
