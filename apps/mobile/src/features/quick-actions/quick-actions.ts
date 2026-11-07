export type QuickActionType = "new-note" | "capture" | "search";

export const QUICK_ACTION_TYPES: readonly QuickActionType[] = ["new-note", "capture", "search"];

/** Matches `quick-action/<type>` in a link such as `skriuw://quick-action/new-note`. */
const QUICK_ACTION_LINK = /(?:^|\/)quick-action\/([a-z][a-z-]*)\/?(?:[?#]|$)/;

/**
 * @name parseQuickActionType
 * @description Narrows the type string a platform reports for a home-screen quick action to one
 * this build knows, so a shortcut left over from another version is ignored instead of acted on.
 *
 * @example
 * parseQuickActionType("new-note"); // "new-note"
 * parseQuickActionType("compose"); // null
 */
export function parseQuickActionType(value: string): QuickActionType | null {
  return QUICK_ACTION_TYPES.find((type) => type === value) ?? null;
}

/**
 * @name quickActionFromUrl
 * @description Reads the quick action an Android launcher shortcut carries as a link. Any other
 * link, including an unknown action, answers `null` and routes as usual.
 *
 * @example
 * quickActionFromUrl("skriuw://quick-action/capture"); // "capture"
 * quickActionFromUrl("skriuw:///journal"); // null
 */
export function quickActionFromUrl(url: string): QuickActionType | null {
  const match = QUICK_ACTION_LINK.exec(url);
  return match?.[1] === undefined ? null : parseQuickActionType(match[1]);
}

export type QuickActionInbox = {
  deliver: (type: QuickActionType) => void;
  take: () => QuickActionType | null;
  /** Returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
};

/**
 * @name createQuickActionInbox
 * @description Holds the latest quick action until the shell is mounted and takes it. A launch
 * delivers its action before the workspace has opened, and a second press before then replaces the
 * first rather than queueing both.
 *
 * @example
 * const inbox = createQuickActionInbox();
 * inbox.deliver("search");
 * inbox.take(); // "search"
 * inbox.take(); // null
 */
export function createQuickActionInbox(): QuickActionInbox {
  let pending: QuickActionType | null = null;
  const listeners = new Set<() => void>();

  return {
    deliver(type) {
      pending = type;
      for (const listener of listeners) listener();
    },

    take() {
      const type = pending;
      pending = null;
      return type;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const quickActionInbox = createQuickActionInbox();
