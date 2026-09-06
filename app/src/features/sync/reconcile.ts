import type { WorkspaceDelta, WorkspaceSnapshot } from "@/contracts/workspace";
import type { CommitGate } from "@/store/commit-gate";
import type { RendererStore } from "@/store/types";
import { mergeWorkspaceChanges, type WorkspaceChange } from "./live-workspace";

type Dependencies = {
  store: RendererStore;
  gate: CommitGate;
  bootstrap: () => Promise<WorkspaceSnapshot>;
  readDelta: (noteIds: readonly string[]) => Promise<WorkspaceDelta>;
  onError: (error: unknown) => void;
};

export type SyncReconciler = {
  /** Queues a reconcile; concurrent reports coalesce into one rerun. */
  report(change: WorkspaceChange): void;
  /** Resolves once every queued reconcile has settled. */
  settled(): Promise<void>;
};

/**
 * Brings the renderer store up to date after the sync worker changed
 * canonical storage. Runs at most one reconcile at a time; reports arriving
 * meanwhile fold into a single rerun. A structural or full change re-reads
 * the snapshot; document-only changes read just the affected records. Both
 * paths hold the commit gate so a local commit cannot interleave with the
 * read and apply, and a local optimistic apply during the read triggers one
 * more pass so it is never overwritten by stale canonical state.
 */
export function createSyncReconciler(dependencies: Dependencies): SyncReconciler {
  const { store, gate, bootstrap, readDelta, onError } = dependencies;
  let pending: WorkspaceChange | null = null;
  let running: Promise<void> | null = null;

  async function reconcileOnce(change: WorkspaceChange): Promise<void> {
    await gate.holdForReconcile(async () => {
      const sequenceBefore = gate.commitSequence();
      if (change.full || change.structureChanged) {
        store.replaceFromSnapshot(await bootstrap());
      } else if (change.noteIds.length > 0) {
        store.applyRemoteDocuments(await readDelta(change.noteIds));
      }
      if (gate.commitSequence() !== sequenceBefore) {
        pending = mergeWorkspaceChanges(pending, change);
      }
    });
  }

  async function drain(): Promise<void> {
    while (pending) {
      const change = pending;
      pending = null;
      try {
        await reconcileOnce(change);
      } catch (error) {
        onError(error);
      }
    }
  }

  function start(): void {
    running = drain().finally(() => {
      running = null;
      if (pending) start();
    });
  }

  function report(change: WorkspaceChange): void {
    pending = mergeWorkspaceChanges(pending, change);
    if (!running) start();
  }

  return {
    report,
    settled: async () => {
      while (running) await running;
    },
  };
}
