import { describe, expect, test } from "bun:test";
import { buildJournalIcs, filterEntriesByRange } from "@/domain/journal/ics-export";
import type { JournalEntry } from "@/domain/journal/models";

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
	return {
		id: "entry-1",
		dateKey: "2026-03-05",
		title: "A day",
		content: "Body text",
		tags: [],
		createdAt: new Date("2026-03-05T08:00:00.000Z"),
		updatedAt: new Date("2026-03-05T09:30:00.000Z"),
		...overrides,
	};
}

describe("buildJournalIcs", () => {
	test("emits a valid VCALENDAR wrapper with CRLF endings", () => {
		const ics = buildJournalIcs([makeEntry()]);

		expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
		expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
		expect(ics).toContain("VERSION:2.0");
		expect(ics).toContain("PRODID:-//Skriuw//Journal//EN");
		expect(ics).toContain("CALSCALE:GREGORIAN");
		expect(ics).toContain("METHOD:PUBLISH");
		expect(ics).toContain("X-WR-CALNAME:Skriuw Journal");
		expect(ics).not.toContain("\n\n");
		expect(ics.split("\r\n").join("")).not.toContain("\n");
	});

	test("emits an all-day VEVENT with exclusive next-day DTEND and a stable UID", () => {
		const ics = buildJournalIcs([makeEntry()]);

		expect(ics).toContain("UID:entry-1@skriuw");
		expect(ics).toContain("DTSTART;VALUE=DATE:20260305");
		expect(ics).toContain("DTEND;VALUE=DATE:20260306");
		expect(ics).toContain("DTSTAMP:20260305T093000Z");
		expect(buildJournalIcs([makeEntry()])).toBe(ics);
	});

	test("rolls DTEND across month boundaries", () => {
		const ics = buildJournalIcs([makeEntry({ dateKey: "2026-01-31" })]);

		expect(ics).toContain("DTSTART;VALUE=DATE:20260131");
		expect(ics).toContain("DTEND;VALUE=DATE:20260201");
	});

	test("escapes commas, semicolons, backslashes, and newlines", () => {
		const ics = buildJournalIcs([
			makeEntry({ title: "a,b;c\\d", content: "line one\nline two", tags: [] }),
		]);

		expect(ics).toContain("SUMMARY:a\\,b\\;c\\\\d");
		expect(ics).toContain("line one\\nline two");
	});

	test("folds long lines at 75 octets without splitting multibyte characters", () => {
		const ics = buildJournalIcs([makeEntry({ content: "é".repeat(200), title: undefined })]);
		const rawLines = ics.split("\r\n");
		const encoder = new TextEncoder();

		for (const line of rawLines) {
			expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
		}
		const unfolded = ics.replace(/\r\n /g, "");
		expect(unfolded).toContain("é".repeat(200));
	});

	test("orders deterministically by date then id and filters ranges inclusively", () => {
		const entries = [
			makeEntry({ id: "b", dateKey: "2026-03-07" }),
			makeEntry({ id: "a", dateKey: "2026-03-07" }),
			makeEntry({ id: "c", dateKey: "2026-03-01" }),
			makeEntry({ id: "d", dateKey: "2026-04-01" }),
		];

		const ics = buildJournalIcs(entries, { from: "2026-03-01", to: "2026-03-07" });
		const uids = ics
			.split("\r\n")
			.filter((line) => line.startsWith("UID:"))
			.map((line) => line.slice(4));

		expect(uids).toEqual(["c@skriuw", "a@skriuw", "b@skriuw"]);
		expect(filterEntriesByRange(entries, "2026-03-02", undefined).map((e) => e.id)).toEqual([
			"b",
			"a",
			"d",
		]);
	});

	test("serializes an empty export as a bare calendar", () => {
		const ics = buildJournalIcs([]);

		expect(ics).not.toContain("BEGIN:VEVENT");
		expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
	});

	test("skips entries with malformed dates and survives invalid timestamps", () => {
		const ics = buildJournalIcs([
			makeEntry({ id: "bad-date", dateKey: "not-a-date" }),
			makeEntry({ id: "bad-month", dateKey: "2026-13-05" }),
			makeEntry({
				id: "bad-stamp",
				dateKey: "2026-03-05",
				updatedAt: new Date("invalid"),
				createdAt: new Date("2026-03-05T08:00:00.000Z"),
			}),
		]);

		expect(ics).not.toContain("bad-date@skriuw");
		expect(ics).not.toContain("bad-month@skriuw");
		expect(ics).toContain("UID:bad-stamp@skriuw");
		expect(ics).toContain("DTSTAMP:20260305T080000Z");
	});

	test("includes mood, tags, and resolved people in SUMMARY/DESCRIPTION/CATEGORIES", () => {
		const ics = buildJournalIcs(
			[makeEntry({ mood: "great", tags: ["work", "life"], content: "Body" })],
			{ resolvePersonName: () => null },
		);

		expect(ics).toContain("SUMMARY:A day (Great)");
		expect(ics).toContain("CATEGORIES:work,life");
		expect(ics.replace(/\r\n /g, "")).toContain(
			"DESCRIPTION:---\\nmood: Great\\ntags: work\\, life\\n---\\n\\nBody",
		);
	});
});
