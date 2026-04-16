import { describe, expect, test } from "bun:test";
import { StorageError, toStorageError } from "@/core/storage/errors";

describe("storage errors", () => {
  test("creates storage errors with the expected shape", () => {
    const error = new StorageError("transaction_failed", "boom", new Error("root"));

    expect(error.name).toBe("StorageError");
    expect(error.code).toBe("transaction_failed");
    expect(error.message).toBe("boom");
    expect(error.cause).toBeInstanceOf(Error);
  });

  test("does not wrap a storage error twice", () => {
    const existing = new StorageError("database_open_failed", "existing");

    expect(toStorageError("transaction_failed", "ignored", existing)).toBe(existing);
  });
});
