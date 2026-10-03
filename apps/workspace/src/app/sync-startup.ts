import { listenForSyncedWorkspaceChanges } from "@/features/sync/live-workspace";
import { bindPropagationTriggers } from "@/features/sync/propagation-triggers";
import { createSyncReconciler } from "@/features/sync/reconcile";
import type { WorkspaceChange } from "@/features/sync/workspace-change";
import { bootstrapWorkspace, readWorkspaceDelta } from "@/platform/runtime/commands";
import { showToast } from "@/shared/ui/toast";
import { commitGate } from "@skriuw/renderer-core/store/commit-gate";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

type SyncStartup = {
  attach(store: RendererStore): void;
  stopListening(): void;
  dispose(): void;
};

/**
 * Subscribes to synced workspace changes before the workspace is read, so a
 * change that lands during bootstrap is not lost: it is remembered as a full
 * refresh and replayed once `attach` hands over the store. `attach` also
 * starts the propagation triggers that push local work.
 */
export async function listenForSyncChanges(): Promise<SyncStartup> {
  let reconciler: ReturnType<typeof createSyncReconciler> | null = null;
  let changeBeforeStore: WorkspaceChange | null = null;
  let unbindPropagationTriggers: (() => void) | null = null;
  const unlisten = await listenForSyncedWorkspaceChanges((change) => {
    if (!reconciler) {
      changeBeforeStore = { noteIds: [], structureChanged: true, full: true };
      return;
    }
    reconciler.report(change);
  });
  return {
    attach(store) {
      reconciler = createSyncReconciler({
        store,
        gate: commitGate,
        bootstrap: bootstrapWorkspace,
        readDelta: readWorkspaceDelta,
        onError: (error) => console.error("synced workspace reconciliation failed", error),
        onRecoveryNeeded: () =>
          showToast({
            message: "Synced changes could not refresh. Retry to update this view.",
            action: { label: "Retry refresh", run: () => reconciler?.retry() },
            durationMs: 60_000,
          }),
      });
      if (changeBeforeStore) {
        reconciler.report(changeBeforeStore);
        changeBeforeStore = null;
      }
      unbindPropagationTriggers = bindPropagationTriggers();
    },
    stopListening: unlisten,
    dispose() {
      reconciler?.dispose();
      unlisten();
      unbindPropagationTriggers?.();
    },
  };
}
