/**
 * What the rest of the workspace does when the account changes. Authentication
 * knows when a session starts or ends but not what an account unlocks, so the
 * app binds these once at startup instead of authentication importing sync or
 * the shell.
 */
export type AccountLifecycle = {
  /** Settles edits in flight before a signed-out window leaves the account's workspace. */
  flushPendingWork: () => Promise<void>;
  /** A sign-in or sign-up succeeded and the session credential is stored. */
  signedIn: () => void;
  /** Sign-out is ending the session; runs before the credential is forgotten. */
  signedOut: () => void;
};

const unbound: AccountLifecycle = {
  flushPendingWork: () => Promise.resolve(),
  signedIn: () => undefined,
  signedOut: () => undefined,
};

let lifecycle: AccountLifecycle = unbound;

/**
 * @name bindAccountLifecycle
 * @description Connects authentication to the behaviour that follows a session
 * starting or ending. Returns a function that restores the unbound lifecycle.
 *
 * @example
 * bindAccountLifecycle({
 *   flushPendingWork,
 *   signedIn: startSyncAfterSignIn,
 *   signedOut: clearConnectFailure,
 * });
 */
export function bindAccountLifecycle(next: AccountLifecycle): () => void {
  lifecycle = next;
  return () => {
    if (lifecycle === next) lifecycle = unbound;
  };
}

export function accountLifecycle(): AccountLifecycle {
  return lifecycle;
}
