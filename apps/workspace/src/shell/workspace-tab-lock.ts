/**
 * Cross-tab negotiation for the browser runtime's single-writer database.
 *
 * OPFS grants one exclusive sync access handle per file, so exactly one tab can
 * hold the workspace open at a time. Tabs settle that between themselves over a
 * broadcast channel: a waiting tab claims, the holder flushes and releases, and
 * the waiter reopens without the user reloading anything.
 *
 * A holder only answers a claim while it still runs. Mobile browsers freeze a
 * backgrounded page without warning, and a frozen holder can neither hear a
 * claim nor let the database go, which strands every other tab on the blocked
 * screen. So the hold also records that another tab is waiting, and the shell
 * hands the workspace over the moment this tab goes out of view rather than
 * risking the freeze.
 *
 * The channel is injectable so the protocol can be tested without a DOM.
 */

const CHANNEL_NAME = "skriuw.workspace-tab-lock";
const CLAIM_TIMEOUT_MS = 3_000;
/** How long a claim keeps counting as another tab waiting for the workspace. */
const CONTEST_WINDOW_MS = 300_000;

export type TabLockMessage = { kind: "claim" } | { kind: "released" };

export type TabLockChannel = {
  post: (message: TabLockMessage) => void;
  subscribe: (listener: (message: TabLockMessage) => void) => () => void;
};

/** The workspace hold this tab owns while its database is open. */
export type WorkspaceTabHold = {
  /** True while another tab has recently asked for the workspace. */
  contested: () => boolean;
  /** Hands the workspace over now; resolves once the release has gone out. */
  yieldNow: () => Promise<void>;
  /** Stops answering claims, without releasing anything. */
  dispose: () => void;
};

export type HoldOptions = {
  now?: () => number;
  contestWindowMs?: number;
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
      function handler(event: MessageEvent<unknown>) {
        if (isTabLockMessage(event.data)) {
          listener(event.data);
        }
      }
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
  options: HoldOptions = {},
): WorkspaceTabHold {
  const now = options.now ?? Date.now;
  const contestWindowMs = options.contestWindowMs ?? CONTEST_WINDOW_MS;
  let claimedAt: number | null = null;
  let handover: Promise<void> | null = null;
  let released = false;

  function handOver(): Promise<void> {
    if (!handover) {
      handover = yieldWorkspace()
        .then(() => {
          released = true;
          channel.post({ kind: "released" });
        })
        .catch((error) => {
          handover = null;
          console.error("workspace handover failed", error);
        });
    }
    return handover;
  }

  const unsubscribe = channel.subscribe((message) => {
    if (message.kind !== "claim") {
      return;
    }
    claimedAt = now();
    // A tab that let the workspace go before the claim answers it again;
    // otherwise the claimant waits out its timeout for a release that has
    // already been and gone.
    if (released) {
      channel.post({ kind: "released" });
      return;
    }
    void handOver();
  });

  return {
    contested: () => claimedAt !== null && now() - claimedAt <= contestWindowMs,
    yieldNow: handOver,
    dispose: unsubscribe,
  };
}

/** Binds a blocked tab to the moment the holder lets the workspace go. */
export function watchWorkspaceRelease(channel: TabLockChannel, onRelease: () => void): () => void {
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
