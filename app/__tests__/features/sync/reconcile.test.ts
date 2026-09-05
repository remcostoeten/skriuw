import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceDelta, WorkspaceSnapshot } from "../../../src/contracts/workspace";
import { createSyncReconciler } from "../../../src/features/sync/reconcile";
import { createCommitGate } from "../../../src/store/commit-gate";
import type { RendererStore } from "../../../src/store/types";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function fakeStore(log: string[]): RendererStore {
  return {
    replaceFromSnapshot: () => {
      log.push("replace");
      return true;
    },
    applyRemoteDocuments: (delta: WorkspaceDelta) => {
      log.push(`apply:${delta.documents.map((document) => document.noteId).join(",")}`);
      return true;
    },
  } as unknown as RendererStore;
}

const emptySnapshot = {} as WorkspaceSnapshot;

function deltaFor(noteIds: readonly string[]): WorkspaceDelta {
  return {
    documents: noteIds.map((noteId) => ({
      noteId,
      documentJson: null,
      markdown: "",
      revision: 1,
      wordCount: 0,
    })),
    nodes: [],
  };
}

test("document-only changes read a delta; structural or full changes read the snapshot", async () => {
  const log: string[] = [];
  const reads: string[] = [];
  const reconciler = createSyncReconciler({
    store: fakeStore(log),
    gate: createCommitGate(),
    bootstrap: async () => {
      reads.push("bootstrap");
      return emptySnapshot;
    },
    readDelta: async (noteIds) => {
      reads.push(`delta:${noteIds.join(",")}`);
      return deltaFor(noteIds);
    },
    onError: (error) => assert.fail(String(error)),
  });
  reconciler.report({ noteIds: ["n1"], structureChanged: false, full: false });
  await reconciler.settled();
  reconciler.report({ noteIds: ["n2"], structureChanged: true, full: false });
  await reconciler.settled();
  reconciler.report({ noteIds: [], structureChanged: false, full: true });
  await reconciler.settled();
  assert.deepEqual(reads, ["delta:n1", "bootstrap", "bootstrap"]);
  assert.deepEqual(log, ["apply:n1", "replace", "replace"]);
});

test("reports arriving during a reconcile coalesce into exactly one rerun", async () => {
  const log: string[] = [];
  const reads: string[] = [];
  const firstRead = deferred<WorkspaceDelta>();
  let pendingRead: typeof firstRead | null = firstRead;
  const reconciler = createSyncReconciler({
    store: fakeStore(log),
    gate: createCommitGate(),
    bootstrap: async () => emptySnapshot,
    readDelta: async (noteIds) => {
      reads.push(`delta:${[...noteIds].sort().join(",")}`);
      if (pendingRead) {
        const wait = pendingRead;
        pendingRead = null;
        return wait.promise;
      }
      return deltaFor(noteIds);
    },
    onError: (error) => assert.fail(String(error)),
  });
  reconciler.report({ noteIds: ["a"], structureChanged: false, full: false });
  await Promise.resolve();
  reconciler.report({ noteIds: ["b"], structureChanged: false, full: false });
  reconciler.report({ noteIds: ["c"], structureChanged: false, full: false });
  firstRead.resolve(deltaFor(["a"]));
  await reconciler.settled();
  assert.deepEqual(reads, ["delta:a", "delta:b,c"]);
  assert.deepEqual(log, ["apply:a", "apply:b,c"]);
});

test("a local commit landing during the read schedules one more pass", async () => {
  const log: string[] = [];
  const gate = createCommitGate();
  let bootstraps = 0;
  const reconciler = createSyncReconciler({
    store: fakeStore(log),
    gate,
    bootstrap: async () => {
      bootstraps += 1;
      if (bootstraps === 1) gate.noteLocalCommit();
      return emptySnapshot;
    },
    readDelta: async (noteIds) => deltaFor(noteIds),
    onError: (error) => assert.fail(String(error)),
  });
  reconciler.report({ noteIds: [], structureChanged: true, full: false });
  await reconciler.settled();
  assert.equal(bootstraps, 2);
  assert.deepEqual(log, ["replace", "replace"]);
});

test("the reconcile holds the commit gate while it reads and applies", async () => {
  const log: string[] = [];
  const gate = createCommitGate();
  const read = deferred<WorkspaceSnapshot>();
  const reconciler = createSyncReconciler({
    store: fakeStore(log),
    gate,
    bootstrap: () => read.promise,
    readDelta: async (noteIds) => deltaFor(noteIds),
    onError: (error) => assert.fail(String(error)),
  });
  reconciler.report({ noteIds: [], structureChanged: false, full: true });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(gate.held(), true);
  const commit = gate.enterCommit(async () => {
    log.push("commit");
  });
  read.resolve(emptySnapshot);
  await reconciler.settled();
  await commit;
  assert.deepEqual(log, ["replace", "commit"]);
  assert.equal(gate.held(), false);
});

test("a failed read is reported and does not wedge later reconciles", async () => {
  const log: string[] = [];
  const errors: unknown[] = [];
  let fail = true;
  const reconciler = createSyncReconciler({
    store: fakeStore(log),
    gate: createCommitGate(),
    bootstrap: async () => emptySnapshot,
    readDelta: async (noteIds) => {
      if (fail) throw new Error("storage busy");
      return deltaFor(noteIds);
    },
    onError: (error) => errors.push(error),
  });
  reconciler.report({ noteIds: ["a"], structureChanged: false, full: false });
  await reconciler.settled();
  fail = false;
  reconciler.report({ noteIds: ["a"], structureChanged: false, full: false });
  await reconciler.settled();
  assert.equal(errors.length, 1);
  assert.deepEqual(log, ["apply:a"]);
});
