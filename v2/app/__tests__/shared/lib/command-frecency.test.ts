import assert from "node:assert/strict";
import test from "node:test";
import { recordCommandUse, getCommandFrecency } from "../../../src/shared/lib/command-frecency";

function setupMockLocalStorage() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    clear: () => store.clear(),
  };

  const globalObj = globalThis as unknown as { window?: { localStorage: typeof localStorageMock } };
  const previousWindow = globalObj.window;

  globalObj.window = { localStorage: localStorageMock };

  return {
    cleanup: () => {
      globalObj.window = previousWindow;
    },
    store,
  };
}

test("records command use and calculates frecency score", () => {
  const mock = setupMockLocalStorage();
  try {
    recordCommandUse("cmd1");
    recordCommandUse("cmd1");
    recordCommandUse("cmd2");

    const scores = getCommandFrecency();
    assert.equal(scores.cmd1, 2);
    assert.equal(scores.cmd2, 1);
  } finally {
    mock.cleanup();
  }
});

test("calculates decayed frecency score based on age", () => {
  const mock = setupMockLocalStorage();
  try {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const store = {
      recent: { count: 10, lastUsed: now - 0.5 * DAY_MS }, // weight 1 => 10
      weekOld: { count: 10, lastUsed: now - 3 * DAY_MS },  // weight 0.7 => 7
      monthOld: { count: 10, lastUsed: now - 15 * DAY_MS },// weight 0.4 => 4
      veryOld: { count: 10, lastUsed: now - 40 * DAY_MS }, // weight 0.2 => 2
    };
    mock.store.set("skriuw:command-frecency:v1", JSON.stringify(store));

    const scores = getCommandFrecency();
    assert.equal(scores.recent, 10);
    assert.equal(scores.weekOld, 7);
    assert.equal(scores.monthOld, 4);
    assert.equal(scores.veryOld, 2);
  } finally {
    mock.cleanup();
  }
});

test("handles corrupt or invalid localStorage gracefully", () => {
  const mock = setupMockLocalStorage();
  try {
    mock.store.set("skriuw:command-frecency:v1", "invalid json{");
    assert.deepEqual(getCommandFrecency(), {});

    mock.store.set("skriuw:command-frecency:v1", JSON.stringify({ badEntry: { count: "not-a-number" } }));
    assert.deepEqual(getCommandFrecency(), {});
  } finally {
    mock.cleanup();
  }
});

test("evicts oldest entries when MAX_ENTRIES (100) is exceeded", () => {
  const mock = setupMockLocalStorage();
  try {
    // Populate store directly to test eviction logic
    const store: Record<string, { count: number; lastUsed: number }> = {};
    const now = Date.now();
    for (let i = 0; i < 105; i++) {
      store[`cmd_${i}`] = { count: 1, lastUsed: now - (105 - i) * 1000 };
    }
    mock.store.set("skriuw:command-frecency:v1", JSON.stringify(store));

    // Record one more use to trigger eviction of >100 entries
    recordCommandUse("cmd_new");

    const scores = getCommandFrecency();
    assert.equal(Object.keys(scores).length, 100);
    // Oldest entry (cmd_0) should be evicted
    assert.equal(scores["cmd_0"], undefined);
    assert.ok(scores["cmd_new"] !== undefined);
  } finally {
    mock.cleanup();
  }
});
