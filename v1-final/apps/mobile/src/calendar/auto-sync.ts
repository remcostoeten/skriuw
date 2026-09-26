import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import type { JournalEntry } from "@/backend/types";
import { syncJournalWithAppleCalendar } from "./apple-calendar";

const DEBOUNCE_MS = 5_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

/**
 * Silent, debounced Apple Calendar sync used after journal saves when the
 * auto-sync preference is on. Never prompts: it only runs when calendar
 * permission was already granted through the manual sync button, and all
 * failures are swallowed so a save can never surface a calendar error.
 */
export function scheduleAutoCalendarSync(getEntries: () => readonly JournalEntry[]): void {
	if (Platform.OS !== "ios") return;
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		void runSilently(getEntries);
	}, DEBOUNCE_MS);
}

async function runSilently(getEntries: () => readonly JournalEntry[]): Promise<void> {
	if (running) return;
	running = true;
	try {
		const permission = await Calendar.getCalendarPermissionsAsync();
		if (permission.status !== Calendar.PermissionStatus.GRANTED) return;
		await syncJournalWithAppleCalendar(getEntries());
	} catch {
		// Auto-sync is best-effort; the manual button reports real errors.
	} finally {
		running = false;
	}
}
