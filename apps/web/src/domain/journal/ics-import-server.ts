import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { syncJournalLinks } from "@/domain/journal/journal-link-sync";
import {
	parseJournalIcs,
	planJournalIcsImport,
	type JournalImportMode,
	type JournalImportSummary,
} from "@/domain/journal/ics-import";

export type JournalIcsImportResult = {
	summary: JournalImportSummary;
	skipped: Array<{ summary?: string; dateKey?: string; reason: string }>;
};

/** Parses and applies one calendar upload inside a single database transaction. */
export async function importJournalIcs(
	prisma: PrismaClient,
	userId: string,
	text: string,
	mode: JournalImportMode,
): Promise<JournalIcsImportResult> {
	const parsed = parseJournalIcs(text);

	return prisma.$transaction(async (tx) => {
		const existing = await tx.journalEntry.findMany({
			where: { userId, deletedAt: null },
			select: {
				id: true,
				dateKey: true,
				calendarSourceId: true,
				calendarSourceUid: true,
			},
		});
		const plan = planJournalIcsImport(parsed, existing, mode);

		for (const event of plan.creates) {
			const entry = await tx.journalEntry.create({
				data: {
					userId,
					dateKey: event.dateKey,
					title: event.title ?? null,
					content: event.content,
					mood: event.mood ?? null,
					tags: event.tags,
					calendarSourceId: event.uid ? parsed.calendarSourceId : null,
					calendarSourceUid: event.uid ?? null,
				},
				select: { id: true, content: true, richContent: true, tags: true },
			});
			await syncJournalLinks(tx, userId, {
				id: entry.id,
				content: entry.content,
				richContent: [],
				tags: entry.tags,
			});
		}

		for (const update of plan.updates) {
			const event = update.event;
			const entry = await tx.journalEntry.update({
				where: { id: update.targetId, userId, deletedAt: null },
				data: {
					dateKey: event.dateKey,
					title: event.title ?? null,
					content: event.content,
					richContent: Prisma.DbNull,
					mood: event.mood ?? null,
					tags: event.tags,
					calendarSourceId: event.uid ? parsed.calendarSourceId : null,
					calendarSourceUid: event.uid ?? null,
				},
				select: { id: true, content: true, tags: true },
			});
			await syncJournalLinks(tx, userId, {
				id: entry.id,
				content: entry.content,
				richContent: [],
				tags: entry.tags,
			});
		}

		return {
			summary: {
				created: plan.creates.length,
				updated: plan.updates.length,
				skippedDuplicates: plan.duplicates.length,
				skippedInvalid: plan.skipped.length,
				failed: 0,
			},
			skipped: plan.skipped,
		};
	});
}
