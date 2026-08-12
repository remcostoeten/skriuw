import type { JournalEntry } from "@/backend/types";

export const SKRIUW_CALENDAR_TITLE = "Skriuw Journal";
export const CALENDAR_SYNC_STATE_VERSION = 1;

const MOOD_LABELS: Record<string, string> = {
	rough: "Rough",
	low: "Low",
	neutral: "Neutral",
	good: "Good",
	great: "Great",
};

export type NativeCalendar = {
	id: string;
	title: string;
	allowsModifications: boolean;
	source?: { id?: string; name: string; type: string };
};

export type NativeEventInput = {
	title: string;
	startDate: Date;
	endDate: Date;
	allDay: true;
	notes: string;
};

export type NativeCalendarEvent = { id: string; notes?: string | null };

export type JournalCalendarSyncState = {
	version: typeof CALENDAR_SYNC_STATE_VERSION;
	calendarId: string;
	eventIdByEntryId: Record<string, string>;
};

export type JournalCalendarAdapter = {
	listEventCalendars(): Promise<NativeCalendar[]>;
	listEvents(calendarId: string): Promise<NativeCalendarEvent[]>;
	createSkriuwCalendar(): Promise<string>;
	createEvent(calendarId: string, input: NativeEventInput): Promise<string>;
	updateEvent(eventId: string, input: NativeEventInput): Promise<void>;
	deleteEvent(eventId: string): Promise<void>;
};

export type JournalCalendarStateStore = {
	load(): Promise<JournalCalendarSyncState | null>;
	save(state: JournalCalendarSyncState): Promise<void>;
};

export type JournalCalendarSyncResult = {
	calendarId: string;
	created: number;
	updated: number;
	deleted: number;
	failed: number;
};

function dateBounds(dateKey: string): { startDate: Date; endDate: Date } | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
	if (!match) return null;
	const [, yearText, monthText, dayText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const startDate = new Date(year, month - 1, day);
	if (
		startDate.getFullYear() !== year ||
		startDate.getMonth() !== month - 1 ||
		startDate.getDate() !== day
	) {
		return null;
	}
	return { startDate, endDate: new Date(year, month - 1, day + 1) };
}

export function journalEntryToNativeEvent(entry: JournalEntry): NativeEventInput | null {
	const bounds = dateBounds(entry.dateKey);
	if (!bounds) return null;
	const title = entry.title?.trim() || `Journal — ${entry.dateKey}`;
	const metadata: string[] = [];
	if (entry.mood) metadata.push(`Mood: ${MOOD_LABELS[entry.mood] ?? entry.mood}`);
	if (entry.tags.length > 0) metadata.push(`Tags: ${entry.tags.join(", ")}`);
	const content = entry.content.trim();
	const notes = [content, ...metadata, `Skriuw journal entry: ${entry.id}`]
		.filter(Boolean)
		.join("\n\n");
	return { title, ...bounds, allDay: true, notes };
}

async function resolveCalendar(
	adapter: JournalCalendarAdapter,
	state: JournalCalendarSyncState | null,
): Promise<{ calendarId: string; eventIdByEntryId: Record<string, string> }> {
	const calendars = await adapter.listEventCalendars();
	let calendarId: string;
	let eventIdByEntryId: Record<string, string> = {};
	if (state) {
		const current = calendars.find(
			(calendar) => calendar.id === state.calendarId && calendar.allowsModifications,
		);
		if (current) {
			calendarId = current.id;
			eventIdByEntryId = { ...state.eventIdByEntryId };
		} else {
			calendarId = "";
		}
	} else {
		calendarId = "";
	}
	if (!calendarId) {
		const existing = calendars.find(
			(calendar) => calendar.title === SKRIUW_CALENDAR_TITLE && calendar.allowsModifications,
		);
		calendarId = existing?.id ?? (await adapter.createSkriuwCalendar());
	}

	// Recover identity from the marker embedded in event notes. This prevents
	// duplicates if AsyncStorage was cleared while the native calendar remained.
	try {
		for (const event of await adapter.listEvents(calendarId)) {
			const entryId = /(?:^|\n)Skriuw journal entry: ([^\n]+)/
				.exec(event.notes ?? "")?.[1]
				?.trim();
			if (entryId && !eventIdByEntryId[entryId]) eventIdByEntryId[entryId] = event.id;
		}
	} catch {
		// Persisted mappings still permit a normal sync if event enumeration fails.
	}
	return { calendarId, eventIdByEntryId };
}

/**
 * Reconciles journal entries into the dedicated native calendar. Only event IDs
 * previously created by Skriuw are updated or deleted; unrelated user events
 * and calendars are never mutated.
 */
export async function syncJournalEntriesToNativeCalendar(
	entries: readonly JournalEntry[],
	adapter: JournalCalendarAdapter,
	store: JournalCalendarStateStore,
): Promise<JournalCalendarSyncResult> {
	const stored = await store.load();
	const state =
		stored?.version === CALENDAR_SYNC_STATE_VERSION && stored.calendarId ? stored : null;
	const resolved = await resolveCalendar(adapter, state);
	const nextEventIds: Record<string, string> = {};
	let created = 0;
	let updated = 0;
	let deleted = 0;
	let failed = 0;

	for (const entry of entries) {
		const event = journalEntryToNativeEvent(entry);
		if (!event) {
			failed++;
			continue;
		}
		const existingEventId = resolved.eventIdByEntryId[entry.id];
		if (existingEventId) {
			try {
				await adapter.updateEvent(existingEventId, event);
				nextEventIds[entry.id] = existingEventId;
				updated++;
				continue;
			} catch {
				// The user may have removed the event in Apple Calendar. Recreate it.
			}
		}
		try {
			nextEventIds[entry.id] = await adapter.createEvent(resolved.calendarId, event);
			created++;
		} catch {
			failed++;
		}
	}

	const liveEntryIds = new Set(entries.map((entry) => entry.id));
	for (const [entryId, eventId] of Object.entries(resolved.eventIdByEntryId)) {
		if (liveEntryIds.has(entryId)) continue;
		try {
			await adapter.deleteEvent(eventId);
			deleted++;
		} catch {
			// Already-deleted native events are considered reconciled.
		}
	}

	await store.save({
		version: CALENDAR_SYNC_STATE_VERSION,
		calendarId: resolved.calendarId,
		eventIdByEntryId: nextEventIds,
	});
	return { calendarId: resolved.calendarId, created, updated, deleted, failed };
}
