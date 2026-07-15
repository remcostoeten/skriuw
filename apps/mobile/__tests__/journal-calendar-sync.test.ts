import { describe, expect, test } from "bun:test";
import type { JournalEntry } from "@/backend/types";
import {
	CALENDAR_SYNC_STATE_VERSION,
	journalEntryToNativeEvent,
	SKRIUW_CALENDAR_TITLE,
	syncJournalEntriesToNativeCalendar,
	type JournalCalendarAdapter,
	type JournalCalendarSyncState,
} from "@/calendar/journal-calendar-sync";

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
	return {
		id: "entry-1",
		dateKey: "2026-07-15",
		title: "A summer day",
		content: "Walked along the canal.",
		tags: ["summer", "walk"],
		mood: "great",
		createdAt: "2026-07-15T08:00:00.000Z",
		updatedAt: "2026-07-15T09:00:00.000Z",
		...overrides,
	};
}

function harness(initialState: JournalCalendarSyncState | null = null) {
	let state = initialState;
	let calendars: { id: string; title: string; allowsModifications: boolean }[] = [];
	let nativeEvents: { id: string; notes?: string | null }[] = [];
	const created: { calendarId: string; title: string }[] = [];
	const updated: string[] = [];
	const deleted: string[] = [];
	const failUpdates = new Set<string>();
	const adapter: JournalCalendarAdapter = {
		async listEventCalendars() {
			return calendars;
		},
		async listEvents() {
			return nativeEvents;
		},
		async createSkriuwCalendar() {
			calendars = [
				...calendars,
				{ id: "calendar-new", title: SKRIUW_CALENDAR_TITLE, allowsModifications: true },
			];
			return "calendar-new";
		},
		async createEvent(calendarId, input) {
			created.push({ calendarId, title: input.title });
			return `event-${created.length}`;
		},
		async updateEvent(eventId) {
			if (failUpdates.has(eventId)) throw new Error("missing event");
			updated.push(eventId);
		},
		async deleteEvent(eventId) {
			deleted.push(eventId);
		},
	};
	return {
		adapter,
		created,
		updated,
		deleted,
		failUpdates,
		setCalendars(value: typeof calendars) {
			calendars = value;
		},
		setNativeEvents(value: typeof nativeEvents) {
			nativeEvents = value;
		},
		store: {
			async load() {
				return state;
			},
			async save(next: JournalCalendarSyncState) {
				state = next;
			},
		},
		getState() {
			return state;
		},
	};
}

describe("journalEntryToNativeEvent", () => {
	test("maps an entry to a local all-day Apple Calendar event", () => {
		const event = journalEntryToNativeEvent(entry());
		expect(event).not.toBeNull();
		expect(event?.title).toBe("A summer day");
		expect(event?.allDay).toBe(true);
		expect(event?.startDate.getFullYear()).toBe(2026);
		expect(event?.startDate.getMonth()).toBe(6);
		expect(event?.startDate.getDate()).toBe(15);
		expect(event?.endDate.getDate()).toBe(16);
		expect(event?.notes).toContain("Mood: Great");
		expect(event?.notes).toContain("Tags: summer, walk");
		expect(event?.notes).toContain("Skriuw journal entry: entry-1");
	});

	test("rejects malformed or impossible dates", () => {
		expect(journalEntryToNativeEvent(entry({ dateKey: "2026-02-30" }))).toBeNull();
		expect(journalEntryToNativeEvent(entry({ dateKey: "15-07-2026" }))).toBeNull();
	});
});

describe("syncJournalEntriesToNativeCalendar", () => {
	test("creates a dedicated calendar and remembers native event ids", async () => {
		const h = harness();
		const result = await syncJournalEntriesToNativeCalendar([entry()], h.adapter, h.store);

		expect(result).toEqual({
			calendarId: "calendar-new",
			created: 1,
			updated: 0,
			deleted: 0,
			failed: 0,
		});
		expect(h.created).toEqual([{ calendarId: "calendar-new", title: "A summer day" }]);
		expect(h.getState()).toEqual({
			version: CALENDAR_SYNC_STATE_VERSION,
			calendarId: "calendar-new",
			eventIdByEntryId: { "entry-1": "event-1" },
		});
	});

	test("updates mapped events and deletes only mappings for removed entries", async () => {
		const h = harness({
			version: CALENDAR_SYNC_STATE_VERSION,
			calendarId: "calendar-1",
			eventIdByEntryId: { "entry-1": "event-1", removed: "event-old" },
		});
		h.setCalendars([
			{ id: "calendar-1", title: SKRIUW_CALENDAR_TITLE, allowsModifications: true },
		]);

		const result = await syncJournalEntriesToNativeCalendar([entry()], h.adapter, h.store);
		expect(result.updated).toBe(1);
		expect(result.deleted).toBe(1);
		expect(h.updated).toEqual(["event-1"]);
		expect(h.deleted).toEqual(["event-old"]);
		expect(h.getState()?.eventIdByEntryId).toEqual({ "entry-1": "event-1" });
	});

	test("recreates a native event that was deleted in Apple Calendar", async () => {
		const h = harness({
			version: CALENDAR_SYNC_STATE_VERSION,
			calendarId: "calendar-1",
			eventIdByEntryId: { "entry-1": "missing-event" },
		});
		h.setCalendars([
			{ id: "calendar-1", title: SKRIUW_CALENDAR_TITLE, allowsModifications: true },
		]);
		h.failUpdates.add("missing-event");

		const result = await syncJournalEntriesToNativeCalendar([entry()], h.adapter, h.store);
		expect(result.created).toBe(1);
		expect(result.updated).toBe(0);
		expect(h.getState()?.eventIdByEntryId).toEqual({ "entry-1": "event-1" });
	});

	test("reuses an existing writable Skriuw calendar", async () => {
		const h = harness();
		h.setCalendars([
			{ id: "calendar-existing", title: SKRIUW_CALENDAR_TITLE, allowsModifications: true },
		]);

		const result = await syncJournalEntriesToNativeCalendar([entry()], h.adapter, h.store);
		expect(result.calendarId).toBe("calendar-existing");
		expect(h.created[0]?.calendarId).toBe("calendar-existing");
	});

	test("recovers native identity after local sync state is cleared", async () => {
		const h = harness();
		h.setCalendars([
			{ id: "calendar-existing", title: SKRIUW_CALENDAR_TITLE, allowsModifications: true },
		]);
		h.setNativeEvents([
			{ id: "event-existing", notes: "Body\n\nSkriuw journal entry: entry-1" },
		]);

		const result = await syncJournalEntriesToNativeCalendar([entry()], h.adapter, h.store);
		expect(result.created).toBe(0);
		expect(result.updated).toBe(1);
		expect(h.updated).toEqual(["event-existing"]);
		expect(h.getState()?.eventIdByEntryId).toEqual({ "entry-1": "event-existing" });
	});
});
