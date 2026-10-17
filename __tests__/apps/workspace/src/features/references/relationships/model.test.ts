import assert from "node:assert/strict";
import { test } from "vitest";
import {
  projectCoVisitedNotes,
  projectCoVisitedRows,
  projectHasRelationships,
  projectRelationshipGraph,
  projectSharedEntities,
  selectBacklinkRows,
  selectHasRelationships,
  selectJournalRows,
  selectOutgoingRows,
  selectRelationshipGraph,
  selectSharedPersonRows,
  selectSharedTagRows,
} from "@/features/references/relationships/model";
import {
  projectBacklinks,
  projectOutgoingNotes,
} from "@/features/references/references/panel-model";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { fixtureNode, referenceDocumentJson, referenceFixture } from "../fixtures";

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
  assert.deepEqual(
    projectCoVisitedNotes(renderer.getState(), "note-a").map((entry) => entry.noteId),
    ["note-b", "note-c"],
  );
});

test("local graph has stable direct relationship nodes and remains bounded", () => {
  const graph = projectRelationshipGraph(store().getState(), "note-b");
  assert.ok(graph.nodes.some((node) => node.id === "note-a"));
  assert.ok(graph.nodes.some((node) => node.id === "tag:tag-alpha"));
  assert.ok(graph.nodes.length <= 24);
  assert.ok(graph.edges.length <= 48);
  assert.equal(graph.hiddenCount, 0);
});

test("a note linked in both directions is one node and is never counted as hidden", () => {
  const fixture = referenceFixture();
  fixture.references.references.push({
    noteId: "note-a",
    targets: [{ kind: "note", targetId: "note-b" }],
  });
  const state = createRendererStore(
    createInitialState(fixture.snapshot, undefined, fixture.references),
  ).getState();

  const graph = projectRelationshipGraph(state, "note-a");
  assert.equal(graph.nodes.filter((node) => node.id === "note-b").length, 1);
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["note-a", "note-b", "note-c"],
  );
  assert.equal(graph.hiddenCount, 0);
});

test("relationships pointing at trashed notes are neither drawn nor counted as hidden", () => {
  const fixture = referenceFixture();
  fixture.references.references.push({
    noteId: "note-a",
    targets: [{ kind: "note", targetId: "note-trashed" }],
  });
  const state = createRendererStore(
    createInitialState(fixture.snapshot, undefined, fixture.references),
  ).getState();

  const graph = projectRelationshipGraph(state, "note-a");
  assert.ok(!graph.nodes.some((node) => node.id === "note-trashed"));
  assert.equal(graph.hiddenCount, 0);
});

const CACHED_SELECTORS = [
  selectHasRelationships,
  selectBacklinkRows,
  selectOutgoingRows,
  selectSharedPersonRows,
  selectSharedTagRows,
  selectJournalRows,
  selectRelationshipGraph,
] as const;

function uncachedCopy(state: RendererState): RendererState {
  return { ...state, metadata: new Map(state.metadata) };
}

test("cached relationship selectors match the uncached projections", () => {
  const state = store().getState();
  assert.equal(selectHasRelationships(state, "note-b"), projectHasRelationships(state, "note-b"));
  assert.deepEqual(
    selectRelationshipGraph(state, "note-b"),
    projectRelationshipGraph(state, "note-b"),
  );
  assert.deepEqual(
    selectBacklinkRows(state, "note-b"),
    projectBacklinks(state, "note-b").map(({ noteId, title }) => ({ noteId, title, detail: "" })),
  );
  assert.deepEqual(
    selectOutgoingRows(state, "note-b"),
    projectOutgoingNotes(state, "note-b").map(({ noteId, title }) => ({
      noteId,
      title,
      detail: "",
    })),
  );
  assert.deepEqual(selectSharedTagRows(state, "note-b"), [
    { noteId: "note-c", title: "Gamma note", detail: "#alpha" },
  ]);
  assert.deepEqual(selectSharedPersonRows(state, "note-b"), []);
  assert.deepEqual(selectJournalRows(state, "note-b"), []);
});

test("cached relationship selectors keep their reference across an unrelated update", () => {
  const renderer = store();
  const before = CACHED_SELECTORS.map((select) => select(renderer.getState(), "note-b"));
  renderer.setFocusedNode("note-c");
  const current = renderer.getState();
  CACHED_SELECTORS.forEach((select, index) => {
    assert.equal(select(current, "note-b"), before[index]);
    assert.deepEqual(select(uncachedCopy(current), "note-b"), before[index]);
  });
});

test("a co-visit invalidates the cached relationship answer", () => {
  const fixture = referenceFixture();
  fixture.snapshot.nodes.push(
    fixtureNode({ id: "note-d", kind: "note", rank: 500, title: "Delta note" }),
  );
  fixture.snapshot.documents.push({
    noteId: "note-d",
    documentJson: referenceDocumentJson([]),
    markdown: "",
    revision: 1,
    wordCount: 1,
  });
  const renderer = createRendererStore(
    createInitialState(fixture.snapshot, undefined, fixture.references),
  );
  assert.equal(selectHasRelationships(renderer.getState(), "note-d"), false);
  renderer.setActiveNote("note-d");
  assert.equal(selectHasRelationships(renderer.getState(), "note-d"), true);
  assert.deepEqual(
    projectCoVisitedRows(renderer.getState(), "note-d").map((row) => row.noteId),
    ["note-a"],
  );
});

test("a different note id is projected instead of served from the cache", () => {
  const state = store().getState();
  assert.deepEqual(selectBacklinkRows(state, "note-b"), []);
  assert.deepEqual(
    selectBacklinkRows(state, "note-a").map((row) => row.noteId),
    ["note-b", "note-c"],
  );
  assert.notDeepEqual(
    selectRelationshipGraph(state, "note-a"),
    selectRelationshipGraph(state, "note-b"),
  );
});
