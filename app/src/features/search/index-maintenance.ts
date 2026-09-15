import { rebuildSearchIndex, searchIndexStatus } from "@/bridge/commands";
import type { SearchIndexStatus } from "@/contracts/workspace";

/**
 * How long the reconciliation waits for an idle frame before running anyway.
 * The full-text index is a rebuildable projection, so it never blocks
 * navigation: the check runs after the first paint, and a rebuild it triggers
 * is serialized behind the storage worker like any other durable write.
 */
const IDLE_TIMEOUT_MS = 4_000;

export type SearchIndexPorts = {
  readStatus: () => Promise<SearchIndexStatus>;
  rebuild: () => Promise<SearchIndexStatus>;
};

export type SearchIndexReconciliation = {
  rebuilt: boolean;
  status: SearchIndexStatus;
};

const bridgePorts: SearchIndexPorts = {
  readStatus: searchIndexStatus,
  rebuild: rebuildSearchIndex,
};

/**
 * Rebuilds the full-text index when the stored projection drifted from what
 * this build produces — an older text projection, or rows lost with a partial
 * write. A current index costs one status read.
 */
export async function reconcileSearchIndex(
  ports: SearchIndexPorts = bridgePorts,
): Promise<SearchIndexReconciliation> {
  const status = await ports.readStatus();
  if (!status.needsRebuild) {
    return { rebuilt: false, status };
  }
  return { rebuilt: true, status: await ports.rebuild() };
}

/**
 * Runs [`reconcileSearchIndex`] once the renderer goes idle. Returns a cancel
 * function; a reconciliation already in flight is left to finish, because
 * abandoning a rebuild would leave the index half-written.
 */
export function scheduleSearchIndexReconciliation(ports: SearchIndexPorts = bridgePorts): () => void {
  let cancelled = false;
  const run = () => {
    if (cancelled) {
      return;
    }
    reconcileSearchIndex(ports).catch((error) => {
      console.error("search index reconciliation failed", error);
    });
  };
  if (typeof requestIdleCallback !== "function") {
    const timer = window.setTimeout(run, IDLE_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }
  const handle = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  return () => {
    cancelled = true;
    cancelIdleCallback(handle);
  };
}
