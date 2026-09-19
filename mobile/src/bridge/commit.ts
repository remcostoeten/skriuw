import type { BridgePort } from "../../../shared/renderer-core/src/bridge/port";
import {
  envelope,
  type WorkspaceOperation,
} from "../../../shared/renderer-core/src/contracts/workspace";
import { commitGate } from "../../../shared/renderer-core/src/store/commit-gate";
import type { RendererStore } from "../../../shared/renderer-core/src/store/types";

export type WorkspaceSession = {
  store: RendererStore;
  bridge: BridgePort;
  /** Every rejected batch lands here before the rollback, so it stays visible. */
  reportFailure: (error: unknown) => void;
};

/**
 * The mobile twin of `commitOperations` in `app/src/store/actions/workspace.ts`:
 * the store changes synchronously, the batch is submitted to native SQLite,
 * and the acknowledgement reconciles ranks and revisions. A rejection
 * reports, rolls the store back to the durable snapshot, and rethrows the
 * original error; a rollback that fails too is reported as its own failure,
 * and a reporter that throws can neither skip the rollback nor mask the error.
 */
export async function commitOperations(
  session: WorkspaceSession,
  operations: WorkspaceOperation[],
): Promise<void> {
  const { store, bridge } = session;
  store.applyOperations(operations);
  commitGate.noteLocalCommit();
  try {
    const ack = await commitGate.enterCommit(() =>
      bridge.applyWorkspaceOperations(operations.map(envelope)),
    );
    store.applyAck(ack);
  } catch (error) {
    reportSafely(session, error);
    try {
      store.replaceFromSnapshot(await bridge.bootstrapWorkspace());
    } catch (rollbackError) {
      reportSafely(session, rollbackError);
    }
    throw error;
  }
}

function reportSafely(session: WorkspaceSession, error: unknown): void {
  try {
    session.reportFailure(error);
  } catch (reporterError) {
    console.error("workspace failure reporter threw", reporterError, error);
  }
}
