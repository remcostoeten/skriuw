import type { LoadedSecureStore } from "../auth/platform-keystore";
import {
  createBiometricKeystore,
  createBiometricUnlock,
  createUnavailableBiometricKeystore,
  type BiometricKeystore,
  type BiometricPort,
  type BiometricUnlock,
  type BiometryAvailability,
  type BiometryKind,
} from "./biometrics";

/** The part of `expo-local-authentication` that answers "can this device prompt". */
export type LocalAuthenticationModule = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<readonly number[]>;
};

export type LocalAuthenticationLoader = () => Promise<LocalAuthenticationModule>;

/** `LocalAuthentication.AuthenticationType`, restated so this file loads no native module. */
const AUTHENTICATION_KINDS: Readonly<Record<number, BiometryKind>> = {
  1: "fingerprint",
  2: "face",
  3: "iris",
};

/** Deferred for the same reason as `loadSecureStore`: the import throws without the native module. */
export function loadLocalAuthentication(): Promise<LocalAuthenticationModule> {
  return import("expo-local-authentication");
}

export type PlatformBiometricsOptions = {
  secureStore: () => Promise<LoadedSecureStore | null>;
  loadLocalAuthentication: LocalAuthenticationLoader;
  reportError: (error: unknown) => void;
};

/**
 * Biometric unlock bound to the platform: the prompt comes from the keystore
 * entry itself (`requireAuthentication`), and `expo-local-authentication` only
 * answers whether a prompt could succeed. Without the keystore the slot is the
 * refusing one and availability reads `unsupported`, so the settings row says
 * so instead of offering a switch that cannot hold the PIN.
 */
export function createPlatformBiometricUnlock(options: PlatformBiometricsOptions): BiometricUnlock {
  let keystore: Promise<BiometricKeystore> | null = null;

  function resolveKeystore(): Promise<BiometricKeystore> {
    keystore ??= options
      .secureStore()
      .then((module) =>
        module === null ? createUnavailableBiometricKeystore() : createBiometricKeystore(module),
      );
    return keystore;
  }

  const slot: BiometricKeystore = {
    armed: async () => (await resolveKeystore()).armed(),
    read: async (reason) => (await resolveKeystore()).read(reason),
    write: async (value) => (await resolveKeystore()).write(value),
    delete: async () => (await resolveKeystore()).delete(),
  };

  const port: BiometricPort = {
    async availability(): Promise<BiometryAvailability> {
      const secureStore = await options.secureStore();
      if (secureStore === null || !secureStore.canUseBiometricAuthentication()) {
        return { available: false, reason: "unsupported" };
      }
      let localAuthentication: LocalAuthenticationModule;
      try {
        localAuthentication = await options.loadLocalAuthentication();
      } catch (error) {
        options.reportError(error);
        return { available: false, reason: "unsupported" };
      }
      if (!(await localAuthentication.hasHardwareAsync())) {
        return { available: false, reason: "unsupported" };
      }
      if (!(await localAuthentication.isEnrolledAsync())) {
        return { available: false, reason: "notEnrolled" };
      }
      const kinds = await localAuthentication.supportedAuthenticationTypesAsync();
      return { available: true, kind: biometryKind(kinds) };
    },
  };

  return createBiometricUnlock({ biometrics: port, keystore: slot, reportError: options.reportError });
}

/** A device with more than one modality gets the generic noun: the platform picks which one prompts. */
function biometryKind(types: readonly number[]): BiometryKind {
  if (types.length !== 1) {
    return "unknown";
  }
  return AUTHENTICATION_KINDS[types[0] ?? 0] ?? "unknown";
}
