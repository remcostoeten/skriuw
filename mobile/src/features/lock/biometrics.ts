/**
 * Biometric unlock.
 *
 * What is stored is the workspace's own lock secret, wrapped by a keystore
 * entry the platform releases only after a successful biometric prompt — the
 * Android Keystore with `setUserAuthenticationRequired`, the iOS Keychain with
 * an access control of `biometryCurrentSet`, both reached through
 * `expo-secure-store`'s `requireAuthentication`. The content key that seals
 * note bodies is not involved: it is derived inside Rust from the secret and
 * never leaves `LockSession` (ADR-0044). Biometry buys one thing here — not
 * typing the PIN — and it buys it by holding the PIN somewhere a thief with
 * the filesystem still cannot read.
 *
 * Every platform failure resolves to a named outcome rather than an exception.
 * The one that matters is `unavailable`: turning biometrics off in the
 * operating system's own settings, or enrolling a new finger or face,
 * invalidates the keystore entry. That must read as "type your PIN", not as an
 * error, and the dead entry is dropped so the screen stops offering a button
 * that can no longer work.
 */

export type BiometryKind = "fingerprint" | "face" | "iris" | "unknown";

export type BiometryAvailability =
  | { available: true; kind: BiometryKind }
  /**
   * `unsupported`: no sensor, or a build without the platform module.
   * `notEnrolled`: a sensor with nothing registered, or registrations removed.
   * `lockedOut`: too many failed prompts; the platform relents on its own.
   */
  | { available: false; reason: "unsupported" | "notEnrolled" | "lockedOut" };

export type BiometricPort = {
  availability: () => Promise<BiometryAvailability>;
};

/**
 * The biometry-gated slot this feature keeps its wrapped secret in. One slot,
 * so the port has no key argument to get wrong.
 *
 * `armed` exists because neither platform can answer "is something stored"
 * without releasing it: a gated `getItemAsync` raises the prompt. A settings
 * screen that asks for a fingerprint just to draw a switch is a screen nobody
 * opens twice, so presence is tracked by an ungated marker written beside the
 * secret. The marker says only that the feature is on, which is already
 * visible on screen.
 */
export type BiometricKeystore = {
  armed: () => Promise<boolean>;
  /** Prompts. `null` when nothing is stored; rejects when the prompt fails. */
  read: (reason: string) => Promise<string | null>;
  write: (value: string) => Promise<void>;
  delete: () => Promise<void>;
};

export type SecureStoreOptions = {
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
  keychainService?: string;
};

/** The subset of `expo-secure-store` a biometry-gated slot needs. */
export type SecureStoreModule = {
  getItemAsync: (key: string, options?: SecureStoreOptions) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: SecureStoreOptions) => Promise<void>;
  deleteItemAsync: (key: string, options?: SecureStoreOptions) => Promise<void>;
};

export const BIOMETRIC_SECRET_KEY = "skriuw.note-lock-secret";

/** The ungated marker. Holds `"on"` or nothing; never the secret. */
export const BIOMETRIC_MARKER_KEY = "skriuw.note-lock-biometrics";

/** Keeps the gated entry out of the keychain group the session credential uses. */
export const BIOMETRIC_KEYCHAIN_SERVICE = "skriuw.note-lock";

export const BIOMETRICS_UNAVAILABLE_MESSAGE =
  "This build cannot reach the device keystore, so it will not hold your PIN behind biometrics.";

/**
 * Binds the slot to the platform keystore, with authentication required on
 * every access to the secret. The module is injected rather than imported so
 * this file carries no native dependency and the tests exercise the real code
 * path.
 */
export function createBiometricKeystore(secureStore: SecureStoreModule): BiometricKeystore {
  const service: SecureStoreOptions = { keychainService: BIOMETRIC_KEYCHAIN_SERVICE };
  const gated: SecureStoreOptions = { ...service, requireAuthentication: true };
  return {
    armed: async () => (await secureStore.getItemAsync(BIOMETRIC_MARKER_KEY, service)) === "on",
    read: (reason) =>
      secureStore.getItemAsync(BIOMETRIC_SECRET_KEY, { ...gated, authenticationPrompt: reason }),
    async write(value) {
      await secureStore.setItemAsync(BIOMETRIC_SECRET_KEY, value, gated);
      await secureStore.setItemAsync(BIOMETRIC_MARKER_KEY, "on", service);
    },
    async delete() {
      // Marker first: a delete interrupted halfway must leave the feature off
      // rather than pointing at a secret that is no longer there.
      await secureStore.deleteItemAsync(BIOMETRIC_MARKER_KEY, service);
      await secureStore.deleteItemAsync(BIOMETRIC_SECRET_KEY, gated);
    },
  };
}

/**
 * The slot a build without `expo-secure-store` gets. Enabling refuses rather
 * than degrading: a secret written anywhere a process can read without the
 * platform unlocking it would make biometric unlock weaker than the PIN it
 * replaces, which is the failure this port exists to make impossible.
 */
export function createUnavailableBiometricKeystore(): BiometricKeystore {
  return {
    armed: async () => false,
    read: async () => null,
    write: () => Promise.reject(new Error(BIOMETRICS_UNAVAILABLE_MESSAGE)),
    delete: async () => undefined,
  };
}

export function createUnavailableBiometrics(): BiometricPort {
  return { availability: async () => ({ available: false, reason: "unsupported" }) };
}

/** What the settings row and the unlock screen render. */
export type BiometricEnrollment =
  | { state: "unsupported" }
  | { state: "notEnrolled" }
  | { state: "lockedOut" }
  /** Usable, but this workspace's secret is not in the keystore. */
  | { state: "off"; kind: BiometryKind }
  | { state: "on"; kind: BiometryKind };

export type BiometricReveal =
  | { outcome: "secret"; secret: string }
  /** The person dismissed the platform prompt. Nothing to report. */
  | { outcome: "cancelled" }
  /** Biometry is gone or the entry was invalidated: fall back to the secret. */
  | { outcome: "unavailable" }
  | { outcome: "failed"; message: string };

export type BiometricUnlock = {
  /** Reconciles the platform with what is stored, dropping a dead entry. */
  describe: () => Promise<BiometricEnrollment>;
  /** Stores a secret that has already unlocked the session. */
  enable: (secret: string) => Promise<BiometricEnrollment>;
  disable: () => Promise<BiometricEnrollment>;
  /** Prompts, and hands back the secret for one `unlockNoteLock` call. */
  reveal: (reason: string) => Promise<BiometricReveal>;
};

/** The part of biometric unlock a secret change has to keep in step. */
export type BiometricRearm = Pick<BiometricUnlock, "describe" | "enable" | "disable">;

/**
 * Re-wraps the keystore entry after the workspace secret changed, or clears it
 * when the lock is gone.
 *
 * Forgetting this is not a cosmetic bug: the entry would still open, hand back
 * the old secret, and spend one of the three free attempts before the backoff
 * starts — so biometric unlock would lock the owner out of their own notes. A
 * re-wrap that cannot be written turns the feature off rather than leaving a
 * stale secret behind.
 */
export async function rearmBiometrics(
  biometrics: BiometricRearm,
  secret: string | null,
  reportError: (error: unknown) => void,
): Promise<void> {
  let enrollment: BiometricEnrollment;
  try {
    enrollment = await biometrics.describe();
  } catch (error) {
    reportError(error);
    return;
  }
  if (enrollment.state !== "on") {
    return;
  }
  if (secret === null) {
    await biometrics.disable().catch(reportError);
    return;
  }
  try {
    await biometrics.enable(secret);
  } catch (error) {
    reportError(error);
    await biometrics.disable().catch(reportError);
  }
}

export type BiometricUnlockOptions = {
  biometrics: BiometricPort;
  keystore: BiometricKeystore;
  reportError?: (error: unknown) => void;
};

/** How biometric unlock reads on a settings row, for one enrollment. */
export function describeBiometry(enrollment: BiometricEnrollment): string {
  switch (enrollment.state) {
    case "unsupported":
      return "This device has no biometric sensor Skriuw can use.";
    case "notEnrolled":
      return "Register a fingerprint or face in your device settings to use this.";
    case "lockedOut":
      return "Biometrics are locked after too many attempts. Use your PIN for now.";
    case "off":
      return `Unlock notes with ${biometryNoun(enrollment.kind)} instead of typing your PIN.`;
    case "on":
      return `Your PIN is held in this device's keystore, released by ${biometryNoun(enrollment.kind)}.`;
  }
}

export function biometryNoun(kind: BiometryKind): string {
  switch (kind) {
    case "face":
      return "face recognition";
    case "iris":
      return "an iris scan";
    case "fingerprint":
      return "your fingerprint";
    case "unknown":
      return "biometrics";
  }
}

/**
 * Classifies a rejected keystore read. Neither platform gives a stable error
 * code through `expo-secure-store`, so this matches on the message; anything
 * unrecognised is reported as a failure rather than silently treated as a
 * cancellation, because a swallowed failure looks like a broken button.
 */
export function classifyRevealError(
  error: unknown,
): Exclude<BiometricReveal, { outcome: "secret" }> {
  const message = error instanceof Error ? error.message : String(error);
  // Android reports `KEY_PERMANENTLY_INVALIDATED`, iOS `BiometryNotAvailable`,
  // and `expo-secure-store` passes either through as prose. Folding the
  // separators away lets one phrase match every spelling of the same cause.
  const normalized = message.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (
    normalized.includes("cancel") ||
    normalized.includes("dismiss") ||
    normalized.includes("user fallback")
  ) {
    return { outcome: "cancelled" };
  }
  if (
    normalized.includes("not enrolled") ||
    normalized.includes("no biometrics") ||
    normalized.includes("permanently invalidated") ||
    normalized.includes("authentication is not available") ||
    normalized.includes("biometry is not available") ||
    normalized.includes("biometry not available") ||
    normalized.includes("passcode not set")
  ) {
    return { outcome: "unavailable" };
  }
  return { outcome: "failed", message };
}

export function createBiometricUnlock(options: BiometricUnlockOptions): BiometricUnlock {
  const { biometrics, keystore } = options;

  function report(error: unknown): void {
    options.reportError?.(error);
  }

  /** A stored secret the platform can no longer release is not an offer. */
  async function forgetQuietly(): Promise<void> {
    try {
      await keystore.delete();
    } catch (error) {
      report(error);
    }
  }

  async function describe(): Promise<BiometricEnrollment> {
    let availability: BiometryAvailability;
    try {
      availability = await biometrics.availability();
    } catch (error) {
      report(error);
      availability = { available: false, reason: "unsupported" };
    }
    if (!availability.available) {
      if (availability.reason === "lockedOut") {
        // Temporary and the platform's own doing: the entry is still valid.
        return { state: "lockedOut" };
      }
      // Enrolment was removed in the operating system's settings, so the
      // keystore entry cannot open again. Dropping it here is what makes the
      // next unlock fall back to the PIN instead of offering a dead button.
      await forgetQuietly();
      return availability.reason === "notEnrolled"
        ? { state: "notEnrolled" }
        : { state: "unsupported" };
    }
    let armed = false;
    try {
      armed = await keystore.armed();
    } catch (error) {
      report(error);
    }
    return { state: armed ? "on" : "off", kind: availability.kind };
  }

  return {
    describe,

    async enable(secret) {
      await keystore.write(secret);
      return describe();
    },

    async disable() {
      await forgetQuietly();
      return describe();
    },

    async reveal(reason) {
      let secret: string | null;
      try {
        secret = await keystore.read(reason);
      } catch (error) {
        const outcome = classifyRevealError(error);
        if (outcome.outcome === "unavailable") {
          await forgetQuietly();
        }
        if (outcome.outcome === "failed") {
          report(error);
        }
        return outcome;
      }
      if (secret === null) {
        await forgetQuietly();
        return { outcome: "unavailable" };
      }
      return { outcome: "secret", secret };
    },
  };
}
