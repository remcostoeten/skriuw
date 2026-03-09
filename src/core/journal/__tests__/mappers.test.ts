import { describe, expect, test } from "bun:test";
import type { DateKey, CssColorValue } from "@/core/shared/persistence-types";
import {
  fromPersistedJournalEntry,
  fromPersistedJournalTag,
  toPersistedJournalEntry,
  toPersistedJournalTag,
} from "../mappers";

describe("journal mappers", () => {
  test("maps journal entries to persisted records", () => {
    const entry = {
      id: "entry-1",
      dateKey: "2026-03-08" as DateKey,
      content: "hello",
      tags: ["work", "focus"],
      mood: "good" as const,
      createdAt: new Date("2026-03-08T08:00:00.000Z"),
      updatedAt: new Date("2026-03-08T09:00:00.000Z"),
    };

    expect(toPersistedJournalEntry(entry)).toEqual({
      id: "entry-1",
      dateKey: "2026-03-08",
      content: "hello",
      tags: ["work", "focus"],
      mood: "good",
      createdAt: "2026-03-08T08:00:00.000Z",
      updatedAt: "2026-03-08T09:00:00.000Z",
    });
  });

  test("maps journal tags from persisted records", () => {
    expect(
      fromPersistedJournalTag({
        id: "tag-1" as never,
        name: "work" as never,
        color: "#111111" as never,
        usageCount: 3,
        lastUsedAt: null,
        createdAt: "2026-03-08T08:00:00.000Z" as never,
        updatedAt: "2026-03-08T08:00:00.000Z" as never,
      }),
    ).toEqual({
      id: "tag-1",
      name: "work",
      color: "#111111",
      usageCount: 3,
    });
  });

  test("adds timestamps when persisting journal tags", () => {
    const tag = toPersistedJournalTag({
      id: "tag-1",
      name: "work",
      color: "#111111" as CssColorValue,
      usageCount: 2,
    });

    expect(tag.name).toBe("work");
    expect(tag.usageCount).toBe(2);
    expect(tag.createdAt).toBeString();
    expect(tag.updatedAt).toBeString();
  });
});
