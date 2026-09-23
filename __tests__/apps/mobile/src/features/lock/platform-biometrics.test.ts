import assert from "node:assert/strict";
import { test } from "vitest";
import type { LoadedSecureStore } from "@/features/auth/platform-keystore";
import {
  BIOMETRIC_KEYCHAIN_SERVICE,
  BIOMETRIC_MARKER_KEY,
  BIOMETRIC_SECRET_KEY,
  BIOMETRICS_UNAVAILABLE_MESSAGE,
  type SecureStoreOptions,
} from "@/features/lock/biometrics";
import {
  createPlatformBiometricUnlock,
  type LocalAuthenticationModule,
} from "@/features/lock/platform-biometrics";

type Call = { key: string; options: SecureStoreOptions | undefined };

function deviceKeystore(options: { biometric?: boolean; failRead?: string } = {}) {
  const entries = new Map<string, string>();
  const reads: Call[] = [];
  const writes: Call[] = [];
  const module: LoadedSecureStore = {
    isAvailableAsync: async () => true,
    canUseBiometricAuthentication: () => options.biometric ?? true,
    getItemAsync: async (key, readOptions) => {
      reads.push({ key, options: readOptions });
      if (readOptions?.requireAuthentication && options.failRead) {
        throw new Error(options.failRead);
      }
      return entries.get(key) ?? null;
    },
    setItemAsync: async (key, value, writeOptions) => {
      writes.push({ key, options: writeOptions });
      entries.set(key, value);
    },
    deleteItemAsync: async (key) => {
      entries.delete(key);
    },
  };
  return { module, entries, reads, writes };
}

function sensor(overrides: Partial<LocalAuthenticationModule> = {}): LocalAuthenticationModule {
  return {
    hasHardwareAsync: async () => true,
    isEnrolledAsync: async () => true,
    supportedAuthenticationTypesAsync: async () => [1],
    ...overrides,
  };
}

function unexpected(error: unknown): never {
  assert.fail(`unexpected report: ${String(error)}`);
}

test("enabling stores the PIN behind a prompt, and unlocking releases it", async () => {
  const device = deviceKeystore();
  const unlock = createPlatformBiometricUnlock({
    secureStore: async () => device.module,
    loadLocalAuthentication: async () => sensor(),
    reportError: unexpected,
  });

  assert.deepEqual(await unlock.describe(), { state: "off", kind: "fingerprint" });
  assert.deepEqual(await unlock.enable("4829"), { state: "on", kind: "fingerprint" });
  assert.deepEqual(device.writes.find((call) => call.key === BIOMETRIC_SECRET_KEY)?.options, {
    keychainService: BIOMETRIC_KEYCHAIN_SERVICE,
    requireAuthentication: true,
  });
  assert.equal(device.entries.get(BIOMETRIC_MARKER_KEY), "on");

  assert.deepEqual(await unlock.reveal("Unlock your notes"), { outcome: "secret", secret: "4829" });
  const gated = device.reads.find((call) => call.key === BIOMETRIC_SECRET_KEY);
  assert.equal(gated?.options?.requireAuthentication, true);
  assert.equal(gated?.options?.authenticationPrompt, "Unlock your notes");
});

test("a failed prompt falls back to the PIN and a cancelled one leaves biometrics on", async () => {
  const cancelled = deviceKeystore({ failRead: "User canceled the authentication" });
  cancelled.entries.set(BIOMETRIC_SECRET_KEY, "4829");
  cancelled.entries.set(BIOMETRIC_MARKER_KEY, "on");
  const afterCancel = createPlatformBiometricUnlock({
    secureStore: async () => cancelled.module,
    loadLocalAuthentication: async () => sensor(),
    reportError: unexpected,
  });
  assert.deepEqual(await afterCancel.reveal("Unlock"), { outcome: "cancelled" });
  assert.equal((await afterCancel.describe()).state, "on");

  const invalidated = deviceKeystore({ failRead: "KEY_PERMANENTLY_INVALIDATED" });
  invalidated.entries.set(BIOMETRIC_SECRET_KEY, "4829");
  invalidated.entries.set(BIOMETRIC_MARKER_KEY, "on");
  const afterFailure = createPlatformBiometricUnlock({
    secureStore: async () => invalidated.module,
    loadLocalAuthentication: async () => sensor(),
    reportError: unexpected,
  });
  assert.deepEqual(await afterFailure.reveal("Unlock"), { outcome: "unavailable" });
  assert.equal(invalidated.entries.size, 0, "the dead entry and its marker are both dropped");
  assert.equal((await afterFailure.describe()).state, "off");
});

test("the sensor's own answers become the settings row's states", async () => {
  const device = deviceKeystore();
  async function describe(overrides: Partial<LocalAuthenticationModule>) {
    return createPlatformBiometricUnlock({
      secureStore: async () => device.module,
      loadLocalAuthentication: async () => sensor(overrides),
      reportError: unexpected,
    }).describe();
  }

  assert.deepEqual(await describe({ hasHardwareAsync: async () => false }), {
    state: "unsupported",
  });
  assert.deepEqual(await describe({ isEnrolledAsync: async () => false }), {
    state: "notEnrolled",
  });
  assert.deepEqual(await describe({ supportedAuthenticationTypesAsync: async () => [2] }), {
    state: "off",
    kind: "face",
  });
  assert.deepEqual(await describe({ supportedAuthenticationTypesAsync: async () => [1, 2] }), {
    state: "off",
    kind: "unknown",
  });
});

test("a build that cannot hold the PIN behind biometry says so instead of offering the switch", async () => {
  const withoutFaceIdDescription = deviceKeystore({ biometric: false });
  const unsupported = createPlatformBiometricUnlock({
    secureStore: async () => withoutFaceIdDescription.module,
    loadLocalAuthentication: async () => sensor(),
    reportError: unexpected,
  });
  assert.deepEqual(await unsupported.describe(), { state: "unsupported" });

  const reported: unknown[] = [];
  const withoutKeystore = createPlatformBiometricUnlock({
    secureStore: async () => null,
    loadLocalAuthentication: async () => sensor(),
    reportError: (error) => reported.push(error),
  });
  assert.deepEqual(await withoutKeystore.describe(), { state: "unsupported" });
  await assert.rejects(withoutKeystore.enable("4829"), { message: BIOMETRICS_UNAVAILABLE_MESSAGE });

  const withoutSensorModule = createPlatformBiometricUnlock({
    secureStore: async () => deviceKeystore().module,
    loadLocalAuthentication: () => Promise.reject(new Error("Cannot find native module")),
    reportError: (error) => reported.push(error),
  });
  assert.deepEqual(await withoutSensorModule.describe(), { state: "unsupported" });
  assert.equal(reported.length, 1);
});
