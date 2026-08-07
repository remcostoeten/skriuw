import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBrowserSessionToken,
  loadBrowserSessionToken,
  storeBrowserSessionToken,
} from "../../src/auth/session-store";

type StorageGlobal = typeof globalThis & { localStorage?: Storage };

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

function withStorage(
  run: (storage: ReturnType<typeof createStorageStub>) => void,
): void {
  const globals = globalThis as StorageGlobal;
  const storage = createStorageStub();
  globals.localStorage = storage;
  try {
    run(storage);
  } finally {
    clearBrowserSessionToken();
    delete globals.localStorage;
  }
}

test("session round trips through storage under the versioned key", () => {
  withStorage((storage) => {
    storeBrowserSessionToken("token-1");
    assert.deepEqual([...storage.map.keys()], ["skriuw.cloud-session.v1"]);
    assert.equal(loadBrowserSessionToken(), "token-1");
  });
});

test("a stored session survives what a reload would drop", () => {
  withStorage((storage) => {
    storage.setItem(
      "skriuw.cloud-session.v1",
      JSON.stringify({ version: 1, token: "token-reload" }),
    );
    assert.equal(loadBrowserSessionToken(), "token-reload");
  });
});

test("malformed stored values are cleared and read as signed-out", () => {
  const malformed = [
    "not json",
    JSON.stringify({ version: 2, token: "token-1" }),
    JSON.stringify({ version: 1 }),
    JSON.stringify({ version: 1, token: "" }),
    JSON.stringify(null),
  ];
  for (const value of malformed) {
    withStorage((storage) => {
      storage.setItem("skriuw.cloud-session.v1", value);
      assert.equal(loadBrowserSessionToken(), undefined);
      assert.equal(storage.map.size, 0);
    });
  }
});

test("clearing removes the stored session", () => {
  withStorage((storage) => {
    storeBrowserSessionToken("token-1");
    clearBrowserSessionToken();
    assert.equal(storage.map.size, 0);
    assert.equal(loadBrowserSessionToken(), undefined);
  });
});

test("a session cleared in another tab wins over the in-memory value", () => {
  withStorage((storage) => {
    storeBrowserSessionToken("token-1");
    storage.map.clear();
    assert.equal(loadBrowserSessionToken(), undefined);
  });
});

test("without storage access the session lives for the page only", () => {
  storeBrowserSessionToken("token-memory");
  assert.equal(loadBrowserSessionToken(), "token-memory");
  clearBrowserSessionToken();
  assert.equal(loadBrowserSessionToken(), undefined);
});
