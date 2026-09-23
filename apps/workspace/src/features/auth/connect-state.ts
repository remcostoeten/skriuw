/**
 * The last failure of an attempt to start sync for the signed-in account.
 * Sign-in connects in the background, so its failure has no caller to report
 * to; surfaces read it here to explain a workspace that is signed in yet not
 * syncing, which is distinct from the user having paused sync.
 */

let failure: string | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

/**
 * Readable reason for a failed connect. The browser storage worker and the
 * desktop shell reject with plain `{ message }` objects rather than `Error`s,
 * which would otherwise render as "[object Object]".
 */
export function connectFailureText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(error);
}

export function reportConnectFailure(error: unknown): void {
  failure = connectFailureText(error);
  publish();
}

export function clearConnectFailure(): void {
  if (failure === null) return;
  failure = null;
  publish();
}

export function latestConnectFailure(): string | null {
  return failure;
}

export function subscribeConnectFailure(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Settings-row description for a sign-in whose sync never started. */
export function connectFailureDescription(reason: string): string {
  return `Sync could not start: ${reason}`;
}
