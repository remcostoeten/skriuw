import { describe, expect, test } from "bun:test";
import {
	dateFromKey,
	isDateKey,
	isMoodLevel,
	localDateKey,
	mergeJournalEntriesByDate,
} from "./journal";

describe("journal domain", () => {
	test("round-trips valid local date keys", () => {
		expect(localDateKey(dateFromKey("2026-07-12"))).toBe("2026-07-12");
		expect(isDateKey("2026-02-29")).toBe(false);
		expect(isDateKey("2024-02-29")).toBe(true);
	});

	test("validates moods", () => {
		expect(isMoodLevel("great")).toBe(true);
		expect(isMoodLevel("excellent")).toBe(false);
	});

	test("keeps newest entry for each date", () => {
		const older = {
			id: "a",
			dateKey: "2026-07-12",
			createdAt: "2026-07-12T08:00:00Z",
			updatedAt: "2026-07-12T08:00:00Z",
		};
		const newer = { ...older, id: "b", updatedAt: "2026-07-12T09:00:00Z" };
		expect(mergeJournalEntriesByDate([newer, older])).toEqual([newer]);
	});
});
