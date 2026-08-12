import assert from "node:assert/strict";
import test from "node:test";
import type {
  NoteProperty,
  NotePropertyTemplate,
  WorkspaceSnapshot,
} from "../../src/contracts/workspace";
import { createInitialState, createRendererStore } from "../../src/store/store";

const textProperty: NoteProperty = {
  noteId: "note_1",
  id: "summary",
  name: "Summary",
  value: { valueVersion: 1, type: "text", value: "" },
  options: [],
  position: 0,
};

const statusProperty: NoteProperty = {
  noteId: "note_1",
  id: "status",
  name: "Status",
  value: { valueVersion: 1, type: "select", value: null },
  options: [{ id: "open", label: "Open", color: "blue" }],
  position: 1,
};

const secondNoteProperty: NoteProperty = {
  noteId: "note_2",
  id: "owner",
  name: "Owner",
  value: { valueVersion: 1, type: "person", value: [] },
  options: [],
  position: 0,
};

const template: NotePropertyTemplate = {
  id: "basic",
  name: "Basic",
  position: 0,
  properties: [
    {
      id: "template_summary",
      name: "Summary",
      value: { valueVersion: 1, type: "text", value: "" },
      options: [],
      position: 0,
    },
  ],
};

function snapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "note_1",
    nodes: [
      {
        id: "folder_1",
        kind: "folder",
        parentId: null,
        rank: 1024,
        title: "Folder",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
      {
        id: "note_1",
        kind: "note",
        parentId: "folder_1",
        rank: 1024,
        title: "First",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
      {
        id: "note_2",
        kind: "note",
        parentId: null,
        rank: 2048,
        title: "Second",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
    ],
    documents: [
      { noteId: "note_1", documentJson: {}, markdown: "", revision: 1, wordCount: 0 },
      { noteId: "note_2", documentJson: {}, markdown: "", revision: 1, wordCount: 0 },
    ],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      reduceMotion: false,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "normal",
      showLineNumbers: false,
      editorPlaceholder: "Write",
    },
    tags: [],
    people: [],
    references: [],
    properties: [statusProperty, secondNoteProperty, textProperty],
    propertyTemplates: [template],
  };
}

test("snapshot hydration indexes ordered properties per note and ordered templates", () => {
  const state = createInitialState(snapshot());

  assert.deepEqual(
    state.propertiesByNoteId.get("note_1")?.map(({ id }) => id),
    ["summary", "status"],
  );
  assert.deepEqual(state.propertyTemplates.map(({ id }) => id), ["basic"]);
});

test("property operations replace only the owning note projection", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = store.getState();
  const noteOneBefore = before.propertiesByNoteId.get("note_1");
  const noteTwoBefore = before.propertiesByNoteId.get("note_2");

  store.applyOperations([
    {
      type: "set_note_property",
      property: { ...textProperty, name: "Overview" },
      at: 10,
    },
  ]);
  const afterSet = store.getState();

  assert.notEqual(afterSet.propertiesByNoteId, before.propertiesByNoteId);
  assert.notEqual(afterSet.propertiesByNoteId.get("note_1"), noteOneBefore);
  assert.equal(afterSet.propertiesByNoteId.get("note_2"), noteTwoBefore);
  assert.equal(afterSet.propertiesByNoteId.get("note_1")?.[0]?.name, "Overview");

  store.applyOperations([
    {
      type: "reorder_note_properties",
      noteId: "note_1",
      orderedPropertyIds: ["status", "summary"],
      at: 11,
    },
  ]);
  assert.deepEqual(
    store.getState().propertiesByNoteId.get("note_1")?.map(({ id, position }) => ({
      id,
      position,
    })),
    [
      { id: "status", position: 0 },
      { id: "summary", position: 1 },
    ],
  );

  store.applyOperations([
    { type: "remove_note_property", noteId: "note_1", propertyId: "status", at: 12 },
  ]);
  assert.deepEqual(
    store.getState().propertiesByNoteId.get("note_1")?.map(({ id }) => id),
    ["summary"],
  );
});

test("invalid and foreign property operations preserve state identity", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = store.getState();

  assert.equal(
    store.applyOperations([
      {
        type: "set_note_property",
        property: { ...textProperty, noteId: "missing" },
        at: 10,
      },
      {
        type: "reorder_note_properties",
        noteId: "note_1",
        orderedPropertyIds: ["summary", "summary"],
        at: 11,
      },
    ]),
    false,
  );
  assert.equal(store.getState(), before);
});

test("template operations preserve property projections and ordered identities", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const propertiesBefore = store.getState().propertiesByNoteId;
  const extra: NotePropertyTemplate = {
    id: "empty",
    name: "Empty",
    position: 1,
    properties: [],
  };

  store.applyOperations([{ type: "set_note_property_template", template: extra }]);
  assert.equal(store.getState().propertiesByNoteId, propertiesBefore);
  assert.deepEqual(store.getState().propertyTemplates.map(({ id }) => id), ["basic", "empty"]);

  store.applyOperations([
    {
      type: "reorder_note_property_templates",
      orderedTemplateIds: ["empty", "basic"],
    },
  ]);
  assert.deepEqual(
    store.getState().propertyTemplates.map(({ id, position }) => ({ id, position })),
    [
      { id: "empty", position: 0 },
      { id: "basic", position: 1 },
    ],
  );

  store.applyOperations([{ type: "delete_note_property_template", templateId: "basic" }]);
  assert.deepEqual(store.getState().propertyTemplates.map(({ id }) => id), ["empty"]);
});

test("soft trash preserves properties while permanent purge removes descendant properties", () => {
  const store = createRendererStore(createInitialState(snapshot()));

  store.applyOperations([{ type: "trash_subtree", rootId: "folder_1", at: 20 }]);
  assert.equal(store.getState().propertiesByNoteId.has("note_1"), true);

  store.applyOperations([
    { type: "purge_subtree", rootId: "folder_1", trashedBefore: 21 },
  ]);
  assert.equal(store.getState().propertiesByNoteId.has("note_1"), false);
  assert.equal(store.getState().propertiesByNoteId.has("note_2"), true);
});
