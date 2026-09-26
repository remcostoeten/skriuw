import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import type { JournalEntry } from "@/backend/types";
import {
	SKRIUW_CALENDAR_TITLE,
	syncJournalEntriesToNativeCalendar,
	type JournalCalendarSyncState,
} from "./journal-calendar-sync";

const STATE_KEY = "skriuw:apple-calendar-sync:v1";

export class AppleCalendarSyncError extends Error {
	constructor(
		public readonly code: "unsupported" | "permission-denied" | "unavailable",
		message: string,
	) {
		super(message);
		this.name = "AppleCalendarSyncError";
	}
}

export async function syncJournalWithAppleCalendar(entries: readonly JournalEntry[]) {
	if (Platform.OS !== "ios") {
		throw new AppleCalendarSyncError(
			"unsupported",
			"Apple Calendar sync is available on iPhone and iPad.",
		);
	}
	if (!(await Calendar.isAvailableAsync())) {
		throw new AppleCalendarSyncError("unavailable", "Apple Calendar is unavailable.");
	}
	const permission = await Calendar.requestCalendarPermissionsAsync();
	if (permission.status !== Calendar.PermissionStatus.GRANTED) {
		throw new AppleCalendarSyncError(
			"permission-denied",
			"Calendar access is off. Enable it for Skriuw in iOS Settings, then try again.",
		);
	}

	return syncJournalEntriesToNativeCalendar(
		entries,
		{
			async listEventCalendars() {
				return (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).map(
					(calendar) => ({
						id: calendar.id,
						title: calendar.title,
						allowsModifications: calendar.allowsModifications,
						source: calendar.source,
					}),
				);
			},
			async listEvents(calendarId) {
				const events = await Calendar.getEventsAsync(
					[calendarId],
					new Date(1900, 0, 1),
					new Date(2200, 0, 1),
				);
				return events.map((event) => ({ id: event.id, notes: event.notes }));
			},
			async createSkriuwCalendar() {
				const defaultCalendar = await Calendar.getDefaultCalendarAsync();
				return Calendar.createCalendarAsync({
					title: SKRIUW_CALENDAR_TITLE,
					name: "skriuw-journal",
					color: "#438a72",
					entityType: Calendar.EntityTypes.EVENT,
					sourceId: defaultCalendar.source.id,
					source: defaultCalendar.source,
					ownerAccount: "personal",
					accessLevel: Calendar.CalendarAccessLevel.OWNER,
				});
			},
			createEvent(calendarId, input) {
				return Calendar.createEventAsync(calendarId, input);
			},
			async updateEvent(eventId, input) {
				await Calendar.updateEventAsync(eventId, input);
			},
			deleteEvent(eventId) {
				return Calendar.deleteEventAsync(eventId);
			},
		},
		{
			async load() {
				const value = await AsyncStorage.getItem(STATE_KEY);
				if (!value) return null;
				try {
					return JSON.parse(value) as JournalCalendarSyncState;
				} catch {
					return null;
				}
			},
			save(state) {
				return AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
			},
		},
	);
}
