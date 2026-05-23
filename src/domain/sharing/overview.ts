import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getAuthenticatedUser } from "@/core/db";
import { isExpired } from "./expiry";
import {
	buildSharePath,
	type TSharedNoteRow,
	type TSharedNoteStatus,
	type TSharedOverview,
	type TViewBucket,
} from "./models";

const WINDOW_DAYS = 30;

function getAppBaseUrl(): string {
	return (
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
		process.env.BETTER_AUTH_URL ??
		""
	).replace(/\/$/, "");
}

/** UTC `YYYY-MM-DD` key for a given instant. */
function dayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Inclusive list of the last `WINDOW_DAYS` UTC day keys, oldest first. */
function buildWindow(now: Date): { start: Date; keys: string[] } {
	const start = new Date(now);
	start.setUTCHours(0, 0, 0, 0);
	start.setUTCDate(start.getUTCDate() - (WINDOW_DAYS - 1));

	const keys: string[] = [];
	for (let i = 0; i < WINDOW_DAYS; i++) {
		const d = new Date(start);
		d.setUTCDate(start.getUTCDate() + i);
		keys.push(dayKey(d));
	}
	return { start, keys };
}

function deriveStatus(share: {
	revokedAt: Date | null;
	expiresAt: Date | null;
	viewOnce: boolean;
	consumedAt: Date | null;
}): TSharedNoteStatus {
	if (share.revokedAt) return "revoked";
	if (isExpired(share.expiresAt)) return "expired";
	if (share.viewOnce && share.consumedAt) return "consumed";
	return "active";
}

/**
 * Owner-facing overview of every share the user has created, with lifecycle
 * status, snapshot freshness, and recurrence metrics over the last
 * {@link WINDOW_DAYS} days. Drives the `/app/shared` page.
 */
export async function getSharedNotesOverview(): Promise<TSharedOverview> {
	const { prisma, user } = await getAuthenticatedUser();

	const shares = await prisma.noteShare.findMany({
		where: { userId: user.id },
		orderBy: { createdAt: "desc" },
		include: { note: { select: { content: true, deletedAt: true } } },
	});

	const base = getAppBaseUrl();
	const now = new Date();
	const { start, keys } = buildWindow(now);

	const empty: TSharedOverview = {
		rows: [],
		summary: {
			total: 0,
			active: 0,
			expired: 0,
			revoked: 0,
			consumed: 0,
			totalViews: 0,
			windowDays: WINDOW_DAYS,
		},
	};
	if (shares.length === 0) return empty;

	const shareIds = shares.map((s) => s.id);

	// Window events (for the daily timeline + unique viewers) and all-time
	// first-view, fetched separately so the timeline stays bounded.
	//
	// Best-effort: on a deployment where the migration hasn't been applied yet
	// the view-log table won't exist. Rather than break the whole page, fall
	// back to empty recurrence — shares still render with their authoritative
	// totals (view_count, last_viewed_at).
	type WindowView = { shareId: string; viewedAt: Date; viewerHash: string };
	type FirstView = { shareId: string; _min: { viewedAt: Date | null } };
	let windowViews: WindowView[] = [];
	let firstViews: FirstView[] = [];
	try {
		[windowViews, firstViews] = await Promise.all([
			prisma.noteShareView.findMany({
				where: { shareId: { in: shareIds }, viewedAt: { gte: start } },
				select: { shareId: true, viewedAt: true, viewerHash: true },
			}),
			prisma.noteShareView.groupBy({
				by: ["shareId"],
				where: { shareId: { in: shareIds } },
				_min: { viewedAt: true },
			}),
		]);
	} catch (err) {
		// Only suppress "table does not exist" errors during migrations;
		// re-throw all other DB/runtime errors to surface real issues.
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === "P2021"
		) {
			// view-log unavailable — recurrence metrics degrade to empty
		} else {
			throw err;
		}
	}

	const firstViewedByShare = new Map<string, Date | null>(
		firstViews.map((f) => [f.shareId, f._min.viewedAt]),
	);

	// share id → (day key → count) and share id → set of viewer hashes
	const countsByShare = new Map<string, Map<string, number>>();
	const uniqueByShare = new Map<string, Set<string>>();
	for (const v of windowViews) {
		const day = dayKey(v.viewedAt);
		let counts = countsByShare.get(v.shareId);
		if (!counts) {
			counts = new Map();
			countsByShare.set(v.shareId, counts);
		}
		counts.set(day, (counts.get(day) ?? 0) + 1);

		let uniques = uniqueByShare.get(v.shareId);
		if (!uniques) {
			uniques = new Set();
			uniqueByShare.set(v.shareId, uniques);
		}
		uniques.add(v.viewerHash);
	}

	const rows: TSharedNoteRow[] = shares.map((share) => {
		const counts = countsByShare.get(share.id);
		const timeline: TViewBucket[] = keys.map((date) => ({
			date,
			count: counts?.get(date) ?? 0,
		}));
		const peak = timeline.reduce<TViewBucket | null>(
			(best, b) => (b.count > 0 && (!best || b.count > best.count) ? b : best),
			null,
		);
		const windowTotal = timeline.reduce((sum, b) => sum + b.count, 0);
		const firstViewedAt = firstViewedByShare.get(share.id) ?? null;
		const path = buildSharePath(share.token);

		return {
			noteId: share.noteId,
			token: share.token,
			path,
			url: base ? `${base}${path}` : path,
			name: share.name,
			status: deriveStatus(share),
			hasPassword: Boolean(share.passwordHash),
			viewOnce: share.viewOnce,
			authorName: share.authorName,
			isStale: share.note ? share.note.content !== share.content : false,
			noteDeleted: share.note?.deletedAt != null,
			createdAt: share.createdAt.toISOString(),
			expiresAt: share.expiresAt?.toISOString() ?? null,
			lastViewedAt: share.lastViewedAt?.toISOString() ?? null,
			totalViews: share.viewCount,
			windowViews: windowTotal,
			uniqueViewers: uniqueByShare.get(share.id)?.size ?? 0,
			firstViewedAt: firstViewedAt?.toISOString() ?? null,
			activeDays: timeline.filter((b) => b.count > 0).length,
			timeline,
			peak,
		};
	});

	const summary = rows.reduce(
		(acc, row) => {
			acc.total += 1;
			acc[row.status] += 1;
			acc.totalViews += row.totalViews;
			return acc;
		},
		{
			total: 0,
			active: 0,
			expired: 0,
			revoked: 0,
			consumed: 0,
			totalViews: 0,
			windowDays: WINDOW_DAYS,
		},
	);

	return { rows, summary };
}
