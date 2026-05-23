import type { AiErrorCode, AiProvider } from "@/domain/ai/types";

export type AiProviderErrorSource =
	| "auth"
	| "config"
	| "provider"
	| "rate_limit"
	| "validation"
	| "server";

export type ClassifiedProviderError = {
	code: AiErrorCode;
	source: AiProviderErrorSource;
	message: string;
	details: string;
	status: number;
	providerStatus?: number | null;
	providerMessage?: string | null;
};

type ExtractedProviderError = {
	statusCode: number | null;
	rawMessage: string;
	reason: string | null;
	providerStatus: string | null;
};

function readApiCallError(err: unknown): ExtractedProviderError {
	if (!(err instanceof Error)) {
		return {
			statusCode: null,
			rawMessage: String(err),
			reason: null,
			providerStatus: null,
		};
	}

	const apiErr = err as {
		statusCode?: number;
		status?: number;
		message: string;
		data?: {
			error?: {
				message?: string;
				status?: string;
				code?: number;
			};
		};
		responseBody?: string;
	};

	let rawMessage = apiErr.message.trim();
	let reason: string | null = null;
	let providerStatus: string | null = apiErr.data?.error?.status?.trim() ?? null;

	if (apiErr.data?.error?.message?.trim()) {
		rawMessage = apiErr.data.error.message.trim();
	}

	if (apiErr.responseBody) {
		try {
			const parsed = JSON.parse(apiErr.responseBody) as {
				error?: {
					message?: string;
					status?: string;
					details?: Array<{ reason?: string }>;
				};
			};

			if (parsed.error?.message?.trim()) {
				rawMessage = parsed.error.message.trim();
			}
			if (parsed.error?.status?.trim()) {
				providerStatus = parsed.error.status.trim();
			}
			reason =
				parsed.error?.details?.find((detail) => detail.reason?.trim())?.reason?.trim() ??
				reason;
		} catch {
			// Ignore malformed provider payloads.
		}
	}

	return {
		statusCode: apiErr.statusCode ?? apiErr.status ?? null,
		rawMessage: rawMessage || "Unknown provider error",
		reason,
		providerStatus,
	};
}

function providerLabel(provider: AiProvider): string {
	return provider === "google" ? "Gemini" : provider === "groq" ? "Groq" : provider;
}

function matchesAny(haystack: string, needles: string[]): boolean {
	return needles.some((needle) => haystack.includes(needle));
}

export function classifyAiProviderError(
	err: unknown,
	provider: AiProvider,
): ClassifiedProviderError {
	const { statusCode, rawMessage, reason, providerStatus } = readApiCallError(err);
	const label = providerLabel(provider);
	const msg = rawMessage.toLowerCase();
	const signal = `${msg} ${reason?.toLowerCase() ?? ""} ${providerStatus?.toLowerCase() ?? ""}`;

	const base = {
		providerStatus: statusCode,
		providerMessage: rawMessage,
	};

	if (
		statusCode === 429 ||
		matchesAny(signal, [
			"resource_exhausted",
			"quota",
			"rate_limit",
			"rate limit",
			"too many requests",
		])
	) {
		return {
			code: "rate_limited",
			source: "rate_limit",
			message: `The selected ${label} key is rate limited or out of quota.`,
			details: "Choose another saved key or wait for the provider quota window to reset.",
			status: 429,
			...base,
		};
	}

	if (
		statusCode === 401 ||
		matchesAny(signal, [
			"api_key_invalid",
			"api key not valid",
			"invalid_api_key",
			"invalid x-api-key",
			"unauthenticated",
			"invalid authentication",
		]) ||
		reason === "API_KEY_INVALID"
	) {
		return {
			code: "invalid_key",
			source: "provider",
			message: `${label} rejected the selected API key.`,
			details: rawMessage,
			status: 401,
			...base,
		};
	}

	if (
		statusCode === 403 ||
		matchesAny(signal, ["permission_denied", "forbidden", "access denied"])
	) {
		return {
			code: "forbidden",
			source: "provider",
			message: `${label} denied access for the selected key or model.`,
			details: rawMessage,
			status: 403,
			...base,
		};
	}

	if (
		statusCode === 404 ||
		matchesAny(signal, ["not_found", "not found", "model_not_found", "model is not supported"])
	) {
		return {
			code: "model_not_found",
			source: "provider",
			message: `${label} could not find the selected model.`,
			details: rawMessage,
			status: 404,
			...base,
		};
	}

	if (
		matchesAny(signal, [
			"safety",
			"blocked",
			"prohibited_content",
			"content filter",
			"harmful",
		])
	) {
		return {
			code: "provider_error",
			source: "provider",
			message: `${label} blocked this request.`,
			details: rawMessage,
			status: statusCode ?? 400,
			...base,
		};
	}

	if (statusCode === 503 || matchesAny(signal, ["unavailable", "overloaded", "try again"])) {
		return {
			code: "provider_error",
			source: "provider",
			message: `${label} is temporarily unavailable.`,
			details: "Wait a moment and try again.",
			status: 503,
			...base,
		};
	}

	return {
		code: "provider_error",
		source: "provider",
		message: rawMessage,
		details:
			reason || providerStatus
				? [providerStatus, reason].filter(Boolean).join(" · ")
				: "Check your API key and model in Settings -> AI.",
		status: statusCode ?? 502,
		...base,
	};
}
