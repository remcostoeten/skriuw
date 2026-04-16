import { describe, expect, test } from "bun:test";
import { useJournalStore } from "@/features/journal/store";

describe("journal ui store", () => {
  test("updates and resets the selected date", () => {
    const initialDate = new Date("2026-04-15T00:00:00.000Z");
    const updatedDate = new Date("2026-04-16T00:00:00.000Z");

    useJournalStore.setState({ selectedDate: initialDate });
    useJournalStore.getState().setSelectedDate(updatedDate);

    expect(useJournalStore.getState().selectedDate).toEqual(updatedDate);

    useJournalStore.getState().resetWorkspace();

    expect(useJournalStore.getState().selectedDate).toBeInstanceOf(Date);
  });
});
