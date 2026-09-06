import assert from "node:assert/strict";
import test from "node:test";
import { saveWithConflictRetry } from "../../../src/features/editor/save-retry";

function conflict(): Error {
  return new Error("revision conflict for a: expected 1, current 2");
}

function isConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes("revision conflict");
}

test("a revision conflict merges against the fresh record and retries", async () => {
  const log: string[] = [];
  let attempts = 0;
  await saveWithConflictRetry({
    attempt: async () => {
      attempts += 1;
      log.push(`attempt:${attempts}`);
      if (attempts === 1) throw conflict();
    },
    adoptFresh: () => {
      log.push("adopt");
      return true;
    },
    isConflict,
    retries: 3,
  });
  assert.deepEqual(log, ["attempt:1", "adopt", "attempt:2"]);
});

test("the sequencer sees the failure after the retry budget is spent", async () => {
  let attempts = 0;
  let adoptions = 0;
  await assert.rejects(
    saveWithConflictRetry({
      attempt: async () => {
        attempts += 1;
        throw conflict();
      },
      adoptFresh: () => {
        adoptions += 1;
        return true;
      },
      isConflict,
      retries: 3,
    }),
    /revision conflict/,
  );
  assert.equal(attempts, 4);
  assert.equal(adoptions, 3);
});

test("a conflict without a fresher record is final, and other errors never retry", async () => {
  let attempts = 0;
  await assert.rejects(
    saveWithConflictRetry({
      attempt: async () => {
        attempts += 1;
        throw conflict();
      },
      adoptFresh: () => false,
      isConflict,
      retries: 3,
    }),
    /revision conflict/,
  );
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(
    saveWithConflictRetry({
      attempt: async () => {
        attempts += 1;
        throw new Error("disk full");
      },
      adoptFresh: () => assert.fail("must not adopt for a non-conflict"),
      isConflict,
      retries: 3,
    }),
    /disk full/,
  );
  assert.equal(attempts, 1);
});
