import assert from "node:assert/strict";
import test from "node:test";
import type {
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../../../../src/contracts/workspace";
import {
  buildNoteExportEntry,
  buildWorkspaceExportEntries,
  collectRemoteImageSources,
  planMarkdownImport,
  referenceSafeMarkdown,
  sanitizeFileName,
} from "../../../../src/features/transfer/export/markdown-transfer-model";
import type { MarkdownTree } from "../../../../src/features/transfer/export/markdown-transfer-model";
import { createInitialState, createRendererStore } from "../../../../src/store/store";
import type { RendererState } from "../../../../src/store/types";

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

test("Markdown export refreshes wiki-link labels from stable target ids", () => {
  const nodes = new Map([
    ["target-id", node({ id: "target-id", kind: "note", title: "Renamed target" })],
  ]);
  const documentJson = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "mention_ref",
            attrs: { kind: "note", id: "target-id", label: "Old title" },
          },
        ],
      },
    ],
  };

  assert.equal(
    referenceSafeMarkdown(documentJson, "[[Old title]]", nodes),
    "[[Renamed target]]",
  );
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
  assert.equal(store.applyOperations(plan.contentOperations), true);
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
  const [operation] = plan.contentOperations;
  assert.equal(operation?.type, "save_document");
  if (operation?.type !== "save_document") {
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
  const [operation] = plan.contentOperations;
  assert.equal(operation?.type, "save_document");
  if (operation?.type !== "save_document") {
    return;
  }
  assert.deepEqual(JSON.parse(JSON.stringify(operation.documentJson)), {
    type: "doc",
    attrs: { drawing: null },
    content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
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

import {
  collectImageRefIds,
  collectLocalImageSources,
  imageFileExtension,
  replaceLocalImages,
  resolveImportedImagePath,
  rewriteExportedImagePaths,
} from "../../../../src/features/transfer/export/markdown-transfer-model";

function imageRefDoc(id: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "image_ref", attrs: { id, alt: "shot", width: null, height: null } }],
      },
    ],
  };
}

function workspaceImage(id: string, noteId: string) {
  return {
    id,
    noteId,
    contentHash: "c".repeat(64),
    mimeType: "image/png",
    byteSize: 64,
    width: 10,
    height: 10,
    createdAt: 1,
  };
}

test("workspace export emits image entries and extension-qualified paths", () => {
  const state = createInitialState({
    ...snapshot(
      [node({ id: "shots", kind: "note", title: "Shots", rank: 100 })],
      [
        {
          noteId: "shots",
          documentJson: imageRefDoc("image-1"),
          markdown: "![shot](images/image-1)",
          revision: 1,
          wordCount: 0,
        },
      ],
    ),
    images: [workspaceImage("image-1", "shots")],
  });

  const entries = buildWorkspaceExportEntries(state);
  assert.deepEqual(
    entries.map((entry) => [entry.relativePath, entry.kind]),
    [
      ["Shots.md", "note"],
      ["images/image-1.png", "image"],
    ],
  );
  assert.equal(entries[0]?.markdown, "![shot](images/image-1.png)");
  assert.equal(entries[1]?.contentHash, "c".repeat(64));
});

test("image helpers map mime types, ids, and paths", () => {
  assert.equal(imageFileExtension("image/jpeg"), "jpg");
  assert.equal(imageFileExtension("image/x-exotic"), "img");
  assert.deepEqual(collectImageRefIds(imageRefDoc("image-9")), ["image-9"]);
  assert.equal(
    rewriteExportedImagePaths(
      "![a](images/image-1) ![a](images/image-1)",
      new Map([["image-1", workspaceImage("image-1", "n")]]),
      ["image-1"],
    ),
    "![a](images/image-1.png) ![a](images/image-1.png)",
  );
  assert.equal(resolveImportedImagePath("Deep/Note.md", "./images/pic%201.png"), "Deep/images/pic 1.png");
  assert.equal(resolveImportedImagePath("Note.md", "images/pic.png"), "images/pic.png");
  assert.equal(
    resolveImportedImagePath("Sub/Note.md", "../attachments/pic.png"),
    "attachments/pic.png",
  );
  assert.equal(
    resolveImportedImagePath("A/B/Note.md", "../../assets/pic.png"),
    "assets/pic.png",
  );
  assert.equal(resolveImportedImagePath("Note.md", "../escape.png"), "../escape.png");
});

test("import converts local markdown images into image_ref nodes", () => {
  const plan = planMarkdownImport(
    {
      directories: [],
      files: [
        {
          relativePath: "Shots.md",
          content: "![shot](images/pic.png) and ![remote](https://example.com/x.png)",
        },
      ],
      skipped: 0,
    },
    1,
    () => "note-1",
  );
  const [operation] = plan.contentOperations;
  assert.equal(operation?.type, "save_document");
  if (operation?.type !== "save_document") {
    return;
  }
  assert.deepEqual(plan.notes, [{ id: "note-1", relativePath: "Shots.md" }]);
  assert.deepEqual(collectLocalImageSources(operation.documentJson), ["images/pic.png"]);

  const replaced = replaceLocalImages(
    operation.documentJson,
    new Map([["images/pic.png", "image-1"]]),
  );
  const serialized = JSON.stringify(replaced);
  assert.ok(serialized.includes('"image_ref"'));
  assert.ok(serialized.includes('"image-1"'));
  assert.ok(serialized.includes("https://example.com/x.png"));
  assert.deepEqual(
    collectRemoteImageSources(operation.documentJson),
    ["https://example.com/x.png"],
  );
  assert.equal(plan.remoteImages, 1);
  assert.deepEqual(collectLocalImageSources(replaced), []);
});

test("import resolves unique wiki-link labels to stable imported and existing note ids", () => {
  let nextId = 0;
  const plan = planMarkdownImport(
    {
      directories: [],
      files: [
        { relativePath: "Alpha.md", content: "See [[Beta]] and [[Existing]]." },
        { relativePath: "Beta.md", content: "Back to [[Alpha]]." },
      ],
      skipped: 0,
    },
    1,
    () => `imported-${nextId++}`,
    [{ id: "existing-id", title: "Existing" }],
  );

  const serialized = JSON.stringify(plan.contentOperations);
  assert.ok(serialized.includes('"id":"imported-1"'));
  assert.ok(serialized.includes('"id":"imported-0"'));
  assert.ok(serialized.includes('"id":"existing-id"'));
  assert.equal(plan.unresolvedReferences, 0);
});

test("import keeps ambiguous and unresolved wiki-links as source text", () => {
  let nextId = 0;
  const plan = planMarkdownImport(
    {
      directories: [],
      files: [
        { relativePath: "Same.md", content: "one" },
        { relativePath: "folder/Same.md", content: "two" },
        { relativePath: "Refs.md", content: "See [[Same]] and [[Missing]]." },
      ],
      skipped: 0,
    },
    1,
    () => `imported-${nextId++}`,
  );

  const refs = plan.contentOperations.find(
    (operation) =>
      operation.type === "save_document" &&
      operation.markdown.includes("[[Missing]]"),
  );
  assert.equal(refs?.type, "save_document");
  assert.ok(JSON.stringify(refs).includes("[[Same]]"));
  assert.ok(JSON.stringify(refs).includes("[[Missing]]"));
  assert.ok(!JSON.stringify(refs).includes('"mention_ref"'));
  assert.equal(plan.unresolvedReferences, 2);
});
