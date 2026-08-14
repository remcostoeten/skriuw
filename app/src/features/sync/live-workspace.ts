import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { subscribeBrowserWorkspaceChanges } from "@/bridge/browser-sync";
import { isBrowserRuntime } from "@/bridge/runtime";

export const SYNC_WORKSPACE_CHANGED_EVENT = "sync-workspace-changed";

type Listen = (
  event: string,
  handler: (event: Event<void>) => void,
) => Promise<UnlistenFn>;
type Subscribe = (listener: () => void) => UnlistenFn;

/**
 * Reports durable remote workspace changes after the sync worker has applied
 * them. The renderer can then reconcile from canonical storage without
 * putting network or storage work on navigation.
 */
export function listenForSyncedWorkspaceChanges(
  reconcile: () => void,
  listenToEvent: Listen = listen,
  browserRuntime = isBrowserRuntime(),
  subscribeInBrowser: Subscribe = subscribeBrowserWorkspaceChanges,
): Promise<UnlistenFn> {
  if (browserRuntime) {
    return Promise.resolve(subscribeInBrowser(reconcile));
  }
  return listenToEvent(SYNC_WORKSPACE_CHANGED_EVENT, reconcile);
}
