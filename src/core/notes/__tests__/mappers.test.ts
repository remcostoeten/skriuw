import { describe, expect, test } from "bun:test";
import { fromPersistedNote, toPersistedNote } from "../mappers";

describe("note mappers", () => {
  test("maps note files to persisted notes", () => {
    const file = {
      id: "note-1",
      name: "Test.md",
      content: "# Test",
      parentId: "folder-1",
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
      modifiedAt: new Date("2026-03-02T12:00:00.000Z"),
    };

    expect(toPersistedNote(file)).toEqual({
      id: "note-1",
      name: "Test.md",
      content: "# Test",
      parentId: "folder-1",
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-02T12:00:00.000Z",
    });
  });

  test("maps persisted notes back to note files", () => {
    const note = fromPersistedNote({
      id: "note-1" as never,
      name: "Test.md",
      content: "# Test" as never,
      parentId: "folder-1" as never,
      createdAt: "2026-03-01T10:00:00.000Z" as never,
      updatedAt: "2026-03-02T12:00:00.000Z" as never,
    });

    expect(note.createdAt).toBeInstanceOf(Date);
    expect(note.modifiedAt).toBeInstanceOf(Date);
    expect(note.modifiedAt.toISOString()).toBe("2026-03-02T12:00:00.000Z");
  });
});
