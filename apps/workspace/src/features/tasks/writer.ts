import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { noop } from "@skriuw/shared/helpers/noop";
import type { TaskWriteResult } from "./operations";

export type TaskWriteOutcome =
  | { status: "applied"; committed: Promise<void> }
  | { status: "refused"; message: string };

export type TaskWriteOptions = {
  readsDocument: boolean;
};

export type TaskWriter = {
  write: (build: () => TaskWriteResult, options: TaskWriteOptions) => Promise<TaskWriteOutcome>;
};

type WriterDependencies = {
  flush: () => Promise<void>;
  commit: (store: RendererStore, operations: WorkspaceOperation[]) => Promise<void>;
};

const UNSAVED_MESSAGE =
  "Changes to the source note are not saved yet, so this task was left alone.";

/**
 * @name createTaskWriter
 * @description Serializes task writes. Each write waits for the one before it
 * to be acknowledged, so a paired write always starts from the revision the
 * backend holds, and a write that reads a note flushes the editor's debounced
 * save first. The view draws the change before calling this; the outcome
 * resolves once the operations are applied to the store.
 *
 * @example
 * const writer = createTaskWriter(store, { flush: flushPendingWork, commit: commitOperations });
 * await writer.write(() => buildTaskToggle(store.getState(), id, Date.now()), { readsDocument: true });
 */
export function createTaskWriter(
  store: RendererStore,
  dependencies: WriterDependencies,
): TaskWriter {
  let tail: Promise<void> = Promise.resolve();

  async function perform(
    build: () => TaskWriteResult,
    options: TaskWriteOptions,
  ): Promise<TaskWriteOutcome> {
    if (options.readsDocument) {
      try {
        await dependencies.flush();
      } catch (error) {
        console.error("task write could not flush pending saves", error);
        return { status: "refused", message: UNSAVED_MESSAGE };
      }
    }
    const result = build();
    if (result.status === "refused") {
      return { status: "refused", message: result.message };
    }
    return { status: "applied", committed: dependencies.commit(store, result.operations) };
  }

  return {
    write(build, options) {
      const outcome = tail.then(() => perform(build, options));
      tail = outcome.then((result) =>
        result.status === "applied" ? result.committed.then(noop, noop) : undefined,
      );
      return outcome;
    },
  };
}
