import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type StoredRecord = {
  store_name: string;
  record_id: string;
  record_json: string;
};

const meta = new Map<string, string>();
const records = new Map<string, StoredRecord>();
const listRecordsCalls: string[] = [];

function getRecordKey(storeName: string, recordId: string) {
  return `${storeName}:${recordId}`;
}

class FakePGlite {
  waitReady = Promise.resolve();

  constructor(_dataDir?: string, _options?: unknown) {}

  async exec(_query: string) {}

  async query<T>(query: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    if (query.includes("SELECT value_json FROM app_meta")) {
      const key = params[0] as string;
      const value = meta.get(key);
      return { rows: value ? ([{ value_json: value }] as T[]) : [] };
    }

    if (query.includes("SELECT COUNT(*)::int AS record_count FROM app_records")) {
      return { rows: [{ record_count: records.size } as T] };
    }

    if (query.includes("INSERT INTO app_meta")) {
      meta.set(params[0] as string, params[1] as string);
      return { rows: [] };
    }

    if (query.includes("INSERT INTO app_records")) {
      records.set(getRecordKey(params[0] as string, params[1] as string), {
        store_name: params[0] as string,
        record_id: params[1] as string,
        record_json: params[2] as string,
      });
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${query}`);
  }

  async close() {}
}

describe("openPGliteDb", () => {
  beforeEach(() => {
    mock.restore();
    meta.clear();
    records.clear();
    listRecordsCalls.length = 0;
    globalThis.window = {} as Window & typeof globalThis;

    mock.module("@electric-sql/pglite", () => ({
      PGlite: FakePGlite,
    }));

    mock.module("@/core/storage", () => ({
      listRecords: async (storeName: string) => {
        listRecordsCalls.push(storeName);

        if (storeName === "notes") {
          return [
            {
              id: "note-1",
              name: "Imported.md",
              content: "# imported",
              richContent: [],
              preferredEditorMode: "block",
              parentId: null,
              createdAt: "2026-03-17T10:00:00.000Z",
              updatedAt: "2026-03-17T10:00:00.000Z",
            },
          ];
        }

        return [];
      },
    }));
  });

  afterEach(async () => {
    const module = await import("../db");
    module.resetPGliteDbForTests();
    mock.restore();
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  test("imports legacy IndexedDB records once when the PGlite store is empty", async () => {
    const module = await import("../db");

    await module.openPGliteDb();

    expect(listRecordsCalls).toEqual([
      "notes",
      "folders",
      "journalEntries",
      "tags",
      "preferences",
    ]);
    expect(records.get("notes:note-1")?.record_json).toContain("Imported.md");
    expect(meta.size).toBe(1);
  });

  test("skips legacy import when PGlite already has records", async () => {
    records.set("notes:existing", {
      store_name: "notes",
      record_id: "existing",
      record_json: JSON.stringify({ id: "existing" }),
    });

    const module = await import("../db");

    await module.openPGliteDb();

    expect(listRecordsCalls).toEqual([]);
    expect(records.has("notes:existing")).toBe(true);
    expect(meta.size).toBe(1);
  });
});
