import assert from "node:assert/strict";
import test from "node:test";
import { nextFolderExpansion, searchSidebarNodes } from "../../src/sidebar/sidebar-search";
import type { NodeRecord } from "../../src/store/types";

function record(id: string, kind: NodeRecord["kind"], title: string): NodeRecord {
  return { id, kind, title, parentId: null, depth: 1, setSize: 1, posInSet: 1 };
}

const nodes = new Map([
  ["folder-a", record("folder-a", "folder", "Alpha folder")],
  ["note-a", record("note-a", "note", "Alpha note")],
  ["note-b", record("note-b", "note", "Another alpha")],
  ["folder-b", record("folder-b", "folder", "Beta folder")],
]);
const order = ["folder-a", "note-a", "note-b", "folder-b"];

test("sidebar search is case-insensitive, ordered, typed, and bounded", () => {
  const results = searchSidebarNodes(nodes, order, "  ALPHA ", 1);
  assert.deepEqual(results.folders.map((node) => node.id), ["folder-a"]);
  assert.deepEqual(results.notes.map((node) => node.id), ["note-a"]);
  assert.equal(results.folderTotal, 1);
  assert.equal(results.noteTotal, 2);
  assert.deepEqual(searchSidebarNodes(nodes, order, "", 10), {
    folders: [],
    notes: [],
    folderTotal: 0,
    noteTotal: 0,
  });
});

test("folder toggle collapses any expansion and otherwise expands every folder", () => {
  assert.deepEqual([...nextFolderExpansion(nodes, new Set(["folder-a"]))], []);
  assert.deepEqual([...nextFolderExpansion(nodes, new Set())], ["folder-a", "folder-b"]);
});
