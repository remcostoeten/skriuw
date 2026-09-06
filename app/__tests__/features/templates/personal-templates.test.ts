import assert from "node:assert/strict";
import test from "node:test";
import {
  personalTemplateIds,
  personalTemplates,
} from "../../../src/features/templates/personal-templates";
import { planTemplateNote } from "../../../src/features/templates/note-templates";
import { createInitialState } from "../../../src/store/store";
import { fixtureNode, fixtureSettings } from "../references/fixtures";
import { parseProductMarkdown } from "../../../src/features/editor/schema";

function templateState() {
  const markdown = "# Meeting {{date}}\n\n- [ ] Follow up\n";
  return createInitialState({
    protocolVersion: 1,
    activeNoteId: "source",
    historyHeaders: [],
    tags: [],
    people: [],
    references: [],
    settings: { ...fixtureSettings(), noteTemplateIds: ["source"] },
    nodes: [
      fixtureNode({ id: "folder", kind: "folder", title: "Meetings" }),
      fixtureNode({
        id: "source",
        kind: "note",
        title: "Meeting",
        parentId: "folder",
      }),
    ],
    properties: [
      {
        noteId: "source",
        id: "field-original",
        name: "Stage",
        position: 0,
        value: { valueVersion: 1, type: "select", value: "option-original" },
        options: [{ id: "option-original", label: "Draft", color: "gray" }],
      },
    ],
    documents: [
      {
        noteId: "source",
        markdown,
        documentJson: parseProductMarkdown(markdown).toJSON(),
        revision: 1,
        wordCount: 5,
      },
    ],
  });
}

test("personal templates expand dates, retain source content and use its folder", () => {
  const state = templateState();
  const original = JSON.stringify(state.documents.get("source"));
  const [template] = personalTemplates(state);
  assert.ok(template);
  assert.equal(template.defaultParentId, "folder");
  let id = 0;
  const plan = planTemplateNote(
    template,
    template.defaultParentId ?? null,
    new Date(2026, 8, 6, 12).getTime(),
    () => `fresh-${++id}`,
  );
  const create = plan.operations[0];
  assert.equal(create.type, "create_note");
  if (create.type !== "create_note") return;
  assert.equal(create.title, "Meeting 2026-09-06");
  assert.equal(create.placement.parentId, "folder");
  assert.equal(JSON.stringify(state.documents.get("source")), original);
  assert.notEqual(create.id, "source");
  const property = plan.operations.find(
    (operation) => operation.type === "set_note_property",
  );
  assert.ok(property && property.type === "set_note_property");
  assert.notEqual(property.property.id, "field-original");
  assert.notEqual(property.property.options[0].id, "option-original");
  assert.equal(property.property.value.value, property.property.options[0].id);
});

test("unavailable source notes stay registered but are excluded from the picker", () => {
  const state = templateState();
  state.nodes.delete("source");
  assert.deepEqual(personalTemplates(state), []);
  assert.deepEqual(personalTemplateIds(state.settings), ["source"]);
});

test("template membership survives serialization and rejects malformed input", () => {
  const settings = templateState().settings;
  assert.deepEqual(personalTemplateIds(JSON.parse(JSON.stringify(settings))), [
    "source",
  ]);
  assert.throws(
    () => personalTemplateIds({ ...settings, noteTemplateIds: [42] }),
    /invalid/,
  );
  assert.throws(
    () =>
      personalTemplateIds({
        ...settings,
        noteTemplateIds: Array(201).fill("source"),
      }),
    /invalid/,
  );
});

test("each template copy owns fresh task and block IDs without source comment anchors", () => {
  const state = templateState();
  const record = state.documents.get("source")!;
  const json = structuredClone(record.documentJson) as {
    content: Array<{ content: Array<{ attrs?: Record<string, unknown>; marks?: unknown[] }> }>;
  };
  json.content[1].content[0].attrs = { checked: false, taskId: "source-task", blockId: "source-block" };
  json.content[0].content[0].marks = [{ type: "annotation", attrs: { threadId: "source-thread" } }];
  state.documents.set("source", { ...record, documentJson: json });
  const [template] = personalTemplates(state);
  let id = 0;
  const first = planTemplateNote(template, null, Date.now(), () => `copy-${++id}`);
  const second = planTemplateNote(template, null, Date.now(), () => `copy-${++id}`);
  const firstCreate = first.operations[0];
  const secondCreate = second.operations[0];
  assert.equal(firstCreate.type, "create_note");
  assert.equal(secondCreate.type, "create_note");
  if (firstCreate.type !== "create_note" || secondCreate.type !== "create_note") return;
  for (const create of [firstCreate, secondCreate]) {
    assert.doesNotMatch(JSON.stringify(create.documentJson), /source-task|source-block|source-thread/);
    assert.doesNotMatch(create.markdown, /source-task|source-block|source-thread/);
  }
  assert.notDeepEqual(firstCreate.documentJson, secondCreate.documentJson);
  assert.match(JSON.stringify(state.documents.get("source")?.documentJson), /source-thread/);
});
