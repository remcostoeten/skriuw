import assert from "node:assert/strict";
import test from "node:test";
import type {
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../../src/contracts/workspace";
import {
  buildNoteExportEntry,
  buildWorkspaceExportEntries,
  planMarkdownImport,
  sanitizeFileName,
} from "../../src/export/markdown-transfer-model";
import type { MarkdownTree } from "../../src/export/markdown-transfer-model";
import { createInitialState, createRendererStore } from "../../src/store/store";
import type { RendererState } from "../../src/store/types";

function node(
  partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind">,
): WorkspaceNode {
  return {
    parentId: null,
    rank: 0,
    title: partial.id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...partial,
  };
}

function document(noteId: string, markdown: string) {
  return {
    noteId,
    documentJson: { type: "doc" },
    markdown,
    revision: 1,
    wordCount: 1,
  };
}

function snapshot(
  nodes: WorkspaceNode[],
  documents: ReturnType<typeof document>[],
): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: null,
    nodes,
    documents,
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
      editorPlaceholder: "Start writing",
    },
  };
}

function fixtureState(): RendererState {
  return createInitialState(
    snapshot(
      [
        node({ id: "projects", kind: "folder", title: "Projects", rank: 100 }),
        node({
          id: "skriuw",
          kind: "folder",
          title: "Skriuw",
          parentId: "projects",
          rank: 100,
        }),
        node({
          id: "roadmap",
          kind: "note",
          title: "Roadmap",
          parentId: "skriuw",
          rank: 100,
        }),
        node({
          id: "weird",
          kind: "note",
          title: "a/b: test?",
          parentId: "projects",
          rank: 200,
        }),
        node({ id: "same-a", kind: "note", title: "Same", rank: 200 }),
        node({ id: "same-b", kind: "note", title: "same", rank: 300 }),
      ],
      [
        document("roadmap", "# Roadmap\n\nShip *soon*"),
        document("weird", "weird name"),
        document("same-a", "one"),
        document("same-b", "two"),
      ],
    ),
  );
}

function childTitles(state: RendererState, parentId: string | null): string[] {
  return (state.childrenByParent.get(parentId) ?? []).map(
    (id) => state.nodes.get(id)?.title ?? "?",
  );
}

function childIdByTitle(
  state: RendererState,
  parentId: string | null,
  title: string,
): string {
  const id = (state.childrenByParent.get(parentId) ?? []).find(
    (candidate) => state.nodes.get(candidate)?.title === title,
  );
  assert.ok(id, `missing node titled ${title}`);
  return id;
}

test("sanitizeFileName strips forbidden characters and trailing dots", () => {
  assert.equal(sanitizeFileName("a/b: test?"), "ab test");
  assert.equal(sanitizeFileName('pipes|and"quotes<here>'), "pipesandquoteshere");
  assert.equal(sanitizeFileName("back\\slash*star"), "backslashstar");
  assert.equal(sanitizeFileName("trailing dots..."), "trailing dots");
  assert.equal(sanitizeFileName('<>:"/\\|?*'), "Untitled");
  assert.equal(sanitizeFileName("   "), "Untitled");
});

test("buildNoteExportEntry names the file after the sanitized title", () => {
  const entry = buildNoteExportEntry("a/b: test?", "body");
  assert.deepEqual(entry, { relativePath: "ab test.md", kind: "note", markdown: "body" });
});

test("workspace export mirrors the tree and dedupes colliding names", () => {
  const entries = buildWorkspaceExportEntries(fixtureState());
  assert.deepEqual(
    entries.map((entry) => [entry.relativePath, entry.kind]),
    [
      ["Projects", "folder"],
      ["Projects/Skriuw", "folder"],
      ["Projects/Skriuw/Roadmap.md", "note"],
      ["Projects/ab test.md", "note"],
      ["Same.md", "note"],
      ["same (2).md", "note"],
    ],
  );
  const roadmap = entries.find((entry) => entry.relativePath.endsWith("Roadmap.md"));
  assert.equal(roadmap?.markdown, "# Roadmap\n\nShip *soon*");
});

test("sibling folders with colliding names get numbered suffixes", () => {
  const entries = buildWorkspaceExportEntries(
    createInitialState(
      snapshot(
        [
          node({ id: "f1", kind: "folder", title: "Docs?", rank: 100 }),
          node({ id: "f2", kind: "folder", title: "docs", rank: 200 }),
          node({ id: "n1", kind: "note", title: "Docs", rank: 300 }),
        ],
        [document("n1", "note body")],
      ),
    ),
  );
  assert.deepEqual(
    entries.map((entry) => entry.relativePath),
    ["Docs", "docs (2)", "Docs.md"],
  );
});

test("round trip preserves hierarchy, titles, and markdown", () => {
  const exported = buildWorkspaceExportEntries(fixtureState());
  const tree: MarkdownTree = {
    directories: exported
      .filter((entry) => entry.kind === "folder")
      .map((entry) => entry.relativePath),
    files: exported
      .filter((entry) => entry.kind === "note")
      .map((entry) => ({ relativePath: entry.relativePath, content: entry.markdown ?? "" })),
    skipped: 0,
  };
  let nextId = 0;
  const plan = planMarkdownImport(tree, 42, () => `imported-${nextId++}`);
  assert.equal(plan.noteCount, 4);
  assert.equal(plan.folderCount, 2);

  const store = createRendererStore(createInitialState(snapshot([], [])));
  assert.equal(store.applyOperations(plan.operations), true);
  const state = store.getState();

  assert.deepEqual(childTitles(state, null), ["Projects", "Same", "same (2)"]);
  const projectsId = childIdByTitle(state, null, "Projects");
  assert.deepEqual(childTitles(state, projectsId), ["Skriuw", "ab test"]);
  const skriuwId = childIdByTitle(state, projectsId, "Skriuw");
  assert.deepEqual(childTitles(state, skriuwId), ["Roadmap"]);

  const roadmapId = childIdByTitle(state, skriuwId, "Roadmap");
  assert.equal(state.documents.get(roadmapId)?.markdown, "# Roadmap\n\nShip *soon*");
  const sameId = childIdByTitle(state, null, "Same");
  assert.equal(state.documents.get(sameId)?.markdown, "one");
});

test("references and mentions degrade to plain text on import", () => {
  const plan = planMarkdownImport(
    {
      directories: [],
      files: [
        { relativePath: "Refs.md", content: "Hello @Alice, ask $Bob about #work today" },
      ],
      skipped: 0,
    },
    1,
    () => "ref-note",
  );
  const [operation] = plan.operations;
  assert.equal(operation?.type, "create_note");
  if (operation?.type !== "create_note") {
    return;
  }
  const serialized = JSON.stringify(operation.documentJson);
  assert.ok(!serialized.includes("mention_ref"));
  assert.ok(!serialized.includes("tag_ref"));
  assert.ok(operation.markdown.includes("@Alice"));
  assert.ok(operation.markdown.includes("#work"));
});

test("unparseable markdown imports as plain paragraphs instead of failing", () => {
  const plan = planMarkdownImport(
    {
      directories: [],
      files: [{ relativePath: "Broken.md", content: "" }],
      skipped: 0,
    },
    1,
    () => "broken-note",
  );
  const [operation] = plan.operations;
  assert.equal(operation?.type, "create_note");
  if (operation?.type !== "create_note") {
    return;
  }
  assert.deepEqual(operation.documentJson, {
    type: "doc",
    content: [{ type: "paragraph" }],
  });
});

test("import creates folders for empty directories and nested files", () => {
  let nextId = 0;
  const plan = planMarkdownImport(
    {
      directories: ["Empty/Nested"],
      files: [{ relativePath: "Deep/Down/Note.md", content: "hi" }],
      skipped: 0,
    },
    7,
    () => `id-${nextId++}`,
  );
  const folders = plan.operations.filter((operation) => operation.type === "create_folder");
  assert.deepEqual(
    folders.map((operation) => operation.title),
    ["Deep", "Empty", "Down", "Nested"],
  );
  assert.equal(plan.folderCount, 4);
  const note = plan.operations.find((operation) => operation.type === "create_note");
  assert.equal(note?.type, "create_note");
  if (note?.type !== "create_note") {
    return;
  }
  const down = folders.find((operation) => operation.title === "Down");
  assert.equal(note.placement.parentId, down && "id" in down ? down.id : null);
});
