export type LocalPersistenceDurability = "durable" | "ephemeral" | "unknown";

const EPHEMERAL_STORAGE_QUOTA_BYTES = 128 * 1024 * 1024;

export async function detectLocalPersistenceDurability(): Promise<LocalPersistenceDurability> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return "unknown";
  }

  try {
    if (typeof navigator.storage.persisted === "function") {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        return "durable";
      }
    }

    if (typeof navigator.storage.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      const quota = typeof estimate.quota === "number" ? estimate.quota : undefined;

      if (quota && quota > 0 && quota < EPHEMERAL_STORAGE_QUOTA_BYTES) {
        return "ephemeral";
      }
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}
