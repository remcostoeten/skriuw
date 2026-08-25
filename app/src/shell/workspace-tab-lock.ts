/**
 * Cross-tab negotiation for the browser runtime's single-writer database.
 *
 * OPFS grants one exclusive sync access handle per file, so exactly one tab can
 * hold the workspace open at a time. Tabs settle that between themselves over a
 * broadcast channel: a waiting tab claims, the holder flushes and releases, and
 * the waiter reopens without the user reloading anything.
 *
 * The channel is injectable so the protocol can be tested without a DOM.
 */

const CHANNEL_NAME = "skriuw.workspace-tab-lock";
const CLAIM_TIMEOUT_MS = 3_000;

export type TabLockMessage = { kind: "claim" } | { kind: "released" };

export type TabLockChannel = {
  post: (message: TabLockMessage) => void;
  subscribe: (listener: (message: TabLockMessage) => void) => () => void;
};

function isTabLockMessage(value: unknown): value is TabLockMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "claim" || kind === "released";
}

/** Null when the browser has no `BroadcastChannel`; callers then skip handover. */
export function browserTabLockChannel(): TabLockChannel | null {
  if (typeof BroadcastChannel !== "function") {
    return null;
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  return {
    post: (message) => channel.postMessage(message),
    subscribe: (listener) => {
      const handler = (event: MessageEvent<unknown>) => {
        if (isTabLockMessage(event.data)) {
          listener(event.data);
        }
      };
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
  };
}

/**
 * Binds the tab that owns the workspace. A claim from another tab runs
 * `yieldWorkspace`, and only once it resolves does the release go out, so the
 * claimant never reopens the database before this tab has let go of it.
 */
export function holdWorkspaceTab(
  channel: TabLockChannel,
  yieldWorkspace: () => Promise<void>,
): () => void {
  let yielding = false;
  return channel.subscribe((message) => {
    if (message.kind !== "claim" || yielding) {
      return;
    }
    yielding = true;
    void yieldWorkspace()
      .then(() => channel.post({ kind: "released" }))
      .catch((error) => {
        yielding = false;
        console.error("workspace handover failed", error);
      });
  });
}

/** Binds a blocked tab to the moment the holder lets the workspace go. */
export function watchWorkspaceRelease(
  channel: TabLockChannel,
  onRelease: () => void,
): () => void {
  return channel.subscribe((message) => {
    if (message.kind === "released") {
      onRelease();
    }
  });
}

/**
 * Asks whichever tab holds the workspace to hand it over. Resolves on the
 * release, or on timeout so a holder that died without announcing still leaves
 * the claimant free to retry.
 */
export function claimWorkspaceTab(
  channel: TabLockChannel,
  timeoutMs = CLAIM_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
    const unsubscribe = channel.subscribe((message) => {
      if (message.kind === "released") {
        finish();
      }
    });
    const timer = setTimeout(finish, timeoutMs);
    channel.post({ kind: "claim" });
  });
}
