import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowSnapshot } from "../../../../e2e/fixture";
import { planImportBundle } from "../../../../src/features/transfer/import/plan";
import {
  createInitialState,
  createRendererStore,
} from "../../../../src/store/store";

test("plans a 10,000-note provider import within bounded time", () => {
  const notes = Array.from({ length: 10_000 }, (_, index) => ({
    relativePath: `Batch/Note ${index}.md`,
    title: `Note ${index}`,
    markdown: `Body ${index}`,
  }));
  let nextId = 0;
  const startedAt = performance.now();
  const plan = planImportBundle(
    {
      sourceId: "scale",
      sourceLabel: "Scale",
      directories: [],
      notes,
      warnings: [],
    },
    1,
    () => `id-${++nextId}`,
    [],
    [],
    { sourceKey: "scale-source" },
  );
  const elapsed = performance.now() - startedAt;

  assert.equal(plan.noteCount, 10_000);
  assert.equal(plan.folderCount, 1);
  assert.equal(plan.operations.length + plan.contentOperations.length, 30_001);
  assert.ok(elapsed < 5_000, `10,000-note plan took ${Math.round(elapsed)} ms`);

  const store = createRendererStore(createInitialState(createWorkflowSnapshot()));
  const applyStartedAt = performance.now();
  store.applyOperations([...plan.operations, ...plan.contentOperations]);
  const applyElapsed = performance.now() - applyStartedAt;
  assert.equal(store.getState().noteIds.length, 10_004);
  assert.ok(
    applyElapsed < 5_000,
    `10,000-note optimistic commit took ${Math.round(applyElapsed)} ms`,
  );

  const navigationStartedAt = performance.now();
  store.setActiveNote("note-alpha");
  const navigationElapsed = performance.now() - navigationStartedAt;
  assert.equal(store.getState().activeNoteId, "note-alpha");
  assert.ok(
    navigationElapsed < 16.7,
    `post-import navigation took ${navigationElapsed.toFixed(2)} ms`,
  );
});
