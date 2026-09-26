import type { WorkspaceBackend } from "@/core/workspace-backend/types";
import {
	parseJournalIcs,
	planJournalIcsImport,
	type JournalImportMode,
} from "@/domain/journal/ics-import";
import { MAX_ICS_IMPORT_BYTES } from "@/domain/journal/ics-import";

const STORAGE_KEY = "skriuw.calendar.subscriptions.v1";
const MAX_SUBSCRIPTIONS = 5;
export const LOCAL_SYNC_DUE_MS = 20 * 60 * 60 * 1000;

export type LocalCalendarSubscription = {
	id: string;
	url: string;
	label: string;
	mode: JournalImportMode;
	enabled: boolean;
	lastSyncAt: string | null;
	lastSyncStatus: "ok" | "error" | null;
	lastSyncError: string | null;
	createdAt: string;
};

export function listLocalCalendarSubscriptions(): LocalCalendarSubscription[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(entry): entry is LocalCalendarSubscription =>
				typeof entry === "object" &&
				entry !== null &&
				typeof (entry as LocalCalendarSubscription).id === "string" &&
				typeof (entry as LocalCalendarSubscription).url === "string",
		);
	} catch {
		return [];
	}
}

function save(subscriptions: LocalCalendarSubscription[]): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
}

/** Client-side mirror of the server URL rules: https/webcal only, no credentials. */
export function normalizeLocalSubscriptionUrl(raw: string): string {
	const rewritten = raw.trim().replace(/^webcal:\/\//i, "https://");
	let url: URL;
	try {
		url = new URL(rewritten);
	} catch {
		throw new Error("That is not a valid URL.");
	}
	if (url.protocol !== "https:") {
		throw new Error("Only https:// (or webcal://) calendar URLs are supported.");
	}
	if (url.username || url.password) {
		throw new Error("Calendar URLs with embedded credentials are not supported.");
	}
	return url.toString();
}

export function addLocalCalendarSubscription(input: {
	url: string;
	label?: string;
	mode?: string;
}): LocalCalendarSubscription {
	const subscriptions = listLocalCalendarSubscriptions();
	if (subscriptions.length >= MAX_SUBSCRIPTIONS) {
		throw new Error(`You can have at most ${MAX_SUBSCRIPTIONS} calendar subscriptions.`);
	}
	const subscription: LocalCalendarSubscription = {
		id: crypto.randomUUID(),
		url: normalizeLocalSubscriptionUrl(input.url),
		label: (input.label?.trim() || "External calendar").slice(0, 80),
		mode: input.mode === "update" ? "update" : "skip",
		enabled: true,
		lastSyncAt: null,
		lastSyncStatus: null,
		lastSyncError: null,
		createdAt: new Date().toISOString(),
	};
	save([subscription, ...subscriptions]);
	return subscription;
}

export function patchLocalCalendarSubscription(
	id: string,
	patch: Partial<Pick<LocalCalendarSubscription, "label" | "mode" | "enabled">> &
		Partial<Pick<LocalCalendarSubscription, "lastSyncAt" | "lastSyncStatus" | "lastSyncError">>,
): void {
	save(
		listLocalCalendarSubscriptions().map((subscription) =>
			subscription.id === id ? { ...subscription, ...patch } : subscription,
		),
	);
}

export function removeLocalCalendarSubscription(id: string): void {
	save(listLocalCalendarSubscriptions().filter((subscription) => subscription.id !== id));
}

export type LocalSyncOutcome = {
	status: "ok" | "error";
	created: number;
	updated: number;
	error: string | null;
};

/**
 * Fetches one subscription through the server-side ICS proxy (iCloud/Google/
 * Outlook feeds don't send CORS headers, so a direct browser fetch always
 * fails) and applies it through the local workspace backend. Records the
 * outcome on the stored subscription.
 */
export async function syncLocalCalendarSubscription(
	backend: WorkspaceBackend,
	subscription: LocalCalendarSubscription,
): Promise<LocalSyncOutcome> {
	try {
		const response = await fetch("/api/calendar/subscriptions/fetch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: subscription.url }),
			signal: AbortSignal.timeout(15_000),
			cache: "no-store",
		});
		const payload = (await response.json().catch(() => ({}))) as {
			ics?: string;
			error?: string;
		};
		if (typeof payload.ics !== "string") {
			throw new Error(payload.error || "Could not fetch that calendar.");
		}
		if (new TextEncoder().encode(payload.ics).length > MAX_ICS_IMPORT_BYTES) {
			throw new Error("The calendar file is too large — the limit is 5 MB.");
		}
		const parsed = parseJournalIcs(payload.ics);
		const entries = (await backend.listJournalEntries?.()) ?? [];
		const plan = planJournalIcsImport(parsed, entries, subscription.mode);
		let created = 0;
		let updated = 0;
		for (const event of plan.creates) {
			await backend.createJournalEntry({
				dateKey: event.dateKey,
				title: event.title ?? null,
				content: event.content,
				tags: event.tags,
				mood: event.mood,
				calendarSourceId: event.uid ? (parsed.calendarSourceId ?? undefined) : undefined,
				calendarSourceUid: event.uid ?? undefined,
			});
			created += 1;
		}
		for (const update of plan.updates) {
			await backend.updateJournalEntry({
				id: update.targetId,
				title: update.event.title ?? null,
				content: update.event.content,
				tags: update.event.tags,
				mood: update.event.mood,
			});
			updated += 1;
		}
		patchLocalCalendarSubscription(subscription.id, {
			lastSyncAt: new Date().toISOString(),
			lastSyncStatus: "ok",
			lastSyncError: null,
		});
		return { status: "ok", created, updated, error: null };
	} catch (error) {
		const message = (error instanceof Error ? error.message : "Sync failed").slice(0, 300);
		patchLocalCalendarSubscription(subscription.id, {
			lastSyncAt: new Date().toISOString(),
			lastSyncStatus: "error",
			lastSyncError: message,
		});
		return { status: "error", created: 0, updated: 0, error: message };
	}
}
