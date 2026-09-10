import assert from "node:assert/strict";
import test from "node:test";
import {
  claimRiskAnnouncement,
  describePersistenceRisk,
} from "../../src/bridge/storage-persistence";

test("describePersistenceRisk warns while the browser may still evict the workspace", () => {
  assert.match(describePersistenceRisk({ kind: "best-effort" }) ?? "", /delete your workspace/);
  assert.match(
    describePersistenceRisk({ kind: "low-space", remainingBytes: 1024 }) ?? "",
    /out of storage/,
  );
});

test("describePersistenceRisk stays quiet when storage is durable or unknowable", () => {
  assert.equal(describePersistenceRisk({ kind: "persisted" }), null);
  assert.equal(describePersistenceRisk({ kind: "unavailable" }), null);
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

test("claimRiskAnnouncement reports each risk once per device", () => {
  const storage = memoryStorage();
  const risk = { kind: "best-effort" } as const;
  assert.equal(claimRiskAnnouncement(risk, storage), true);
  assert.equal(claimRiskAnnouncement(risk, storage), false);
});

test("claimRiskAnnouncement reports a risk again after a healthy launch", () => {
  const storage = memoryStorage();
  const lowSpace = { kind: "low-space", remainingBytes: 512 } as const;
  assert.equal(claimRiskAnnouncement(lowSpace, storage), true);
  assert.equal(claimRiskAnnouncement({ kind: "persisted" }, storage), false);
  assert.equal(claimRiskAnnouncement(lowSpace, storage), true);
});
