import { describe, expect, test } from "bun:test";
import {
  PERSISTENCE_DB_NAME,
  PERSISTENCE_DB_VERSION,
  PERSISTENCE_STORE_DEFINITIONS,
  getPersistenceStoreNames,
} from "../schema";
import { PERSISTED_STORE_NAMES, PERSISTENCE_SCHEMA_VERSION } from "@/core/shared/persistence-types";

describe("storage schema", () => {
  test("uses the shared schema version", () => {
    expect(PERSISTENCE_DB_VERSION).toBe(PERSISTENCE_SCHEMA_VERSION);
  });

  test("defines the expected object stores", () => {
    expect(PERSISTENCE_DB_NAME).toBe("haptic-persistence");
    expect(getPersistenceStoreNames()).toEqual([
      PERSISTED_STORE_NAMES.notes,
      PERSISTED_STORE_NAMES.folders,
      PERSISTED_STORE_NAMES.journalEntries,
      PERSISTED_STORE_NAMES.tags,
      PERSISTED_STORE_NAMES.preferences,
    ]);
    expect(PERSISTENCE_STORE_DEFINITIONS.every((store) => store.keyPath === "id")).toBe(true);
  });
});
