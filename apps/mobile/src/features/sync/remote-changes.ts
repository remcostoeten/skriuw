import type { WorkspaceDelta, WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import type { CommitGate } from "@skriuw/renderer-core/store/commit-gate";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { RemoteWorkspaceChange } from "../../bridge/native-adapter";

export type RemoteChangeReconcilerOptions = {
  store: RendererStore;
  gate: CommitGate;
  bootstrap: () => Promise<WorkspaceSnapshot>;
  readDelta: (noteIds: readonly string[]) => Promise<WorkspaceDelta>;
  onError: (error: unknown) => void;
};

export type RemoteChangeReconciler = {
  /** Queues a reconcile; reports arriving while one runs fold into a single rerun. */
  report: (change: RemoteWorkspaceChange) => void;
  /** Resolves once every queued reconcile has settled. */
  settled: () => Promise<void>;
  dispose: () => void;
};

function merge(
  left: RemoteWorkspaceChange | null,
  right: RemoteWorkspaceChange,
): RemoteWorkspaceChange {
  if (left === null) return right;
  return {
    noteIds: [...new Set([...left.noteIds, ...right.noteIds])],
    structureChanged: left.structureChanged || right.structureChanged,
    full: left.full || right.full,
  };
}

/**
 * Brings the store up to date after the native sync coordinator changed
 * canonical storage, with the rules of the desktop reconciler in
 * `apps/workspace/src/features/sync/reconcile.ts`: one reconcile at a time, a
 * structural or full change re-reads the snapshot, a document-only change
 * reads just those notes, and the commit gate is held so a local commit cannot
 * interleave. A local commit that lands during the read earns one more pass,
 * so stale canonical state never overwrites it. A failed read is reported and
 * kept, so the next report retries it; the resume catch-up guarantees one.
 */
export function createRemoteChangeReconciler(
  options: RemoteChangeReconcilerOptions,
): RemoteChangeReconciler {
  const { store, gate } = options;
  let pending: RemoteWorkspaceChange | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  async function reconcileOnce(change: RemoteWorkspaceChange): Promise<void> {
    await gate.holdForReconcile(async () => {
      if (disposed) return;
      const sequenceBefore = gate.commitSequence();
      if (change.full || change.structureChanged) {
        const snapshot = await options.bootstrap();
        if (disposed) return;
        store.replaceFromSnapshot(snapshot);
      } else if (change.noteIds.length > 0) {
        const delta = await options.readDelta(change.noteIds);
        if (disposed) return;
        store.applyRemoteDocuments(delta);
      }
      if (gate.commitSequence() !== sequenceBefore) {
        pending = merge(pending, change);
      }
    });
  }

  async function drain(): Promise<void> {
    while (pending !== null && !disposed) {
      const change = pending;
      pending = null;
      try {
        await reconcileOnce(change);
      } catch (error) {
        pending = merge(pending, change);
        options.onError(error);
        return;
      }
    }
  }

  return {
    report(change) {
      if (disposed) return;
      pending = merge(pending, change);
      running ??= drain().finally(() => {
        running = null;
      });
    },

    async settled() {
      await running;
    },

    dispose() {
      disposed = true;
      pending = null;
    },
  };
}
