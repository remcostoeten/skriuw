import "server-only";

import { prisma } from "@/core/db";

export type SyncEventOperation = "capture" | "export" | "folders";
export type SyncEventStatus = "success" | "error";

export type SyncEventSummary = {
	id: string;
	tokenId: string | null;
	operation: SyncEventOperation;
	status: SyncEventStatus;
	resourceId: string | null;
	resourceName: string | null;
	message: string | null;
	source: string | null;
	createdAt: string;
};

type SyncEventRow = {
	id: string;
	token_id: string | null;
	operation: SyncEventOperation;
	status: SyncEventStatus;
	resource_id: string | null;
	resource_name: string | null;
	message: string | null;
	source: string | null;
	created_at: Date;
};

export async function recordSyncEvent(input: {
	userId: string;
	tokenId?: string | null;
	operation: SyncEventOperation;
	status: SyncEventStatus;
	resourceId?: string | null;
	resourceName?: string | null;
	message?: string | null;
	idempotencyKey?: string | null;
	source?: string | null;
}): Promise<void> {
	await prisma.$executeRaw`
		INSERT INTO sync_events (
			user_id,
			token_id,
			operation,
			status,
			resource_id,
			resource_name,
			message,
			idempotency_key,
			source
		)
		VALUES (
			${input.userId},
			${input.tokenId ?? null}::uuid,
			${input.operation},
			${input.status},
			${input.resourceId ?? null}::uuid,
			${input.resourceName ?? null},
			${input.message ?? null},
			${input.idempotencyKey ?? null},
			${input.source ?? null}
		)
		ON CONFLICT (idempotency_key) DO NOTHING
	`;
}

export async function listSyncEvents(
	userId: string,
	limit = 25,
	tokenId?: string | null,
): Promise<SyncEventSummary[]> {
	const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
	const rows = tokenId
		? await prisma.$queryRaw<SyncEventRow[]>`
			SELECT
				id::text,
				token_id::text,
				operation,
				status,
				resource_id::text,
				resource_name,
				message,
				source,
				created_at
			FROM sync_events
			WHERE user_id = ${userId} AND token_id = ${tokenId}::uuid
			ORDER BY created_at DESC
			LIMIT ${safeLimit}
		`
		: await prisma.$queryRaw<SyncEventRow[]>`
			SELECT
				id::text,
				token_id::text,
				operation,
				status,
				resource_id::text,
				resource_name,
				message,
				source,
				created_at
			FROM sync_events
			WHERE user_id = ${userId}
			ORDER BY created_at DESC
			LIMIT ${safeLimit}
		`;

	return rows.map((row) => ({
		id: row.id,
		tokenId: row.token_id,
		operation: row.operation,
		status: row.status,
		resourceId: row.resource_id,
		resourceName: row.resource_name,
		message: row.message,
		source: row.source,
		createdAt: row.created_at.toISOString(),
	}));
}
