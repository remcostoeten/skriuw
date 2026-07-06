import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/core/db";
import { checkRateLimit } from "@/lib/rate-limit";
import {
	createRawSyncToken,
	MAX_SYNC_TOKEN_NAME_LENGTH,
	readBearerToken,
	SYNC_READ_SCOPE,
	type SyncScope,
	SYNC_WRITE_SCOPE,
} from "@/domain/sync/token-utils";

export { createRawSyncToken, readBearerToken, SYNC_READ_SCOPE, SYNC_WRITE_SCOPE };

export const MAX_SYNC_TOKENS_PER_USER = 20;

type SyncTokenRecord = {
	id: string;
	name: string;
	tokenPrefix: string;
	scopes: string[];
	expiresAt: Date | null;
	revokedAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
};

export type SyncTokenSummary = {
	id: string;
	name: string;
	tokenPrefix: string;
	scopes: string[];
	expiresAt: string | null;
	revokedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
};

export type CreatedSyncToken = SyncTokenSummary & {
	token: string;
};

const SYNC_TOKEN_SELECT = {
	id: true,
	name: true,
	tokenPrefix: true,
	scopes: true,
	expiresAt: true,
	revokedAt: true,
	lastUsedAt: true,
	createdAt: true,
} as const;

function tokenHash(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function tokenPreview(token: string): string {
	return token.slice(0, 18);
}

function normalizeTokenName(name: string | undefined): string {
	const normalized = (name ?? "Desktop app").trim().replace(/\s+/g, " ");
	return (normalized || "Desktop app").slice(0, MAX_SYNC_TOKEN_NAME_LENGTH);
}

function normalizeExpiresAt(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) {
		throw new Error("Invalid token expiry.");
	}
	if (date.getTime() <= Date.now()) {
		throw new Error("Token expiry must be in the future.");
	}
	return date;
}

function toSummary(record: SyncTokenRecord): SyncTokenSummary {
	return {
		id: record.id,
		name: record.name,
		tokenPrefix: record.tokenPrefix,
		scopes: record.scopes,
		expiresAt: record.expiresAt?.toISOString() ?? null,
		revokedAt: record.revokedAt?.toISOString() ?? null,
		lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
	};
}

export async function createSyncToken(input: {
	userId: string;
	name?: string;
	expiresAt?: string | null;
	canWrite?: boolean;
}): Promise<CreatedSyncToken> {
	const activeCount = await prisma.syncToken.count({
		where: { userId: input.userId, revokedAt: null },
	});
	if (activeCount >= MAX_SYNC_TOKENS_PER_USER) {
		throw new Error(
			`You can have at most ${MAX_SYNC_TOKENS_PER_USER} active sync keys. Revoke one first.`,
		);
	}

	const token = createRawSyncToken();
	const scopes = input.canWrite ? [SYNC_READ_SCOPE, SYNC_WRITE_SCOPE] : [SYNC_READ_SCOPE];
	const record = await prisma.syncToken.create({
		data: {
			userId: input.userId,
			name: normalizeTokenName(input.name),
			tokenHash: tokenHash(token),
			tokenPrefix: tokenPreview(token),
			scopes,
			expiresAt: normalizeExpiresAt(input.expiresAt),
		},
		select: SYNC_TOKEN_SELECT,
	});

	return { ...toSummary(record), token };
}

export async function listSyncTokens(userId: string): Promise<SyncTokenSummary[]> {
	const records = await prisma.syncToken.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		select: SYNC_TOKEN_SELECT,
	});
	return records.map(toSummary);
}

export async function revokeSyncToken(userId: string, tokenId: string): Promise<void> {
	await prisma.syncToken.updateMany({
		where: { id: tokenId, userId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
}

export async function revokeAllSyncTokens(userId: string): Promise<number> {
	const result = await prisma.syncToken.updateMany({
		where: { userId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
	return result.count;
}

/**
 * Rotates a key in place: mints a fresh secret carrying the same name/scopes/
 * expiry, then revokes the old one. Callers that only have the prefix (never
 * the raw secret) use this instead of copy-pasting create+revoke, so a leaked
 * key can be replaced without losing its extension/desktop configuration.
 */
export async function rotateSyncToken(
	userId: string,
	tokenId: string,
): Promise<CreatedSyncToken | null> {
	const existing = await prisma.syncToken.findFirst({
		where: { id: tokenId, userId, revokedAt: null },
		select: { name: true, scopes: true, expiresAt: true },
	});
	if (!existing) return null;

	const token = createRawSyncToken();
	const [record] = await prisma.$transaction([
		prisma.syncToken.create({
			data: {
				userId,
				name: existing.name,
				tokenHash: tokenHash(token),
				tokenPrefix: tokenPreview(token),
				scopes: existing.scopes,
				expiresAt: existing.expiresAt,
			},
			select: SYNC_TOKEN_SELECT,
		}),
		prisma.syncToken.updateMany({
			where: { id: tokenId, userId, revokedAt: null },
			data: { revokedAt: new Date() },
		}),
	]);

	return { ...toSummary(record), token };
}

const SYNC_RATE_LIMIT_WINDOW_MS = 60_000;
const SYNC_RATE_LIMITS: Record<string, number> = {
	capture: 30,
	export: 10,
	folders: 60,
	verify: 60,
	activity: 60,
};

/** Per-token, per-operation fixed-window limit so a leaked or misbehaving key can't hammer the API. */
export async function checkSyncRateLimit(
	tokenId: string,
	operation: keyof typeof SYNC_RATE_LIMITS,
): Promise<{ allowed: boolean; remaining: number }> {
	return checkRateLimit(
		`sync:${operation}:${tokenId}`,
		SYNC_RATE_LIMITS[operation],
		SYNC_RATE_LIMIT_WINDOW_MS,
	);
}

export async function authenticateSyncBearer(
	request: Request,
	requiredScope: SyncScope = SYNC_READ_SCOPE,
	options: { updateLastUsedAt?: boolean } = {},
): Promise<{
	userId: string;
	tokenId: string;
	name: string;
	scopes: string[];
	expiresAt: Date | null;
} | null> {
	const token = readBearerToken(request);
	if (!token) return null;

	const record = await prisma.syncToken.findUnique({
		where: { tokenHash: tokenHash(token) },
		select: {
			id: true,
			name: true,
			userId: true,
			scopes: true,
			expiresAt: true,
			revokedAt: true,
		},
	});
	if (!record) return null;
	if (record.revokedAt) return null;
	if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;
	if (!record.scopes.includes(requiredScope)) return null;

	if (options.updateLastUsedAt !== false) {
		await prisma.syncToken.update({
			where: { id: record.id },
			data: { lastUsedAt: new Date() },
		});
	}

	return {
		userId: record.userId,
		tokenId: record.id,
		name: record.name,
		scopes: record.scopes,
		expiresAt: record.expiresAt,
	};
}
