export type StorageErrorCode =
  | "storage_unavailable"
  | "database_open_failed"
  | "database_upgrade_failed"
  | "transaction_failed";

export class StorageError extends Error {
  override name = "StorageError";

  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function toStorageError(
  code: StorageErrorCode,
  message: string,
  cause?: unknown,
): StorageError {
  return cause instanceof StorageError ? cause : new StorageError(code, message, cause);
}
