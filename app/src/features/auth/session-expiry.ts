import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as browserSync from "@/bridge/browser-sync";
import { isBrowserRuntime } from "@/bridge/runtime";

export const SYNC_SESSION_EXPIRED_EVENT = "sync-session-expired";

type Listen = (event: string, handler: () => void) => Promise<UnlistenFn>;
type Subscribe = (listener: () => void) => UnlistenFn;

/**
 * Fires when the sync coordinator learned that the cloud session is dead. The
 * shell has already cleared its own copy of the token and stopped syncing; the
 * renderer's job is to forget its credential and let the session hook refetch
 * so every account surface drops the user instead of offering a dead token.
 */
export function listenForSessionExpiry(
  onExpired: () => void,
  listenToEvent: Listen = listen,
  browserRuntime = isBrowserRuntime(),
  subscribeInBrowser: Subscribe = browserSync.subscribeBrowserSessionExpired,
): Promise<UnlistenFn> {
  if (browserRuntime) {
    return Promise.resolve(subscribeInBrowser(onExpired));
  }
  return listenToEvent(SYNC_SESSION_EXPIRED_EVENT, onExpired);
}
