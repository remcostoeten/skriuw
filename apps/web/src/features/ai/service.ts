import type { AiAction, AiErrorCode } from "@/domain/ai/types";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend";

export type { AiAction, AiErrorCode } from "@/domain/ai/types";

export interface AiEditorHandle {
	getMarkdown: () => Promise<string>;
	replaceContent: (markdown: string) => void;
	appendContent: (markdown: string) => void;
	setTitle: (title: string) => void;
}

export interface AiCallOptions {
	apiKey?: string | null;
	keyId?: string | null;
	model?: string;
	resourceType?: string;
	resourceId?: string;
	resourceUrl?: string;
}

export class AiRateLimitError extends Error {
	readonly code = "rate_limited";
	readonly eventId?: string;
	readonly details?: string;
	constructor(message = "AI provider rate limit reached.", eventId?: string, details?: string) {
		super(message);
		this.name = "AiRateLimitError";
		this.eventId = eventId;
		this.details = details;
	}
}

export class AiRequestError extends Error {
	readonly code: AiErrorCode;
	readonly eventId?: string;
	readonly details?: string;
	readonly status: number;

	constructor({
		code,
		message,
		eventId,
		details,
		status,
	}: {
		code: AiErrorCode;
		message: string;
		eventId?: string;
		details?: string;
		status: number;
	}) {
		super(message);
		this.name = "AiRequestError";
		this.code = code;
		this.eventId = eventId;
		this.details = details;
		this.status = status;
	}
}

export async function callAi(
	action: AiAction,
	content: string,
	options?: AiCallOptions,
): Promise<string> {
	// Desktop: there is no server — route to the local Rust backend, which runs
	// the configured provider (Ollama / Groq / Gemini) from settings.json.
	if (isTauriRuntime()) {
		try {
			return await tauriInvoke<string>("ai_complete", { action, content });
		} catch (err) {
			const message = typeof err === "string" ? err : "Local AI request failed.";
			throw new AiRequestError({
				code: "unknown",
				message,
				details: "Open Settings → AI to choose a provider, install a local model, or add a key.",
				status: 500,
			});
		}
	}

	const res = await fetch("/api/ai", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			action,
			content,
			...(options?.apiKey ? { apiKey: options.apiKey } : {}),
			...(options?.keyId ? { keyId: options.keyId } : {}),
			...(options?.model ? { model: options.model } : {}),
			...(options?.resourceType ? { resourceType: options.resourceType } : {}),
			...(options?.resourceId ? { resourceId: options.resourceId } : {}),
			...(options?.resourceUrl ? { resourceUrl: options.resourceUrl } : {}),
		}),
	});

	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as {
			code?: AiErrorCode;
			error?: string;
			message?: string;
			details?: string;
			eventId?: string;
		};
		const code = data.code ?? (res.status === 429 ? "rate_limited" : "unknown");
		const message = data.message ?? data.error ?? "AI request failed";

		if (res.status === 429 || code === "rate_limited") {
			throw new AiRateLimitError(message, data.eventId, data.details);
		}

		throw new AiRequestError({
			code,
			message,
			eventId: data.eventId,
			details: data.details,
			status: res.status,
		});
	}

	const { result } = (await res.json()) as { result: string };
	return result;
}
