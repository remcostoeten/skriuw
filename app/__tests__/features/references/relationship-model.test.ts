import assert from "node:assert/strict";
import test from "node:test";
import { projectCoVisitedNotes, projectRelationshipGraph, projectSharedEntities } from "../../../src/features/references/relationship-model";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import { referenceFixture } from "./fixtures";

function store() {
  const fixture = referenceFixture();
  return createRendererStore(createInitialState(fixture.snapshot, undefined, fixture.references));
}

test("shared tags use inverse references, dedupe identity, and exclude self", () => {
  const renderer = store();
  const state = renderer.getState();
  assert.deepEqual(projectSharedEntities(state, "note-b", "tag"), [
    { noteId: "note-c", title: "Gamma note", updatedAt: 1, sharedEntityIds: ["tag-alpha"] },
  ]);
});

test("co-visitation is symmetric, bounded renderer session state, and ranks repeat visits", () => {
  const renderer = store();
  renderer.setActiveNote("note-b");
  renderer.setActiveNote("note-a");
  renderer.setActiveNote("note-c");
  renderer.setActiveNote("note-a");
  renderer.setActiveNote("note-b");
  assert.deepEqual(projectCoVisitedNotes(renderer.getState(), "note-a").map((entry) => entry.noteId), ["note-b", "note-c"]);
});

test("local graph has stable direct relationship nodes and remains bounded", () => {
  const graph = projectRelationshipGraph(store().getState(), "note-b");
  assert.ok(graph.nodes.some((node) => node.id === "note-a"));
  assert.ok(graph.nodes.some((node) => node.id === "tag:tag-alpha"));
  assert.ok(graph.nodes.length <= 24);
  assert.ok(graph.edges.length <= 48);
});
