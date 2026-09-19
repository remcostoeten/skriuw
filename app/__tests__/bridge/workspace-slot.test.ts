import assert from "node:assert/strict";
import test from "node:test";
import {
  activeBlobsDirectory,
  activeDatabaseName,
  activeWorkspaceSlot,
  adoptWorkspaceSlot,
  isBlobsDirectory,
} from "../../src/bridge/workspace-slot";

const FIRST = `w_${"a1".repeat(32)}`;
const SECOND = `w_${"b2".repeat(32)}`;
const STORAGE_KEY = "skriuw.workspace-slots.v1";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

function withFreshProfile(): Storage {
  const storage = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return storage;
}

test("a profile that has never signed in opens the default storage", () => {
  withFreshProfile();

  assert.equal(activeWorkspaceSlot(), null);
  assert.equal(activeDatabaseName(), "workspace.sqlite3");
  assert.equal(activeBlobsDirectory(), "skriuw-media-blobs");
});

test("the first account claims the existing storage so nothing already written moves", () => {
  withFreshProfile();

  assert.equal(adoptWorkspaceSlot(FIRST), "claimed");

  assert.equal(activeWorkspaceSlot(), FIRST);
  assert.equal(activeDatabaseName(), "workspace.sqlite3");
  assert.equal(activeBlobsDirectory(), "skriuw-media-blobs");
  assert.equal(adoptWorkspaceSlot(FIRST), "active");
});

test("a second account gets its own database and blobs, and the first is unchanged", () => {
  withFreshProfile();
  adoptWorkspaceSlot(FIRST);

  assert.equal(adoptWorkspaceSlot(SECOND), "switched");
  assert.equal(activeDatabaseName(), `workspace-${SECOND}.sqlite3`);
  assert.equal(activeBlobsDirectory(), `skriuw-media-blobs-${SECOND}`);

  assert.equal(adoptWorkspaceSlot(FIRST), "switched");
  assert.equal(activeDatabaseName(), "workspace.sqlite3");
  assert.equal(activeBlobsDirectory(), "skriuw-media-blobs");
});

test("storage linked before the registry existed keeps the account that linked it", () => {
  withFreshProfile();

  // The account that already owned this storage signs in: no entry records it
  // yet, but the storage itself does.
  assert.equal(adoptWorkspaceSlot(FIRST, FIRST), "active");
  assert.equal(activeDatabaseName(), "workspace.sqlite3");

  // The other account is routed away from it rather than claiming it.
  assert.equal(adoptWorkspaceSlot(SECOND, FIRST), "switched");
  assert.equal(activeDatabaseName(), `workspace-${SECOND}.sqlite3`);
  assert.equal(adoptWorkspaceSlot(FIRST), "switched");
  assert.equal(activeDatabaseName(), "workspace.sqlite3");
});

test("an identity that is not a cloud workspace digest never names a file", () => {
  withFreshProfile();

  assert.throws(() => adoptWorkspaceSlot("../../escape"));
  assert.throws(() => adoptWorkspaceSlot("w_short"));
  assert.throws(() => adoptWorkspaceSlot(`w_${"A1".repeat(32)}`));
  assert.equal(activeWorkspaceSlot(), null);
});

test("a tampered or unreadable registry falls back to the default storage", () => {
  const storage = withFreshProfile();

  storage.setItem(STORAGE_KEY, "{ not json");
  assert.equal(activeWorkspaceSlot(), null);
  assert.equal(activeDatabaseName(), "workspace.sqlite3");

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ active: "w_x", slots: { w_x: "../../elsewhere" } }),
  );
  assert.equal(activeWorkspaceSlot(), null);
  assert.equal(activeDatabaseName(), "workspace.sqlite3");
});

test("every account's blob directory is recognized, so clearing data misses none", () => {
  assert.ok(isBlobsDirectory("skriuw-media-blobs"));
  assert.ok(isBlobsDirectory(`skriuw-media-blobs-${SECOND}`));
  assert.ok(!isBlobsDirectory(".skriuw-v2"));
  assert.ok(!isBlobsDirectory("skriuw-media-blobs-other"));
});
