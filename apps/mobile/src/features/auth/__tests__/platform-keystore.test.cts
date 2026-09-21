import assert from "node:assert/strict";
import test from "node:test";
import { KEYSTORE_UNAVAILABLE_MESSAGE } from "../keystore";
import {
  createPlatformKeystore,
  resolveSecureStore,
  type LoadedSecureStore,
} from "../platform-keystore";
import { createSessionStore } from "../session";

function installedSecureStore(): LoadedSecureStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    isAvailableAsync: async () => true,
    canUseBiometricAuthentication: () => true,
    getItemAsync: async (key) => entries.get(key) ?? null,
    setItemAsync: async (key, value) => {
      entries.set(key, value);
    },
    deleteItemAsync: async (key) => {
      entries.delete(key);
    },
  };
}

function unexpected(error: unknown): never {
  assert.fail(`unexpected report: ${String(error)}`);
}

test("a build with the keystore keeps the credential across a restart", async () => {
  const secureStore = installedSecureStore();
  const load = async () => secureStore;

  const first = createSessionStore(createPlatformKeystore(resolveSecureStore(load, unexpected)));
  assert.deepEqual(await first.remember("bearer-1"), { persisted: true });

  const restarted = createSessionStore(createPlatformKeystore(resolveSecureStore(load, unexpected)));
  assert.equal(await restarted.current(), "bearer-1");
});

test("the platform module is loaded once per process, however many ports share it", async () => {
  let loads = 0;
  const secureStore = resolveSecureStore(async () => {
    loads += 1;
    return installedSecureStore();
  }, unexpected);
  const keystore = createPlatformKeystore(secureStore);

  await Promise.all([keystore.read("a"), keystore.write("b", "1"), secureStore()]);
  assert.equal(loads, 1);
});

test("a build without the native module refuses visibly instead of losing the credential", async () => {
  const reported: unknown[] = [];
  const keystore = createPlatformKeystore(
    resolveSecureStore(
      () => Promise.reject(new Error("Cannot find native module 'ExpoSecureStore'")),
      (error) => reported.push(error),
    ),
  );

  await assert.rejects(keystore.write("skriuw.cloud-session", "bearer"), {
    message: KEYSTORE_UNAVAILABLE_MESSAGE,
  });
  const session = createSessionStore(keystore);
  assert.deepEqual(await session.remember("bearer"), { persisted: false });
  assert.equal(reported.length, 1);
  assert.match(String((reported[0] as Error).cause), /ExpoSecureStore/);
});

test("a module without a native side, as on web, is the refusing keystore too", async () => {
  const reported: unknown[] = [];
  const keystore = createPlatformKeystore(
    resolveSecureStore(async () => null, (error) => reported.push(error)),
  );

  await assert.rejects(keystore.read("skriuw.cloud-session"), {
    message: KEYSTORE_UNAVAILABLE_MESSAGE,
  });
  assert.equal(reported.length, 1);
});
