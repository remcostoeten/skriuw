import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildFolderStructure,
  formatFolderStructure,
  renderFolderTree,
} from "@/features/transfer/export/folder-structure";
import { buildNodeIndex } from "@skriuw/renderer-core/store/tree";
import type { DocumentRecord } from "@skriuw/renderer-core/store/types";

function fixture() {
  const index = buildNodeIndex([
    { id: "root", parentId: null, kind: "folder", title: "Projects" },
    { id: "a", parentId: "root", kind: "note", title: "Plan" },
    { id: "b", parentId: "root", kind: "folder", title: "Archive" },
    { id: "c", parentId: "b", kind: "folder", title: "2025" },
    { id: "d", parentId: "c", kind: "note", title: "Retro" },
    { id: "e", parentId: "root", kind: "folder", title: "Empty" },
    { id: "f", parentId: null, kind: "note", title: "Outside" },
  ]);
  const documents = new Map<string, DocumentRecord>([
    [
      "a",
      {
        noteId: "a",
        documentJson: null,
        markdown: "# Plan",
        revision: 1,
        wordCount: 1,
        hasLosslessMarkdown: true,
      },
    ],
  ]);
  return { ...index, documents };
}

test("builds the full folder structure recursively with note markdown", () => {
  assert.deepEqual(buildFolderStructure(fixture(), "root"), {
    kind: "folder",
    title: "Projects",
    children: [
      { kind: "note", title: "Plan", markdown: "# Plan" },
      {
        kind: "folder",
        title: "Archive",
        children: [
          {
            kind: "folder",
            title: "2025",
            children: [{ kind: "note", title: "Retro", markdown: "" }],
          },
        ],
      },
      { kind: "folder", title: "Empty", children: [] },
    ],
  });
});

test("marks non-empty folders cut off by the depth limit as truncated", () => {
  const structure = buildFolderStructure(fixture(), "root", 1);
  assert.deepEqual(structure?.kind === "folder" && structure.children.slice(1), [
    { kind: "folder", title: "Archive", children: [], truncated: true },
    { kind: "folder", title: "Empty", children: [] },
  ]);
});

test("renders a tree-style listing", () => {
  const structure = buildFolderStructure(fixture(), "root");
  assert.ok(structure);
  assert.equal(
    renderFolderTree(structure),
    [
      "Projects/",
      "├── Plan",
      "├── Archive/",
      "│   └── 2025/",
      "│       └── Retro",
      "└── Empty/",
    ].join("\n"),
  );
  assert.equal(
    formatFolderStructure(fixture(), "root", "tree", 1),
    ["Projects/", "├── Plan", "├── Archive/ …", "└── Empty/"].join("\n"),
  );
});

test("returns null for notes and unknown ids", () => {
  assert.equal(formatFolderStructure(fixture(), "f", "json", null), null);
  assert.equal(formatFolderStructure(fixture(), "missing", "tree", null), null);
});
