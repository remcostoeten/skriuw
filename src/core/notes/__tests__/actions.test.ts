import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

describe("note actions", () => {
  beforeEach(() => {
    mock.restore();
    mock.module("@/core/storage", () => ({
      getRecord: async () => ({
        id: "note-1",
        name: "Existing.md",
        content: "# old",
        parentId: null,
        createdAt: "2026-03-08T08:00:00.000Z",
        updatedAt: "2026-03-08T08:00:00.000Z",
      }),
      putRecord: async (_storeName: string, record: unknown) => record,
      runInTransaction: async () => undefined,
      destroyRecord: async () => undefined,
      listRecords: async () => [],
      openPersistenceDb: async () => undefined,
      closePersistenceDb: async () => undefined,
      toStorageError: (_code: string, message: string) => new Error(message),
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  test("createNote normalizes the filename before persisting", async () => {
    const { createNote } = await import("../create-note");
    const note = await createNote({
      id: "note-1" as never,
      name: "Draft",
      content: "# hi" as never,
    });

    expect(note.name).toBe("Draft.md");
  });

  test("updateNote preserves existing fields when partial updates are applied", async () => {
    const { updateNote } = await import("../update-note");
    const updated = await updateNote({
      id: "note-1" as never,
      content: "# new" as never,
    });

    expect(updated?.name).toBe("Existing.md");
    expect(updated?.content).toBe("# new");
  });
});
