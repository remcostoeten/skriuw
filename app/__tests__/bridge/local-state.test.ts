import assert from "node:assert/strict";
import test from "node:test";
import { clearSkriuwLocalState } from "../../src/bridge/local-state";

function memoryStorage(entries: Record<string, string>): Storage {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("clears Skriuw renderer state without deleting unrelated origin data", () => {
  const storage = memoryStorage({
    "skriuw:zoom-percent": "110",
    "skriuw.cloud-session.v1": "session",
    "another-app": "keep",
  });

  clearSkriuwLocalState(storage);

  assert.equal(storage.getItem("skriuw:zoom-percent"), null);
  assert.equal(storage.getItem("skriuw.cloud-session.v1"), null);
  assert.equal(storage.getItem("another-app"), "keep");
});
