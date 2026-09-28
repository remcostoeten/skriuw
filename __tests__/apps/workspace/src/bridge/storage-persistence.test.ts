import assert from "node:assert/strict";
import { test } from "vitest";
import { claimRiskAnnouncement, describePersistenceRisk } from "@/bridge/storage-persistence";

test("describePersistenceRisk warns when the device is almost out of storage", () => {
  assert.match(
    describePersistenceRisk({ kind: "low-space", remainingBytes: 1024 })?.message ?? "",
    /out of storage/,
  );
});

test("describePersistenceRisk leaves best-effort storage to the browser storage notice", () => {
  assert.equal(describePersistenceRisk({ kind: "best-effort" }), null);
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
  const risk = { kind: "low-space", remainingBytes: 512 } as const;
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
