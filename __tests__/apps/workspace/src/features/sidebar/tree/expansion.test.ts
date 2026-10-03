import assert from "node:assert/strict";
import { test } from "vitest";
import { nextFolderExpansion } from "@/features/sidebar/tree/expansion";
import type { NodeRecord } from "@skriuw/renderer-core/store/types";

function record(id: string, kind: NodeRecord["kind"], title: string): NodeRecord {
  return { id, kind, title, parentId: null, depth: 1, setSize: 1, posInSet: 1 };
}

const nodes = new Map([
  ["folder-a", record("folder-a", "folder", "Alpha folder")],
  ["note-a", record("note-a", "note", "Alpha note")],
  ["folder-b", record("folder-b", "folder", "Beta folder")],
]);

test("folder toggle collapses any expansion and otherwise expands every folder", () => {
  assert.deepEqual([...nextFolderExpansion(nodes, new Set(["folder-a"]))], []);
  assert.deepEqual([...nextFolderExpansion(nodes, new Set())], ["folder-a", "folder-b"]);
});
