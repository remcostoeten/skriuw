import assert from "node:assert/strict";
import test from "node:test";
import { createCommitGate } from "../../src/store/commit-gate";

function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

test("a reconcile waits for in-flight commits and keeps new ones out until it is done", async () => {
  const gate = createCommitGate();
  const order: string[] = [];
  const firstCommit = deferred();
  const commitA = gate.enterCommit(async () => {
    order.push("commit-a:start");
    await firstCommit.promise;
    order.push("commit-a:end");
  });
  await flushMicrotasks();
  const reconcileBody = deferred();
  const reconcile = gate.holdForReconcile(async () => {
    order.push("reconcile:start");
    await reconcileBody.promise;
    order.push("reconcile:end");
  });
  await flushMicrotasks();
  assert.deepEqual(order, ["commit-a:start"]);
  const commitB = gate.enterCommit(async () => {
    order.push("commit-b");
  });
  firstCommit.resolve();
  await flushMicrotasks();
  assert.deepEqual(order, ["commit-a:start", "commit-a:end", "reconcile:start"]);
  assert.equal(gate.held(), true);
  reconcileBody.resolve();
  await Promise.all([commitA, reconcile, commitB]);
  assert.deepEqual(order, [
    "commit-a:start",
    "commit-a:end",
    "reconcile:start",
    "reconcile:end",
    "commit-b",
  ]);
  assert.equal(gate.held(), false);
});

test("commits woken by a release run before the next reconcile can hold again", async () => {
  const gate = createCommitGate();
  const order: string[] = [];
  const firstBody = deferred();
  const first = gate.holdForReconcile(async () => {
    await firstBody.promise;
    order.push("reconcile-1");
  });
  await flushMicrotasks();
  const commit = gate.enterCommit(async () => {
    order.push("commit");
  });
  await flushMicrotasks();
  const second = first.then(() =>
    gate.holdForReconcile(async () => {
      order.push("reconcile-2");
    }),
  );
  firstBody.resolve();
  await Promise.all([first, commit, second]);
  assert.deepEqual(order, ["reconcile-1", "commit", "reconcile-2"]);
});

test("optimistic applies are counted so a reconcile can detect local movement", async () => {
  const gate = createCommitGate();
  assert.equal(gate.commitSequence(), 0);
  gate.noteLocalCommit();
  gate.noteLocalCommit();
  assert.equal(gate.commitSequence(), 2);
  let observed = -1;
  await gate.holdForReconcile(async () => {
    gate.noteLocalCommit();
    observed = gate.commitSequence();
  });
  assert.equal(observed, 3);
});

test("a rejected commit or reconcile releases the gate", async () => {
  const gate = createCommitGate();
  await assert.rejects(
    gate.enterCommit(async () => {
      throw new Error("commit failed");
    }),
    /commit failed/,
  );
  await assert.rejects(
    gate.holdForReconcile(async () => {
      throw new Error("reconcile failed");
    }),
    /reconcile failed/,
  );
  assert.equal(gate.held(), false);
  assert.equal(await gate.enterCommit(async () => "ok"), "ok");
});
