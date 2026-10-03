import assert from "node:assert/strict";
import { test } from "vitest";
import { NOTE_TEMPLATES, noteTemplate } from "@/features/templates/built-in";
import { filterNoteTemplates, templatePropertyTemplate } from "@/features/templates/model";

const FIXED_AT = Date.UTC(2026, 6, 31, 12, 0, 0);

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
    assert.ok(markdown.startsWith("# "), `${template.id} scaffold must start with a title heading`);
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
  assert.deepEqual(
    byDescription.map((template) => template.id),
    ["todo"],
  );
  assert.equal(filterNoteTemplates(NOTE_TEMPLATES, "zzz").length, 0);
});
