import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { createTaskWriter } from "@/features/tasks/writer";

const store = {} as RendererStore;

const operation: WorkspaceOperation = { type: "delete_task", id: "t1", document: null, at: 1 };

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("a write builds only after the previous write is acknowledged", async () => {
  const events: string[] = [];
  const first = deferred();
  const commits = [first.promise, Promise.resolve()];
  const writer = createTaskWriter(store, {
    flush: async () => {
      events.push("flush");
    },
    commit: () => {
      events.push("commit");
      return commits.shift() ?? Promise.resolve();
    },
  });

  const one = writer.write(
    () => {
      events.push("build 1");
      return { status: "ready", operations: [operation] };
    },
    { readsDocument: true },
  );
  const two = writer.write(
    () => {
      events.push("build 2");
      return { status: "ready", operations: [operation] };
    },
    { readsDocument: false },
  );

  assert.equal((await one).status, "applied");
  await Promise.resolve();
  assert.deepEqual(events, ["flush", "build 1", "commit"]);
  first.resolve();
  assert.equal((await two).status, "applied");
  assert.deepEqual(events, ["flush", "build 1", "commit", "build 2", "commit"]);
});

test("a failed flush refuses the write without building it", async () => {
  let built = false;
  const writer = createTaskWriter(store, {
    flush: () => Promise.reject(new Error("disk full")),
    commit: () => Promise.resolve(),
  });
  const original = console.error;
  console.error = () => undefined;
  const outcome = await writer.write(
    () => {
      built = true;
      return { status: "ready", operations: [operation] };
    },
    { readsDocument: true },
  );
  console.error = original;

  assert.equal(outcome.status, "refused");
  assert.equal(built, false);
});

test("a refusal and a rejected commit do not block the next write", async () => {
  const failing = deferred();
  const writer = createTaskWriter(store, {
    flush: () => Promise.resolve(),
    commit: () => failing.promise,
  });
  const refused = await writer.write(
    () => ({ status: "refused", reason: "unknown-task", message: "gone" }),
    { readsDocument: false },
  );
  assert.deepEqual(refused, { status: "refused", message: "gone" });

  const applied = await writer.write(() => ({ status: "ready", operations: [operation] }), {
    readsDocument: false,
  });
  assert.equal(applied.status, "applied");
  failing.reject(new Error("rejected"));
  if (applied.status === "applied") await assert.rejects(applied.committed);

  const next = await writer.write(() => ({ status: "ready", operations: [operation] }), {
    readsDocument: false,
  });
  assert.equal(next.status, "applied");
});
