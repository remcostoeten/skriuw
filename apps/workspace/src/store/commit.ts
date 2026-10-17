import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  readWorkspaceDelta,
} from "@/platform/runtime/commands";
import { envelope } from "@skriuw/renderer-core/contracts/workspace";
import type {
  OperationAck,
  WorkspaceDelta,
  WorkspaceOperation,
  WorkspaceOperationEnvelope,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import { commitGate } from "@skriuw/renderer-core/store/commit-gate";
import type { CommitGate } from "@skriuw/renderer-core/store/commit-gate";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";

type CommitDependencies = {
  gate: CommitGate;
  apply: (operations: WorkspaceOperationEnvelope[]) => Promise<OperationAck>;
  bootstrap: () => Promise<WorkspaceSnapshot>;
  readDelta: (ids: readonly string[]) => Promise<WorkspaceDelta>;
  reportRejection: (action: string, error: unknown) => void;
};

export type Committer = {
  commitOperations: (store: RendererStore, operations: WorkspaceOperation[]) => Promise<void>;
  commitReferenceOperations: (
    store: RendererStore,
    operations: readonly ReferenceOperation[],
  ) => void;
};

/**
 * @name createCommitter
 * @description Builds the renderer's commit path over an injected gate and
 * backend: operations apply optimistically, commit through the gate, and on
 * rejection the store is refreshed from canonical storage before the error
 * surfaces.
 *
 * @example
 * const committer = createCommitter({
 *   gate: createCommitGate(),
 *   apply: applyWorkspaceOperations,
 *   bootstrap: bootstrapWorkspace,
 *   readDelta: readWorkspaceDelta,
 *   reportRejection: (action, error) => console.error(action, error),
 * });
 * await committer.commitOperations(store, operations);
 */
export function createCommitter(dependencies: CommitDependencies): Committer {
  const { gate, apply, bootstrap, readDelta, reportRejection } = dependencies;

  async function refreshAfterRejection(refresh: () => Promise<void>): Promise<void> {
    try {
      await gate.holdForReconcile(refresh);
    } catch (refreshError) {
      reportRejection("rejection refresh", refreshError);
    }
  }

  function commitReferenceOperations(
    store: RendererStore,
    operations: readonly ReferenceOperation[],
  ): void {
    if (!store.applyReferenceOperations(operations)) {
      return;
    }
    gate.noteLocalCommit();
    void gate
      .enterCommit(() => apply(operations.map((operation) => envelope(operation))))
      .catch(async (error) => {
        await refreshAfterRejection(async () => {
          store.replaceFromSnapshot(await bootstrap());
        });
        throw error;
      })
      .catch((error) => reportRejection("reference update", error));
  }

  async function commitOperations(
    store: RendererStore,
    operations: WorkspaceOperation[],
  ): Promise<void> {
    store.applyOperations(operations);
    gate.noteLocalCommit();
    try {
      const ack = await gate.enterCommit(() => apply(operations.map(envelope)));
      store.applyAck(ack);
    } catch (error) {
      await refreshAfterRejection(async () => {
        const savedNoteIds = saveOnlyNoteIds(operations);
        if (savedNoteIds && isRevisionConflict(error)) {
          store.applyRemoteDocuments(await readDelta(savedNoteIds));
        } else {
          store.replaceFromSnapshot(await bootstrap());
        }
      });
      throw error;
    }
  }

  return { commitOperations, commitReferenceOperations };
}

const committer = createCommitter({
  gate: commitGate,
  apply: applyWorkspaceOperations,
  bootstrap: bootstrapWorkspace,
  readDelta: readWorkspaceDelta,
  reportRejection: (action, error) => console.error(`${action} rejected`, error),
});

export function commitReferenceOperations(
  store: RendererStore,
  operations: readonly ReferenceOperation[],
): void {
  committer.commitReferenceOperations(store, operations);
}

/**
 * Applies operations optimistically, submits them to the backend, and
 * reconciles ranks and revisions from the acknowledgement. On rejection the
 * store is refreshed from canonical storage under the commit gate, reading
 * only the saved notes for a save-only revision conflict, and the original
 * error is rethrown so the renderer never drifts from durable state.
 */
export function commitOperations(
  store: RendererStore,
  operations: WorkspaceOperation[],
): Promise<void> {
  return committer.commitOperations(store, operations);
}

/**
 * Matches the backend's `StorageError::RevisionConflict` message, the only
 * form in which the conflict crosses the string-typed IPC error channel.
 */
export function isRevisionConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : error;
  return typeof message === "string" && message.includes("revision conflict");
}

function saveOnlyNoteIds(operations: readonly WorkspaceOperation[]): string[] | null {
  const noteIds: string[] = [];
  for (const operation of operations) {
    if (operation.type !== "save_document") return null;
    if (!noteIds.includes(operation.noteId)) noteIds.push(operation.noteId);
  }
  return noteIds.length > 0 ? noteIds : null;
}
