const STORAGE_KEY = "skriuw.cloud-session.v1";

type StoredSession = {
  version: 1;
  token: string;
};

let memoryToken: string | undefined;

function storageArea(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseStoredSession(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const session = parsed as Partial<StoredSession> | null;
  if (
    session === null ||
    typeof session !== "object" ||
    session.version !== 1 ||
    typeof session.token !== "string" ||
    session.token.length === 0
  ) {
    return null;
  }
  return session.token;
}

/**
 * Durable browser session credential. localStorage is the source of truth so
 * a reload or a sign-out in another tab is honored; the in-memory value only
 * covers browsers that block storage access, where the session lasts for the
 * lifetime of the page. A malformed stored value is cleared and treated as
 * signed-out. The token value itself is never logged.
 */
export function loadBrowserSessionToken(): string | undefined {
  const storage = storageArea();
  if (!storage) return memoryToken;
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    memoryToken = undefined;
    return undefined;
  }
  const token = parseStoredSession(raw);
  if (token === null) {
    storage.removeItem(STORAGE_KEY);
    memoryToken = undefined;
    console.warn(
      "The stored Skriuw cloud session was unreadable and has been cleared; sign in again to resume sync.",
    );
    return undefined;
  }
  memoryToken = token;
  return token;
}

/** Returns whether the credential reached durable storage. */
export function storeBrowserSessionToken(token: string): boolean {
  memoryToken = token;
  const stored: StoredSession = { version: 1, token };
  const storage = storageArea();
  if (!storage) {
    console.error(
      "This browser blocks local storage; the Skriuw cloud session will not survive a reload.",
    );
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    console.error(
      "Storing the Skriuw cloud session failed; the session will not survive a reload.",
    );
    return false;
  }
  return true;
}

export function clearBrowserSessionToken(): void {
  memoryToken = undefined;
  const storage = storageArea();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    console.error("Clearing the stored Skriuw cloud session failed; it may reappear after a reload.");
  }
}
