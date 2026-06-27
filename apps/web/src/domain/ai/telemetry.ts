import "server-only";

import crypto from "node:crypto";
import { prisma } from "@/core/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AiAction } from "@/domain/ai/types";

export type AiErrorSource = "auth" | "config" | "provider" | "rate_limit" | "validation" | "server";

export type AiTelemetryInput = {
	endpoint: "/api/ai" | "/api/ai/test-key";
	action?: AiAction | "testKey";
	model?: string | null;
	userId?: string | null;
	userEmail?: string | null;
	apiKey?: string | null;
	status?: number;
	code: string;
	source: AiErrorSource;
	message: string;
	provider?: "google" | "groq";
	providerStatus?: number | null;
	providerMessage?: string | null;
	contentLength?: number | null;
	userAgent?: string | null;
	requestContext?: Record<string, unknown>;
};

export type AiTelemetryResult = {
	eventId: string;
};

function fingerprintApiKey(apiKey: string | null | undefined): string | null {
	const trimmed = apiKey?.trim();
	if (!trimmed) return null;
	return `sha256:${crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 16)}`;
}

function redactProviderMessage(
	message: string | null | undefined,
	apiKey: string | null | undefined,
) {
	const trimmed = apiKey?.trim();
	if (!message) return null;
	if (!trimmed) return message;
	return message.split(trimmed).join("[redacted-api-key]");
}

export async function recordAiError(input: AiTelemetryInput): Promise<AiTelemetryResult> {
	const eventId = crypto.randomUUID();
	const keyFingerprint = fingerprintApiKey(input.apiKey);

	try {
		await prisma.aiErrorEvent.create({
			data: {
				id: eventId,
				userId: input.userId ?? null,
				userEmail: input.userEmail ?? null,
				endpoint: input.endpoint,
				action: input.action ?? null,
				model: input.model ?? null,
				provider: input.provider ?? "google",
				errorSource: input.source,
				errorCode: input.code,
				errorMessage: input.message,
				httpStatus: input.status ?? null,
				providerStatus: input.providerStatus ?? null,
				providerMessage: redactProviderMessage(input.providerMessage, input.apiKey),
				contentLength: input.contentLength ?? null,
				hasUserApiKey: Boolean(input.apiKey?.trim()),
				apiKeyFingerprint: keyFingerprint,
				userAgent: input.userAgent ?? null,
				requestContext: (input.requestContext ?? {}) as Prisma.InputJsonValue,
			},
		});
	} catch (err) {
		console.error("[AI/telemetry] unavailable", { eventId, error: err });
	}

	return { eventId };
}
