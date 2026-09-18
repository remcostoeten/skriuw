import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../../src/contracts/workspace";
import { JOURNAL_DATE_PROPERTY_ID, JOURNAL_ROOT_ID } from "../../../src/features/journal/constants";
import {
  applyJournalTemplate,
  journalTemplateId,
  journalTemplates,
  planJournalTemplate,
  rememberedJournalTemplate,
} from "../../../src/features/journal/journal-template";
import { selectJournalEntries } from "../../../src/features/journal/model";
import { noteTemplate } from "../../../src/features/templates/note-templates";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import { setupTauriInvokeStub } from "../../shared/tauri-stub";

setupTauriInvokeStub();

function node(partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind">): WorkspaceNode {
  return {
    parentId: null,
    rank: 0,
    title: partial.id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    ...partial,
  };
}

function snapshot(settings: Record<string, unknown> = {}): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: null,
    nodes: [
      node({ id: JOURNAL_ROOT_ID, kind: "folder", rank: 100, title: "Journal" }),
      node({ id: "entry", kind: "note", parentId: JOURNAL_ROOT_ID, rank: 100, title: "Untitled" }),
      node({ id: "written", kind: "note", parentId: JOURNAL_ROOT_ID, rank: 200 }),
      node({ id: "source", kind: "note", rank: 300, title: "Evening review" }),
    ],
    documents: [
      { noteId: "entry", documentJson: { type: "doc", content: [{ type: "paragraph" }] }, markdown: "", revision: 4, wordCount: 0 },
      { noteId: "written", documentJson: { type: "doc" }, markdown: "kept", revision: 2, wordCount: 1 },
      {
        noteId: "source",
        documentJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Review {{date}}" }] },
          ],
        },
        markdown: "# Review {{date}}\n",
        revision: 1,
        wordCount: 2,
      },
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
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "",
      ...settings,
    },
    tags: [],
    people: [],
    references: [],
    properties: [
      {
        noteId: "entry",
        id: JOURNAL_DATE_PROPERTY_ID,
        name: "Date",
        value: { valueVersion: 1, type: "date", value: "2026-03-09" },
        options: [],
        position: 0,
      },
    ],
  };
}

test("journal templates offer the scaffolds and saved templates, never the blank note", () => {
  const state = createInitialState(snapshot({ noteTemplateIds: ["source"] }));
  const ids = journalTemplates(state).map((template) => template.id);
  assert.ok(ids.includes("daily"));
  assert.ok(ids.includes("personal_source"));
  assert.ok(!ids.includes("blank"));
});

test("a corrupt saved-template list leaves the built-in scaffolds available", () => {
  const state = createInitialState(snapshot({ noteTemplateIds: "nope" }));
  assert.ok(journalTemplates(state).some((template) => template.id === "daily"));
});

test("the remembered template resolves only while its source still exists", () => {
  assert.equal(rememberedJournalTemplate(createInitialState(snapshot())), null);
  assert.equal(
    rememberedJournalTemplate(createInitialState(snapshot({ journalTemplateId: "daily" })))?.id,
    "daily",
  );
  assert.equal(
    rememberedJournalTemplate(
      createInitialState(snapshot({ journalTemplateId: "personal_missing" })),
    ),
    null,
  );
  assert.equal(journalTemplateId({ ...snapshot().settings, journalTemplateId: 7 }), null);
});

test("the plan stamps the entry's own day and renames it from the heading", () => {
  const operations = planJournalTemplate({
    template: noteTemplate("daily")!,
    noteId: "entry",
    dateKey: "2026-03-09",
    expectedRevision: 4,
    at: 50,
    createId: () => "id",
  });
  assert.deepEqual(
    operations.map((operation) => operation.type),
    ["save_document", "rename_node"],
  );
  const [save, rename] = operations;
  assert.ok(save?.type === "save_document" && rename?.type === "rename_node");
  assert.equal(save.expectedRevision, 4);
  assert.ok(save.wordCount > 0);
  assert.ok(save.markdown.startsWith("# Monday, March 9, 2026"));
  assert.equal(rename.title, "Monday, March 9, 2026");
});

test("applying fills the empty entry, remembers the choice, and keeps the journal fields", async () => {
  const store = createRendererStore(createInitialState(snapshot({ noteTemplateIds: ["source"] })));
  const template = journalTemplates(store.getState()).find(
    (candidate) => candidate.id === "personal_source",
  )!;
  await applyJournalTemplate(store, "entry", "2026-03-09", template);
  const state = store.getState();
  assert.equal(state.documents.get("entry")?.markdown.trim(), "# Review 2026-03-09");
  assert.equal(state.nodes.get("entry")?.title, "Review 2026-03-09");
  assert.equal(journalTemplateId(state.settings), "personal_source");
  assert.deepEqual(
    selectJournalEntries(state).map((entry) => [entry.noteId, entry.dateKey]),
    [["entry", "2026-03-09"]],
  );
});

test("an entry that already has words is never replaced", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  await applyJournalTemplate(store, "written", "2026-03-10", noteTemplate("daily")!);
  assert.equal(store.getState().documents.get("written")?.markdown, "kept");
  assert.equal(journalTemplateId(store.getState().settings), null);
});
