import assert from "node:assert/strict";
import test from "node:test";
import {
  currentSessionToken,
  forgetSessionToken,
  rememberSessionToken,
} from "../../../src/features/auth/session-token";

type BrowserGlobal = typeof globalThis & {
  window?: object;
  localStorage?: Storage;
};

function createStorageStub(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: () => null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

async function withBrowserRuntime(
  run: (storage: ReturnType<typeof createStorageStub>) => Promise<void>,
): Promise<void> {
  const globals = globalThis as BrowserGlobal;
  const storage = createStorageStub();
  globals.window = {};
  globals.localStorage = storage;
  try {
    await run(storage);
  } finally {
    await forgetSessionToken();
    delete globals.window;
    delete globals.localStorage;
  }
}

test("a remembered browser session persists and loads back", async () => {
  await withBrowserRuntime(async (storage) => {
    await rememberSessionToken("token-1");
    assert.equal(storage.map.size, 1);
    assert.equal(await currentSessionToken(), "token-1");
  });
});

test("sign-out forgets the browser session and clears storage", async () => {
  await withBrowserRuntime(async (storage) => {
    await rememberSessionToken("token-1");
    await forgetSessionToken();
    assert.equal(storage.map.size, 0);
    assert.equal(await currentSessionToken(), undefined);
  });
});

test("a corrupted stored browser session reads as signed-out", async () => {
  await withBrowserRuntime(async (storage) => {
    storage.setItem("skriuw.cloud-session.v1", "{corrupt");
    assert.equal(await currentSessionToken(), undefined);
    assert.equal(storage.map.size, 0);
  });
});
