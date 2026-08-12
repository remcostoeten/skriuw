import assert from "node:assert/strict";
import test from "node:test";
import {
  beginImportProgress,
  registerImportProgressListener,
  throwIfImportCancelled,
} from "../../../../src/features/transfer/import/progress-controller";

test("import progress publishes stages and cancellation aborts before commit", () => {
  const seen: string[] = [];
  let cancel: (() => void) | null = null;
  const unregister = registerImportProgressListener((progress) => {
    seen.push(progress?.phase ?? "finished");
    cancel = progress?.cancel ?? null;
  });
  const task = beginImportProgress({
    phase: "reading",
    completed: 0,
    total: null,
    cancellable: true,
  });
  task.update({
    phase: "images",
    completed: 1,
    total: 2,
    cancellable: true,
  });
  assert.ok(cancel);
  cancel();
  assert.throws(
    () => throwIfImportCancelled(task.signal),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  task.finish();
  unregister();
  assert.deepEqual(seen, ["reading", "images", "finished"]);
});
