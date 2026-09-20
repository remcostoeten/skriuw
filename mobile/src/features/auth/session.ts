import type { Keystore } from "./keystore";

/**
 * The account credential for this installation, held in the platform keystore
 * and cached for the life of the process.
 *
 * A keystore that refuses the write does not undo the sign-in: the in-memory
 * session keeps working and the caller is told it will not survive a restart,
 * which is the same bargain the desktop shell makes with a locked keyring.
 */

const SESSION_KEY = "skriuw.cloud-session";

export type StoredSession = {
  /** False when the credential lives only in this process. */
  persisted: boolean;
};

export type SessionStore = {
  /** The credential, reading the keystore once per process. */
  current: () => Promise<string | null>;
  remember: (token: string) => Promise<StoredSession>;
  forget: () => Promise<void>;
};

export type SessionStoreOptions = {
  /** Reported rather than thrown: a failed read is a signed-out device. */
  reportError?: (error: unknown) => void;
};

export function createSessionStore(
  keystore: Keystore,
  options: SessionStoreOptions = {},
): SessionStore {
  let cached: string | null = null;
  let loading: Promise<void> | null = null;
  /** A sign-in or sign-out has set the credential, so the stored value is stale. */
  let decided = false;

  function load(): Promise<void> {
    // `Promise.resolve().then` rather than calling through: a keystore that
    // throws synchronously must still land in the catch below, so a broken
    // platform module is a signed-out device and not a crashed screen.
    loading ??= Promise.resolve()
      .then(() => keystore.read(SESSION_KEY))
      .then((stored) => {
        if (decided) return;
        cached = stored;
      })
      .catch((error: unknown) => {
        options.reportError?.(error);
        if (decided) return;
        cached = null;
      });
    return loading;
  }

  return {
    async current() {
      await load();
      return cached;
    },

    async remember(token) {
      decided = true;
      cached = token;
      loading = Promise.resolve();
      try {
        await Promise.resolve().then(() => keystore.write(SESSION_KEY, token));
      } catch (error) {
        options.reportError?.(error);
        return { persisted: false };
      }
      return { persisted: true };
    },

    async forget() {
      decided = true;
      cached = null;
      loading = Promise.resolve();
      try {
        await Promise.resolve().then(() => keystore.delete(SESSION_KEY));
      } catch (error) {
        options.reportError?.(error);
      }
    },
  };
}
