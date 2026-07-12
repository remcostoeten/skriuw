import { describe, expect, test } from "bun:test";
import { buildJournalIcs } from "@/domain/journal/ics-export";
import {
	MAX_ICS_IMPORT_BYTES,
	parseJournalIcs,
	planJournalIcsImport,
	summarizeJournalImport,
	unescapeIcsText,
	validateIcsFile,
} from "@/domain/journal/ics-import";
import type { JournalEntry } from "@/domain/journal/models";

function wrapCalendar(eventLines: string[], lineEnding = "\r\n"): string {
	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Test//EN",
		...eventLines,
		"END:VCALENDAR",
	].join(lineEnding);
}

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
	return {
		id: "entry-1",
		dateKey: "2026-03-05",
		title: "A day",
		content: "Body text",
		tags: ["work"],
		mood: "good",
		createdAt: new Date("2026-03-05T08:00:00.000Z"),
		updatedAt: new Date("2026-03-05T09:30:00.000Z"),
		...overrides,
	};
}

describe("validateIcsFile", () => {
	test("accepts .ics files under the size limit", () => {
		expect(validateIcsFile({ name: "cal.ics", size: 100, type: "text/calendar" })).toBeNull();
		expect(validateIcsFile({ name: "CAL.ICS", size: 100, type: "" })).toBeNull();
	});

	test("rejects wrong extensions, oversize, and empty files", () => {
		expect(validateIcsFile({ name: "cal.txt", size: 100, type: "text/plain" })).toContain(
			".ics",
		);
		expect(
			validateIcsFile({ name: "cal.ics", size: MAX_ICS_IMPORT_BYTES + 1, type: "" }),
		).toContain("too large");
		expect(validateIcsFile({ name: "cal.ics", size: 0, type: "" })).toContain("empty");
	});
});

describe("parseJournalIcs", () => {
	test("rejects non-iCalendar input", () => {
		expect(() => parseJournalIcs("hello world")).toThrow("not an iCalendar");
	});

	test("parses an all-day event with LF line endings", () => {
		const result = parseJournalIcs(
			wrapCalendar(
				[
					"BEGIN:VEVENT",
					"UID:abc",
					"DTSTART;VALUE=DATE:20260305",
					"DTEND;VALUE=DATE:20260306",
					"SUMMARY:Hello",
					"DESCRIPTION:World",
					"END:VEVENT",
				],
				"\n",
			),
		);

		expect(result.totalEvents).toBe(1);
		expect(result.events).toHaveLength(1);
		expect(result.events[0]).toMatchObject({
			uid: "abc",
			dateKey: "2026-03-05",
			title: "Hello",
			content: "World",
			tags: [],
		});
		expect(result.events[0].sourceEntryId).toBeUndefined();
	});

	test("unfolds folded lines and unescapes TEXT values including Unicode", () => {
		const result = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20260305",
				"SUMMARY:Caf",
				" é\\, twice\\; done",
				"DESCRIPTION:line one\\nline two\\\\end",
				"END:VEVENT",
			]),
		);

		expect(result.events[0].title).toBe("Café, twice; done");
		expect(result.events[0].content).toBe("line one\nline two\\end");
	});

	test("imports timed events on their start date with a warning", () => {
		const result = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"DTSTART;TZID=Europe/Amsterdam:20260305T233000",
				"SUMMARY:Late",
				"END:VEVENT",
				"BEGIN:VEVENT",
				"DTSTART:20260306T100000Z",
				"SUMMARY:Utc",
				"END:VEVENT",
			]),
		);

		expect(result.events.map((event) => event.dateKey)).toEqual(["2026-03-05", "2026-03-06"]);
		for (const event of result.events) {
			expect(event.warnings.join(" ")).toContain("Timed event");
		}
	});

	test("skips recurring, cancelled, dateless, and malformed-date events with reasons", () => {
		const result = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20260305",
				"RRULE:FREQ=WEEKLY",
				"SUMMARY:Weekly",
				"END:VEVENT",
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20260305",
				"STATUS:CANCELLED",
				"SUMMARY:Gone",
				"END:VEVENT",
				"BEGIN:VEVENT",
				"SUMMARY:No date",
				"END:VEVENT",
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20261399",
				"SUMMARY:Bad date",
				"END:VEVENT",
			]),
		);

		expect(result.totalEvents).toBe(4);
		expect(result.events).toHaveLength(0);
		expect(result.skipped.map((item) => item.reason)).toEqual([
			"Recurring events are not supported",
			"Event is cancelled",
			"Missing start date (DTSTART)",
			"Invalid or unsupported start date",
		]);
	});

	test("warns on alarms, attachments, and multi-day events without dropping them", () => {
		const result = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20260305",
				"DTEND;VALUE=DATE:20260310",
				"ATTACH:https://example.com/file.pdf",
				"SUMMARY:Trip",
				"BEGIN:VALARM",
				"TRIGGER:-PT15M",
				"ACTION:DISPLAY",
				"END:VALARM",
				"END:VEVENT",
			]),
		);

		expect(result.events).toHaveLength(1);
		const warnings = result.events[0].warnings.join(" | ");
		expect(warnings).toContain("Multi-day event");
		expect(warnings).toContain("Attachments");
		expect(warnings).toContain("alarms");
	});

	test("normalizes CATEGORIES through the canonical tag normalizer", () => {
		const result = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20260305",
				"SUMMARY:Tagged",
				"CATEGORIES:My Tag,#other,My Tag",
				"CATEGORIES:третий",
				"END:VEVENT",
			]),
		);

		expect(result.events[0].tags).toEqual(["my-tag", "other"]);
	});

	test("only recognizes mood metadata on Skriuw-origin events", () => {
		const description = "---\\nmood: Great\\n---\\n\\nBody";
		const foreign = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"UID:external-uid",
				"DTSTART;VALUE=DATE:20260305",
				`DESCRIPTION:${description}`,
				"END:VEVENT",
			]),
		);
		const skriuw = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"UID:entry-1@skriuw",
				"DTSTART;VALUE=DATE:20260305",
				`DESCRIPTION:${description}`,
				"END:VEVENT",
			]),
		);

		expect(foreign.events[0].mood).toBeUndefined();
		expect(foreign.events[0].content).toContain("mood: Great");
		expect(skriuw.events[0].mood).toBe("great");
		expect(skriuw.events[0].content).toBe("Body");
		expect(skriuw.events[0].sourceEntryId).toBe("entry-1");
	});

	test("preserves unresolved people as plain text instead of linking them", () => {
		const result = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"UID:entry-1@skriuw",
				"DTSTART;VALUE=DATE:20260305",
				"DESCRIPTION:---\\npeople: Ada\\, Bob\\n---\\n\\nBody",
				"END:VEVENT",
			]),
		);

		expect(result.events[0].content).toBe("Body\n\nPeople: Ada, Bob");
	});

	test("round-trips a Skriuw export: fields survive and metadata is stripped from the body", () => {
		const exported = buildJournalIcs([
			makeEntry({ title: "A day", mood: "great", tags: ["work", "life"], content: "Body" }),
		]);
		const result = parseJournalIcs(exported);

		expect(result.events).toHaveLength(1);
		expect(result.events[0]).toMatchObject({
			sourceEntryId: "entry-1",
			dateKey: "2026-03-05",
			title: "A day",
			content: "Body",
			mood: "great",
			tags: ["work", "life"],
		});
	});

	test("round-trips the default untitled summary back to no title", () => {
		const exported = buildJournalIcs([makeEntry({ title: undefined, mood: undefined })]);
		const result = parseJournalIcs(exported);

		expect(result.events[0].title).toBeUndefined();
	});

	test("reads X-WR-CALNAME", () => {
		const result = parseJournalIcs(
			wrapCalendar(["X-WR-CALNAME:My Calendar", "BEGIN:VEVENT", "END:VEVENT"]),
		);

		expect(result.calendarName).toBe("My Calendar");
	});
});

describe("planJournalIcsImport", () => {
	const parsedTwoEvents = parseJournalIcs(
		wrapCalendar([
			"BEGIN:VEVENT",
			"DTSTART;VALUE=DATE:20260305",
			"SUMMARY:Existing day",
			"END:VEVENT",
			"BEGIN:VEVENT",
			"DTSTART;VALUE=DATE:20260401",
			"SUMMARY:New day",
			"END:VEVENT",
		]),
	);

	test("default skip mode never targets existing dates", () => {
		const plan = planJournalIcsImport(parsedTwoEvents, [makeEntry()], "skip");

		expect(plan.creates.map((event) => event.dateKey)).toEqual(["2026-04-01"]);
		expect(plan.updates).toHaveLength(0);
		expect(plan.duplicates.map((event) => event.dateKey)).toEqual(["2026-03-05"]);
	});

	test("update mode maps duplicates onto the existing entry id", () => {
		const plan = planJournalIcsImport(parsedTwoEvents, [makeEntry()], "update");

		expect(plan.creates.map((event) => event.dateKey)).toEqual(["2026-04-01"]);
		expect(plan.updates).toEqual([
			{ targetId: "entry-1", event: expect.objectContaining({ dateKey: "2026-03-05" }) },
		]);
		expect(plan.duplicates).toHaveLength(0);
	});

	test("re-importing a Skriuw export in skip mode creates zero entries", () => {
		const entries = [
			makeEntry(),
			makeEntry({ id: "entry-2", dateKey: "2026-03-06", title: "Other" }),
		];
		const plan = planJournalIcsImport(
			parseJournalIcs(buildJournalIcs(entries)),
			entries,
			"skip",
		);

		expect(plan.creates).toHaveLength(0);
		expect(plan.updates).toHaveLength(0);
		expect(plan.duplicates).toHaveLength(2);
	});

	test("skips later same-date events within one file so a day is never written twice", () => {
		const parsed = parseJournalIcs(
			wrapCalendar([
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20260401",
				"SUMMARY:First",
				"END:VEVENT",
				"BEGIN:VEVENT",
				"DTSTART;VALUE=DATE:20260401",
				"SUMMARY:Second",
				"END:VEVENT",
			]),
		);
		const plan = planJournalIcsImport(parsed, [], "skip");

		expect(plan.creates.map((event) => event.title)).toEqual(["First"]);
		expect(plan.skipped).toEqual([
			expect.objectContaining({
				summary: "Second",
				reason: "Another event in this file already targets this date",
			}),
		]);
	});

	test("carries parser skips through the plan", () => {
		const parsed = parseJournalIcs(
			wrapCalendar(["BEGIN:VEVENT", "SUMMARY:No date", "END:VEVENT"]),
		);
		const plan = planJournalIcsImport(parsed, [], "skip");

		expect(plan.skipped).toHaveLength(1);
		expect(plan.creates).toHaveLength(0);
	});
});

describe("unescapeIcsText", () => {
	test("handles all escapes and leaves lone backslashes intact", () => {
		expect(unescapeIcsText("a\\nb\\Nc\\,d\\;e\\\\f\\x")).toBe("a\nb\nc,d;e\\f\\x");
	});
});

describe("summarizeJournalImport", () => {
	test("builds compact result copy", () => {
		expect(
			summarizeJournalImport({
				created: 2,
				updated: 1,
				skippedDuplicates: 3,
				skippedInvalid: 0,
				failed: 0,
			}),
		).toBe("Import finished — 2 created, 1 updated, 3 duplicates skipped.");
		expect(
			summarizeJournalImport({
				created: 0,
				updated: 0,
				skippedDuplicates: 0,
				skippedInvalid: 0,
				failed: 0,
			}),
		).toBe("Nothing to import.");
	});
});
