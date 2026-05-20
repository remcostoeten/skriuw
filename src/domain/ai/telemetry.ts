import "server-only";

import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/core/supabase/server-client";
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

	const payload = {
		id: eventId,
		user_id: input.userId ?? null,
		user_email: input.userEmail ?? null,
		endpoint: input.endpoint,
		action: input.action ?? null,
		model: input.model ?? null,
		provider: input.provider ?? "google",
		error_source: input.source,
		error_code: input.code,
		error_message: input.message,
		http_status: input.status ?? null,
		provider_status: input.providerStatus ?? null,
		provider_message: redactProviderMessage(input.providerMessage, input.apiKey),
		content_length: input.contentLength ?? null,
		has_user_api_key: Boolean(input.apiKey?.trim()),
		api_key_fingerprint: keyFingerprint,
		user_agent: input.userAgent ?? null,
		request_context: input.requestContext ?? {},
	};

	try {
		const admin = createSupabaseAdminClient();
		const { error } = await admin.from("ai_error_events").insert(payload);
		if (error) {
			console.error("[AI/telemetry] failed to persist", { eventId, error: error.message });
		}
	} catch (err) {
		console.error("[AI/telemetry] unavailable", { eventId, error: err });
	}

	return { eventId };
}
