import { NextResponse } from "next/server";
import { prisma } from "@/core/db";
import { buildJournalIcs } from "@/domain/journal/ics-export";
import { hashJournalFeedToken } from "@/domain/journal/feed-tokens";
import type { JournalEntry } from "@/domain/journal/models";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
	const { token } = await context.params;
	if (!token.startsWith("skriuw_calendar_") || token.length > 128) {
		return new NextResponse("Calendar not found.", { status: 404 });
	}

	const feed = await prisma.journalFeedToken.findUnique({
		where: { tokenHash: hashJournalFeedToken(token) },
		select: { id: true, userId: true, revokedAt: true },
	});
	if (!feed || feed.revokedAt) {
		return new NextResponse("Calendar not found.", { status: 404 });
	}

	const records = await prisma.journalEntry.findMany({
		where: { userId: feed.userId, deletedAt: null },
		orderBy: [{ dateKey: "asc" }, { id: "asc" }],
		select: {
			id: true,
			dateKey: true,
			title: true,
			content: true,
			richContent: true,
			mood: true,
			tags: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	await prisma.journalFeedToken.update({
		where: { id: feed.id },
		data: { lastUsedAt: new Date() },
	});

	const entries = records.map(
		(record): JournalEntry => ({
			id: record.id,
			dateKey: record.dateKey,
			title: record.title ?? undefined,
			content: record.content,
			richContent: (record.richContent as JournalEntry["richContent"]) ?? undefined,
			mood: (record.mood as JournalEntry["mood"]) ?? undefined,
			tags: record.tags,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		}),
	);

	return new NextResponse(buildJournalIcs(entries), {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": 'inline; filename="skriuw-journal.ics"',
			"Cache-Control": "private, no-store, max-age=0",
			"Referrer-Policy": "no-referrer",
			"X-Content-Type-Options": "nosniff",
			"X-Robots-Tag": "noindex, nofollow",
		},
	});
}
