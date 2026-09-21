import assert from "node:assert/strict";
import test from "node:test";
import { createPerformanceSnapshot } from "../../performance/fixture";
import type { TreeProjection } from "../../performance/fixture";

function projection(noteCount = 100): TreeProjection {
  return {
    metadata: {
      name: `test-${noteCount}`,
      noteCount,
      folderCount: 0,
      nodeCount: noteCount,
    },
    operationsDigest: "fixture-digest",
    activeNoteId: "note-0",
    nodes: Array.from({ length: noteCount }, (_, index) => ({
      id: `note-${index}`,
      parentId: null,
      kind: "note" as const,
      title: `Note ${index}`,
    })),
  };
}

test("performance snapshot is deterministic and preserves fixture identity", () => {
  const first = createPerformanceSnapshot(projection(), 50);
  const second = createPerformanceSnapshot(projection(), 50);

  assert.deepEqual(first, second);
  assert.equal(first.snapshot.documents.length, 100);
  assert.equal(first.identity.operationsDigest, "fixture-digest");
  assert.equal(first.identity.blockCount, 50);
  assert.equal(first.identity.workingSetNoteIds.length, 100);
  const document = first.snapshot.documents[0]?.documentJson as { content: unknown[] };
  assert.equal(document.content.length, 50);
});

test("performance snapshot rejects projections without a complete switch pool", () => {
  const incomplete = projection(7);
  assert.throws(
    () => createPerformanceSnapshot(incomplete, 50),
    /requires eight notes/,
  );
});

test("performance snapshot rejects projections without one hundred working-set notes", () => {
  assert.throws(
    () => createPerformanceSnapshot(projection(99), 50),
    /requires one hundred notes/,
  );
});
