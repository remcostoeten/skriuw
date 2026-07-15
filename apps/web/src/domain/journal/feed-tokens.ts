import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/core/db";

const MAX_ACTIVE_FEEDS = 5;
const DEFAULT_NAME = "Journal calendar";

type FeedTokenRecord = {
	id: string;
	name: string;
	tokenPrefix: string;
	revokedAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
};

export type JournalFeedTokenSummary = {
	id: string;
	name: string;
	tokenPrefix: string;
	revokedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
};

export type CreatedJournalFeedToken = JournalFeedTokenSummary & { token: string };

const SELECT = {
	id: true,
	name: true,
	tokenPrefix: true,
	revokedAt: true,
	lastUsedAt: true,
	createdAt: true,
} as const;

export function hashJournalFeedToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function createSecret(): string {
	return `skriuw_calendar_${randomBytes(32).toString("base64url")}`;
}

function normalizeName(name?: string): string {
	return (name?.trim().replace(/\s+/g, " ") || DEFAULT_NAME).slice(0, 80);
}

function toSummary(record: FeedTokenRecord): JournalFeedTokenSummary {
	return {
		id: record.id,
		name: record.name,
		tokenPrefix: record.tokenPrefix,
		revokedAt: record.revokedAt?.toISOString() ?? null,
		lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
	};
}

export async function listJournalFeedTokens(userId: string): Promise<JournalFeedTokenSummary[]> {
	const records = await prisma.journalFeedToken.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		select: SELECT,
	});
	return records.map(toSummary);
}

export async function createJournalFeedToken(
	userId: string,
	name?: string,
): Promise<CreatedJournalFeedToken> {
	const active = await prisma.journalFeedToken.count({ where: { userId, revokedAt: null } });
	if (active >= MAX_ACTIVE_FEEDS) {
		throw new Error(`You can have at most ${MAX_ACTIVE_FEEDS} active calendar links.`);
	}
	const token = createSecret();
	const record = await prisma.journalFeedToken.create({
		data: {
			userId,
			name: normalizeName(name),
			tokenHash: hashJournalFeedToken(token),
			tokenPrefix: token.slice(0, 24),
		},
		select: SELECT,
	});
	return { ...toSummary(record), token };
}

export async function revokeJournalFeedToken(userId: string, id: string): Promise<void> {
	await prisma.journalFeedToken.updateMany({
		where: { id, userId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
}

export async function rotateJournalFeedToken(
	userId: string,
	id: string,
): Promise<CreatedJournalFeedToken | null> {
	const existing = await prisma.journalFeedToken.findFirst({
		where: { id, userId, revokedAt: null },
		select: { name: true },
	});
	if (!existing) return null;
	const token = createSecret();
	const [created] = await prisma.$transaction([
		prisma.journalFeedToken.create({
			data: {
				userId,
				name: existing.name,
				tokenHash: hashJournalFeedToken(token),
				tokenPrefix: token.slice(0, 24),
			},
			select: SELECT,
		}),
		prisma.journalFeedToken.updateMany({
			where: { id, userId, revokedAt: null },
			data: { revokedAt: new Date() },
		}),
	]);
	return { ...toSummary(created), token };
}
