/**
 * The narrow port every credential and key on this device travels through.
 *
 * Nothing secret is written to JavaScript-reachable storage: not AsyncStorage,
 * not MMKV, not a file the app can read without the platform unlocking it. The
 * only implementation that ships is the platform keystore — the Android
 * Keystore and the iOS Keychain, both reached through `expo-secure-store`.
 *
 * A build without that module refuses rather than degrading. Falling back to
 * plain storage would keep sign-in working while silently moving a bearer
 * credential somewhere any other process with filesystem access can read it,
 * which is the failure this port exists to make impossible.
 */

export type Keystore = {
  /** `null` when the key was never written or the platform lost it. */
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

/** The subset of `expo-secure-store` this port needs. */
export type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export const KEYSTORE_UNAVAILABLE_MESSAGE =
  "This build cannot reach the device keystore, so it will not hold your account credential. Install expo-secure-store and rebuild.";

const KEY_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Binds the port to the platform keystore.
 *
 * @param secureStore The `expo-secure-store` module. It is injected rather
 * than imported so this file carries no native dependency of its own and the
 * tests exercise the real code path.
 */
export function createKeystore(secureStore: SecureStoreModule): Keystore {
  return {
    read: (key) => secureStore.getItemAsync(assertKey(key)),
    write: (key, value) => secureStore.setItemAsync(assertKey(key), value),
    delete: (key) => secureStore.deleteItemAsync(assertKey(key)),
  };
}

/**
 * The keystore a build without `expo-secure-store` gets. Every call refuses
 * with the same actionable message, so the failure surfaces at sign-in rather
 * than as a credential that silently never persists.
 */
export function createUnavailableKeystore(): Keystore {
  // Rejecting rather than throwing: every caller handles a rejected read as a
  // signed-out device, and a synchronous throw from a port that promises a
  // promise escapes those handlers and takes the screen down with it.
  function refuse(): Promise<never> {
    return Promise.reject(new Error(KEYSTORE_UNAVAILABLE_MESSAGE));
  }
  return { read: refuse, write: refuse, delete: refuse };
}

function assertKey(key: string): string {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(`${key} is not a usable keystore key.`);
  }
  return key;
}
