import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/core/db";
import {
	createRawSyncToken,
	MAX_SYNC_TOKEN_NAME_LENGTH,
	readBearerToken,
	SYNC_READ_SCOPE,
} from "@/domain/sync/token-utils";

export { createRawSyncToken, readBearerToken, SYNC_READ_SCOPE };

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
}): Promise<CreatedSyncToken> {
	const token = createRawSyncToken();
	const record = await prisma.syncToken.create({
		data: {
			userId: input.userId,
			name: normalizeTokenName(input.name),
			tokenHash: tokenHash(token),
			tokenPrefix: tokenPreview(token),
			scopes: [SYNC_READ_SCOPE],
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

export async function authenticateSyncBearer(
	request: Request,
	requiredScope = SYNC_READ_SCOPE,
): Promise<{ userId: string } | null> {
	const token = readBearerToken(request);
	if (!token) return null;

	const record = await prisma.syncToken.findUnique({
		where: { tokenHash: tokenHash(token) },
		select: {
			id: true,
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

	await prisma.syncToken.update({
		where: { id: record.id },
		data: { lastUsedAt: new Date() },
	});

	return { userId: record.userId };
}
