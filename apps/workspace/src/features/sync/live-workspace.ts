import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { subscribeBrowserWorkspaceChanges } from "@/platform/browser/sync-events";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import type { WorkspaceChange } from "./workspace-change";

export const SYNC_WORKSPACE_CHANGED_EVENT = "sync-workspace-changed";

type Listen = (
  event: string,
  handler: (event: Event<WorkspaceChange>) => void,
) => Promise<UnlistenFn>;
type Subscribe = (listener: (change: WorkspaceChange) => void) => UnlistenFn;

function normalizeChange(payload: unknown): WorkspaceChange {
  if (typeof payload !== "object" || payload === null) {
    return { noteIds: [], structureChanged: true, full: true };
  }
  const change = payload as Partial<WorkspaceChange>;
  return {
    noteIds: Array.isArray(change.noteIds)
      ? change.noteIds.filter((id): id is string => typeof id === "string")
      : [],
    structureChanged: change.structureChanged === true,
    full: change.full === true,
  };
}

/**
 * Reports durable remote workspace changes after the sync worker has applied
 * them. The renderer can then reconcile from canonical storage without
 * putting network or storage work on navigation.
 */
export function listenForSyncedWorkspaceChanges(
  reconcile: (change: WorkspaceChange) => void,
  listenToEvent: Listen = listen,
  browserRuntime = isBrowserRuntime(),
  subscribeInBrowser: Subscribe = subscribeBrowserWorkspaceChanges,
): Promise<UnlistenFn> {
  if (browserRuntime) {
    return Promise.resolve(subscribeInBrowser((change) => reconcile(normalizeChange(change))));
  }
  return listenToEvent(SYNC_WORKSPACE_CHANGED_EVENT, (event) =>
    reconcile(normalizeChange(event.payload)),
  );
}
