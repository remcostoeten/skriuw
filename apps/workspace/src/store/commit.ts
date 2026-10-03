import { applyWorkspaceOperations, bootstrapWorkspace } from "@/platform/runtime/commands";
import { envelope } from "@skriuw/renderer-core/contracts/workspace";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { commitGate } from "@skriuw/renderer-core/store/commit-gate";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";

export function commitReferenceOperations(
  store: RendererStore,
  operations: readonly ReferenceOperation[],
): void {
  if (!store.applyReferenceOperations(operations)) {
    return;
  }
  commitGate.noteLocalCommit();
  void commitGate
    .enterCommit(() => applyWorkspaceOperations(operations.map((operation) => envelope(operation))))
    .catch(async (error) => {
      store.replaceFromSnapshot(await bootstrapWorkspace());
      throw error;
    })
    .catch(reportRejection("reference update"));
}

/**
 * Applies operations optimistically, submits them to the backend, and
 * reconciles ranks and revisions from the acknowledgement. On rejection the
 * canonical snapshot is re-bootstrapped so the renderer never drifts from
 * durable state.
 */
export async function commitOperations(
  store: RendererStore,
  operations: WorkspaceOperation[],
): Promise<void> {
  store.applyOperations(operations);
  commitGate.noteLocalCommit();
  try {
    const ack = await commitGate.enterCommit(() =>
      applyWorkspaceOperations(operations.map(envelope)),
    );
    store.applyAck(ack);
  } catch (error) {
    const snapshot = await bootstrapWorkspace();
    store.replaceFromSnapshot(snapshot);
    throw error;
  }
}

/**
 * Matches the backend's `StorageError::RevisionConflict` message, the only
 * form in which the conflict crosses the string-typed IPC error channel.
 */
export function isRevisionConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : error;
  return typeof message === "string" && message.includes("revision conflict");
}

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}
