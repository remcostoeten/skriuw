import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";

type RemoteStoreState = Record<string, Record<string, unknown>>;

let remoteStores: RemoteStoreState;
let putCalls: Array<{ storeName: string; id: string }> = [];

function registerModuleMocks() {
  mock.module("../local-records", () => ({
    listLocalRecords: async () => [],
    putLocalRecord: async <TRecord>(storeName: string, record: TRecord) => record,
    destroyLocalRecord: async () => undefined,
  }));

  mock.module("@/core/persistence/supabase", () => ({
    listRemoteRecords: async (storeName: string) =>
      Object.values(remoteStores[storeName] ?? {}),
    putRemoteRecord: async (storeName: string, record: { id: string }) => {
      remoteStores[storeName] ??= {};
      remoteStores[storeName][record.id] = record;
      putCalls.push({ storeName, id: record.id });
    },
  }));
}

async function loadModule() {
  registerModuleMocks();
  return import(`../privacy-demo?test=${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
  remoteStores = {};
  putCalls = [];
  Object.defineProperty(globalThis, "window", {
    value: {},
    configurable: true,
  });
});

afterEach(() => {
  mock.restore();
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
  });
});

describe("privacy demo seeding", () => {
  test("seeds the authenticated starter workspace once and writes the marker note last", async () => {
    const { ensureCloudStarterContentSeeded } = await loadModule();

    await ensureCloudStarterContentSeeded("user-123");

    expect(putCalls).toEqual([
      { storeName: PERSISTED_STORE_NAMES.folders, id: "privacy-folder-daily" },
      { storeName: PERSISTED_STORE_NAMES.folders, id: "privacy-folder-playground" },
      { storeName: PERSISTED_STORE_NAMES.notes, id: "privacy-note-sprint" },
      { storeName: PERSISTED_STORE_NAMES.notes, id: "privacy-note-scratchpad" },
      { storeName: PERSISTED_STORE_NAMES.tags, id: "privacy-tag-focus" },
      { storeName: PERSISTED_STORE_NAMES.tags, id: "privacy-tag-review" },
      { storeName: PERSISTED_STORE_NAMES.journalEntries, id: "privacy-entry-2026-04-12" },
      { storeName: PERSISTED_STORE_NAMES.notes, id: "privacy-note-welcome" },
    ]);

    await ensureCloudStarterContentSeeded("user-123");

    expect(putCalls).toHaveLength(8);
  });

  test("does not reseed when starter records already exist but the welcome note was removed", async () => {
    remoteStores = {
      [PERSISTED_STORE_NAMES.notes]: {
        "privacy-note-sprint": {
          id: "privacy-note-sprint",
          name: "Sprint Review.md",
        },
      },
    };

    const { ensureCloudStarterContentSeeded } = await loadModule();

    await ensureCloudStarterContentSeeded("user-123");

    expect(putCalls).toEqual([]);
  });

  test("does not seed when the cloud workspace already contains user data", async () => {
    remoteStores = {
      [PERSISTED_STORE_NAMES.notes]: {
        "external-note": {
          id: "external-note",
          name: "External.md",
        },
      },
    };

    const { ensureCloudStarterContentSeeded } = await loadModule();

    await ensureCloudStarterContentSeeded("user-123");

    expect(putCalls).toEqual([]);
  });
});
