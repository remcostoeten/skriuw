import { prisma } from "@/core/db";
import type { AiAction, AiKeySource, AiUsageLogRow, AiUsageStatus } from "@/domain/ai/types";
import {
	mapUsageRow,
	normalizeAiUsagePagination,
	resolveAiHumanAction,
} from "@/domain/ai/usage-utils";
import type { Prisma } from "@/generated/prisma/client";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AiUsageInput = {
	userId?: string | null;
	provider?: string;
	model?: string | null;
	action: AiAction | "testKey" | string;
	humanAction?: string | null;
	resourceType?: string | null;
	resourceId?: string | null;
	resourceUrl?: string | null;
	prompt?: string | null;
	status: AiUsageStatus;
	errorMessage?: string | null;
	inputTokens?: number | null;
	outputTokens?: number | null;
	totalTokens?: number | null;
	keySource?: AiKeySource;
	metadata?: Record<string, unknown>;
};

export async function recordAiUsage(input: AiUsageInput): Promise<void> {
	try {
		await prisma.aiUsageLog.create({
			data: {
				userId: input.userId ?? null,
				provider: input.provider ?? "google",
				model: input.model ?? null,
				action: input.action,
				humanAction: input.humanAction ?? resolveAiHumanAction(input.action),
				resourceType: input.resourceType ?? null,
				resourceId: input.resourceId ?? null,
				resourceUrl: input.resourceUrl ?? null,
				prompt: input.prompt ?? null,
				status: input.status,
				errorMessage: input.errorMessage ?? null,
				inputTokens: input.inputTokens ?? null,
				outputTokens: input.outputTokens ?? null,
				totalTokens: input.totalTokens ?? null,
				keySource: input.keySource ?? "unknown",
				metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
			},
		});
	} catch (error) {
		console.error("[AI/usage] failed to persist", error);
	}
}

export async function listAiUsageLogs({
	userId,
	limit,
	offset,
}: {
	userId: string;
	limit: number;
	offset: number;
}): Promise<AiUsageLogRow[]> {
	const { limit: safeLimit, offset: safeOffset } = normalizeAiUsagePagination({ limit, offset });

	const records = await prisma.aiUsageLog.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: safeLimit,
		skip: safeOffset,
	});

	return records.map((record) =>
		mapUsageRow({
			id: record.id,
			user_id: record.userId,
			provider: record.provider,
			model: record.model,
			action: record.action,
			human_action: record.humanAction,
			resource_type: record.resourceType,
			resource_id: record.resourceId,
			resource_url: record.resourceUrl,
			prompt: record.prompt,
			status: record.status as AiUsageStatus,
			error_message: record.errorMessage,
			input_tokens: record.inputTokens,
			output_tokens: record.outputTokens,
			total_tokens: record.totalTokens,
			key_source: record.keySource as AiKeySource,
			metadata: isRecord(record.metadata) ? record.metadata : null,
			created_at: record.createdAt.toISOString(),
		}),
	);
}
