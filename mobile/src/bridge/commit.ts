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
  /** Every rejected batch lands here after the rollback, so it stays visible. */
  reportFailure: (error: unknown) => void;
};

/**
 * The mobile twin of `commitOperations` in `app/src/store/actions/workspace.ts`:
 * the store changes synchronously, the batch is submitted to native SQLite,
 * and the acknowledgement reconciles ranks and revisions. A rejection rolls
 * reports, rolls the store back to the durable snapshot, and rethrows the
 * original error; a rollback that fails too is reported as its own failure.
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
    session.reportFailure(error);
    try {
      store.replaceFromSnapshot(await bridge.bootstrapWorkspace());
    } catch (rollbackError) {
      session.reportFailure(rollbackError);
    }
    throw error;
  }
}
