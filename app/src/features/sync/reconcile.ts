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
  onRecoveryNeeded?: () => void;
  retryDelaysMs?: readonly number[];
};

export type SyncReconciler = {
  /** Queues a reconcile; concurrent reports coalesce into one rerun. */
  report(change: WorkspaceChange): void;
  /** Resolves once every queued reconcile has settled. */
  settled(): Promise<void>;
  retry(): void;
  dispose(): void;
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
export function createSyncReconciler(
  dependencies: Dependencies,
): SyncReconciler {
  const { store, gate, bootstrap, readDelta, onError } = dependencies;
  let pending: WorkspaceChange | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;
  let exhausted = false;
  let cancelDelay: (() => void) | null = null;
  const retryDelays = dependencies.retryDelaysMs ?? [250, 1000, 4000];

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cancelDelay = null;
        resolve();
      }, milliseconds);
      cancelDelay = () => {
        clearTimeout(timer);
        cancelDelay = null;
        resolve();
      };
    });
  }

  async function reconcileOnce(change: WorkspaceChange): Promise<void> {
    await gate.holdForReconcile(async () => {
      if (disposed) return;
      const sequenceBefore = gate.commitSequence();
      if (change.full || change.structureChanged) {
        const snapshot = await bootstrap();
        if (disposed) return;
        store.replaceFromSnapshot(snapshot);
      } else if (change.noteIds.length > 0) {
        const delta = await readDelta(change.noteIds);
        if (disposed) return;
        store.applyRemoteDocuments(delta);
      }
      if (gate.commitSequence() !== sequenceBefore) {
        pending = mergeWorkspaceChanges(pending, change);
      }
    });
  }

  async function drain(): Promise<void> {
    let failures = 0;
    while (pending && !disposed) {
      const change = pending;
      pending = null;
      try {
        await reconcileOnce(change);
        failures = 0;
      } catch (error) {
        if (disposed) return;
        pending = mergeWorkspaceChanges(pending, change);
        onError(error);
        const milliseconds = retryDelays[failures++];
        if (milliseconds === undefined) {
          exhausted = true;
          dependencies.onRecoveryNeeded?.();
          return;
        }
        await delay(milliseconds);
      }
    }
  }

  function start(): void {
    running = drain().finally(() => {
      running = null;
      if (pending && !exhausted && !disposed) start();
    });
  }

  function report(change: WorkspaceChange): void {
    if (disposed) return;
    exhausted = false;
    pending = mergeWorkspaceChanges(pending, change);
    if (!running) start();
  }

  return {
    report,
    retry: () => {
      if (disposed) return;
      exhausted = false;
      cancelDelay?.();
      if (pending && !running) start();
    },
    dispose: () => {
      disposed = true;
      pending = null;
      cancelDelay?.();
    },
    settled: async () => {
      while (running) await running;
    },
  };
}
