import type { PersistedStoreName } from "@/core/shared/persistence-types";
import { listRecords } from "@/core/storage/list-records";

export async function listLegacyRecords(storeName: PersistedStoreName) {
  return listRecords(storeName);
}
