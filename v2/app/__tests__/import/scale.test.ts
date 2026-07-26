import assert from "node:assert/strict";
import test from "node:test";
import { planImportBundle } from "../../src/import/plan";

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
  );
  const elapsed = performance.now() - startedAt;

  assert.equal(plan.noteCount, 10_000);
  assert.equal(plan.folderCount, 1);
  assert.equal(plan.operations.length + plan.contentOperations.length, 20_001);
  assert.ok(elapsed < 5_000, `10,000-note plan took ${Math.round(elapsed)} ms`);
});
