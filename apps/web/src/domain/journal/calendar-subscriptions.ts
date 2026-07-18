import "server-only";

import { prisma } from "@/core/db";
import { importJournalIcs } from "@/domain/journal/ics-import-server";
import type { JournalImportMode } from "@/domain/journal/ics-import";
import { fetchIcsFromUrl, normalizeSubscriptionUrl } from "@/lib/safe-fetch-ics";

const MAX_SUBSCRIPTIONS = 5;
const DEFAULT_LABEL = "External calendar";
const SYNC_DUE_HOURS = 20;
const MAX_ERROR_LENGTH = 300;

type SubscriptionRecord = {
	id: string;
	url: string;
	label: string;
	mode: string;
	enabled: boolean;
	lastSyncAt: Date | null;
	lastSyncStatus: string | null;
	lastSyncError: string | null;
	createdAt: Date;
};

export type CalendarSubscriptionSummary = {
	id: string;
	url: string;
	label: string;
	mode: JournalImportMode;
	enabled: boolean;
	lastSyncAt: string | null;
	lastSyncStatus: string | null;
	lastSyncError: string | null;
	createdAt: string;
};

const SELECT = {
	id: true,
	url: true,
	label: true,
	mode: true,
	enabled: true,
	lastSyncAt: true,
	lastSyncStatus: true,
	lastSyncError: true,
	createdAt: true,
} as const;

function normalizeLabel(label?: string): string {
	return (label?.trim().replace(/\s+/g, " ") || DEFAULT_LABEL).slice(0, 80);
}

function normalizeMode(mode?: string): JournalImportMode {
	return mode === "update" ? "update" : "skip";
}

function toSummary(record: SubscriptionRecord): CalendarSubscriptionSummary {
	return {
		id: record.id,
		url: record.url,
		label: record.label,
		mode: normalizeMode(record.mode),
		enabled: record.enabled,
		lastSyncAt: record.lastSyncAt?.toISOString() ?? null,
		lastSyncStatus: record.lastSyncStatus,
		lastSyncError: record.lastSyncError,
		createdAt: record.createdAt.toISOString(),
	};
}

export async function listCalendarSubscriptions(
	userId: string,
): Promise<CalendarSubscriptionSummary[]> {
	const records = await prisma.calendarSubscription.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		select: SELECT,
	});
	return records.map(toSummary);
}

export async function createCalendarSubscription(
	userId: string,
	input: { url: string; label?: string; mode?: string },
): Promise<CalendarSubscriptionSummary> {
	const count = await prisma.calendarSubscription.count({ where: { userId } });
	if (count >= MAX_SUBSCRIPTIONS) {
		throw new Error(`You can have at most ${MAX_SUBSCRIPTIONS} calendar subscriptions.`);
	}
	const record = await prisma.calendarSubscription.create({
		data: {
			userId,
			url: normalizeSubscriptionUrl(input.url),
			label: normalizeLabel(input.label),
			mode: normalizeMode(input.mode),
		},
		select: SELECT,
	});
	return toSummary(record);
}

export async function updateCalendarSubscription(
	userId: string,
	id: string,
	patch: { label?: string; mode?: string; enabled?: boolean },
): Promise<CalendarSubscriptionSummary | null> {
	const existing = await prisma.calendarSubscription.findFirst({
		where: { id, userId },
		select: { id: true },
	});
	if (!existing) return null;
	const record = await prisma.calendarSubscription.update({
		where: { id },
		data: {
			...(patch.label !== undefined ? { label: normalizeLabel(patch.label) } : {}),
			...(patch.mode !== undefined ? { mode: normalizeMode(patch.mode) } : {}),
			...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
		},
		select: SELECT,
	});
	return toSummary(record);
}

export async function deleteCalendarSubscription(userId: string, id: string): Promise<void> {
	await prisma.calendarSubscription.deleteMany({ where: { id, userId } });
}

export type SubscriptionSyncOutcome = {
	id: string;
	label: string;
	status: "ok" | "error";
	created: number;
	updated: number;
	error: string | null;
};

export async function syncCalendarSubscription(subscription: {
	id: string;
	userId: string;
	url: string;
	label: string;
	mode: string;
}): Promise<SubscriptionSyncOutcome> {
	try {
		const text = await fetchIcsFromUrl(subscription.url);
		const result = await importJournalIcs(
			prisma,
			subscription.userId,
			text,
			normalizeMode(subscription.mode),
		);
		await prisma.calendarSubscription.updateMany({
			where: { id: subscription.id },
			data: { lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncError: null },
		});
		return {
			id: subscription.id,
			label: subscription.label,
			status: "ok",
			created: result.summary.created,
			updated: result.summary.updated,
			error: null,
		};
	} catch (error) {
		const message = (error instanceof Error ? error.message : "Sync failed").slice(
			0,
			MAX_ERROR_LENGTH,
		);
		await prisma.calendarSubscription.updateMany({
			where: { id: subscription.id },
			data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message },
		});
		return {
			id: subscription.id,
			label: subscription.label,
			status: "error",
			created: 0,
			updated: 0,
			error: message,
		};
	}
}

/**
 * Syncs every enabled subscription that has not synced in the last
 * ~20 hours, oldest first so an interrupted batch resumes next run.
 * One failing subscription never blocks the rest.
 */
export async function syncDueCalendarSubscriptions(options?: {
	deadlineMs?: number;
}): Promise<SubscriptionSyncOutcome[]> {
	const due = new Date(Date.now() - SYNC_DUE_HOURS * 60 * 60 * 1000);
	const startedAt = Date.now();
	const subscriptions = await prisma.calendarSubscription.findMany({
		where: {
			enabled: true,
			OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: due } }],
		},
		orderBy: [{ lastSyncAt: { sort: "asc", nulls: "first" } }],
		select: { id: true, userId: true, url: true, label: true, mode: true },
	});
	const outcomes: SubscriptionSyncOutcome[] = [];
	for (const subscription of subscriptions) {
		if (options?.deadlineMs && Date.now() - startedAt > options.deadlineMs) break;
		outcomes.push(await syncCalendarSubscription(subscription));
	}
	return outcomes;
}
