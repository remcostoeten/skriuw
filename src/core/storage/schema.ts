import {
  PERSISTED_STORE_NAMES,
  PERSISTENCE_SCHEMA_VERSION,
  type PersistedStoreName,
} from "@/core/shared/persistence-types";

export const PERSISTENCE_DB_NAME = "haptic-persistence" as const;
export const PERSISTENCE_DB_VERSION = PERSISTENCE_SCHEMA_VERSION;

export type PersistenceStoreDefinition = {
  name: PersistedStoreName;
  keyPath: "id";
};

export const PERSISTENCE_STORE_DEFINITIONS = [
  { name: PERSISTED_STORE_NAMES.notes, keyPath: "id" },
  { name: PERSISTED_STORE_NAMES.folders, keyPath: "id" },
  { name: PERSISTED_STORE_NAMES.journalEntries, keyPath: "id" },
  { name: PERSISTED_STORE_NAMES.tags, keyPath: "id" },
  { name: PERSISTED_STORE_NAMES.preferences, keyPath: "id" },
] as const satisfies readonly PersistenceStoreDefinition[];

export function getPersistenceStoreNames(): PersistedStoreName[] {
  return PERSISTENCE_STORE_DEFINITIONS.map((store) => store.name);
}
