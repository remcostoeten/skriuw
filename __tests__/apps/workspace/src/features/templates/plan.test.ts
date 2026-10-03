import assert from "node:assert/strict";
import { test } from "vitest";
import { noteTemplate } from "@/features/templates/built-in";
import { planTemplateNote } from "@/features/templates/plan";
import { BUILT_IN_PROPERTY_TEMPLATES } from "@skriuw/renderer-core/properties/templates";

const FIXED_AT = Date.UTC(2026, 6, 31, 12, 0, 0);

function sequentialIds(prefix = "id") {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

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
  const meetingFields = BUILT_IN_PROPERTY_TEMPLATES.find((entry) => entry.id === "meeting");
  assert.ok(meetingFields);

  const plan = planTemplateNote(template, null, FIXED_AT, sequentialIds());
  const propertyOps = plan.operations.filter((operation) => operation.type === "set_note_property");

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
