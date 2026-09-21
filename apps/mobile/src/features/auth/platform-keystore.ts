import type * as SecureStore from "expo-secure-store";
import {
  createKeystore,
  createUnavailableKeystore,
  KEYSTORE_UNAVAILABLE_MESSAGE,
  type Keystore,
} from "./keystore";

/**
 * The part of `expo-secure-store` a build needs to decide whether the platform
 * keystore is really there. `canUseBiometricAuthentication` is false on iOS
 * when the Face ID usage description is missing from the build.
 */
export type LoadedSecureStore = Pick<
  typeof SecureStore,
  | "getItemAsync"
  | "setItemAsync"
  | "deleteItemAsync"
  | "isAvailableAsync"
  | "canUseBiometricAuthentication"
>;

export type SecureStoreLoader = () => Promise<LoadedSecureStore | null>;

/**
 * Loads `expo-secure-store` at call time. Its entry calls
 * `requireNativeModule`, which throws at import in a client built without the
 * module; deferring the import turns that into a rejected promise the ports
 * below can answer with their refusing variants. Resolves `null` where the
 * module loaded but has no native side, which is the web preview.
 */
export async function loadSecureStore(): Promise<LoadedSecureStore | null> {
  const secureStore = await import("expo-secure-store");
  return (await secureStore.isAvailableAsync()) ? secureStore : null;
}

/**
 * Resolves the platform keystore once, on first use.
 *
 * @param reportError Receives the reason the keystore is unreachable, once.
 * The refusing keystore then keeps answering every call with
 * `KEYSTORE_UNAVAILABLE_MESSAGE`, so sign-in still reports that the credential
 * will not survive a restart.
 */
export function resolveSecureStore(
  load: SecureStoreLoader,
  reportError: (error: unknown) => void,
): () => Promise<LoadedSecureStore | null> {
  let resolved: Promise<LoadedSecureStore | null> | null = null;
  return () => {
    resolved ??= Promise.resolve()
      .then(load)
      .then((secureStore) => {
        if (secureStore === null) {
          reportError(new Error(KEYSTORE_UNAVAILABLE_MESSAGE));
        }
        return secureStore;
      })
      .catch((error: unknown) => {
        reportError(new Error(KEYSTORE_UNAVAILABLE_MESSAGE, { cause: error }));
        return null;
      });
    return resolved;
  };
}

/** The account credential's keystore on this device, or the refusing one. */
export function createPlatformKeystore(
  secureStore: () => Promise<LoadedSecureStore | null>,
): Keystore {
  let keystore: Promise<Keystore> | null = null;

  function resolve(): Promise<Keystore> {
    keystore ??= secureStore().then((module) =>
      module === null ? createUnavailableKeystore() : createKeystore(module),
    );
    return keystore;
  }

  return {
    read: async (key) => (await resolve()).read(key),
    write: async (key, value) => (await resolve()).write(key, value),
    delete: async (key) => (await resolve()).delete(key),
  };
}

let platform: (() => Promise<LoadedSecureStore | null>) | null = null;

/** This process's keystore, resolved once and shared by the credential and the biometric slot. */
export function platformSecureStore(): () => Promise<LoadedSecureStore | null> {
  platform ??= resolveSecureStore(loadSecureStore, (error) => {
    console.error("device keystore unavailable", error);
  });
  return platform;
}
