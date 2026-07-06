import type { AiAction, AiErrorCode } from "@/domain/ai/types";
import { isTauriRuntime, tauriChannel, tauriInvoke } from "@/core/workspace-backend";
import { noop } from "@/shared/lib/noop";

export type { AiAction, AiSelectionAction, AiErrorCode } from "@/domain/ai/types";

/** Incremental applier for a streamed continuation; created before the first chunk. */
export type AiStreamApplier = {
	/** Re-applies the full accumulated markdown so far (idempotent per call). */
	update: (markdown: string) => void;
	/** Flushes any pending update and returns the ids of the blocks it inserted, for revert. */
	done: () => string[];
};

/** Imperative bridge the AI actions use to read/write the active editor. */
export type AiEditorHandle = {
	getMarkdown: () => Promise<string>;
	replaceContent: (markdown: string) => void;
	continueWriting: (markdown: string) => void;
	setTitle: (title: string) => void;
	/** Captures the current selection range and returns its plain text. */
	getSelectionText?: () => string;
	/** Replaces the range captured by the last getSelectionText call. */
	replaceSelection?: (text: string) => void;
	/** Appends markdown blocks at the end of the document. */
	appendMarkdown?: (markdown: string) => void;
	/** Starts a streamed continue-writing application; falls back to continueWriting when absent. */
	beginStreamingContinue?: () => AiStreamApplier;
	/** Starts a streamed custom-prompt application, inserting new blocks after the cursor. */
	beginStreamingCustomPrompt?: () => AiStreamApplier;
	/** Removes blocks by id — used to revert a streamed insertion. */
	deleteBlocks?: (ids: string[]) => void;
};

/** Per-request options for an AI completion (key selection, model, rate-limit attribution). */
export type AiCallOptions = {
	apiKey?: string | null;
	keyId?: string | null;
	model?: string;
	resourceType?: string;
	resourceId?: string;
	resourceUrl?: string;
	/** Target language for translateSelection; "auto"/absent keeps the EN↔NL heuristic. */
	targetLanguage?: string;
	/** Free-form user instruction for customPrompt. */
	instruction?: string;
};

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

const CONTINUE_TAIL_CHARS = 4000;

/**
 * continueWriting only needs the document tail to match voice and finish the
 * cut-off paragraph, so large notes are trimmed to their final ~4k characters
 * (snapped to a paragraph boundary) before hitting the provider.
 */
function tailForContinuation(content: string): string {
	if (content.length <= CONTINUE_TAIL_CHARS) return content;
	const tail = content.slice(-CONTINUE_TAIL_CHARS);
	const boundary = tail.indexOf("\n\n");
	return boundary > 0 && boundary < CONTINUE_TAIL_CHARS / 2 ? tail.slice(boundary + 2) : tail;
}

function contentForAction(action: AiAction, content: string): string {
	return action === "continueWriting" ? tailForContinuation(content) : content;
}

async function throwAiResponseError(res: Response): Promise<never> {
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

function buildAiRequestBody(
	action: AiAction,
	content: string,
	options?: AiCallOptions,
	stream?: boolean,
): string {
	return JSON.stringify({
		action,
		content,
		...(stream ? { stream: true } : {}),
		...(options?.apiKey ? { apiKey: options.apiKey } : {}),
		...(options?.keyId ? { keyId: options.keyId } : {}),
		...(options?.model ? { model: options.model } : {}),
		...(options?.resourceType ? { resourceType: options.resourceType } : {}),
		...(options?.resourceId ? { resourceId: options.resourceId } : {}),
		...(options?.resourceUrl ? { resourceUrl: options.resourceUrl } : {}),
		...(options?.targetLanguage ? { targetLanguage: options.targetLanguage } : {}),
		...(options?.instruction ? { instruction: options.instruction } : {}),
	});
}

function isAbortError(err: unknown): boolean {
	return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Cancels the in-flight streamed AI request, if any. There is at most one
 * stream in flight per platform at a time, so this needs no request id.
 */
export function cancelAiStream(): void {
	if (isTauriRuntime()) {
		void tauriInvoke("ai_cancel_ai_stream").catch(noop);
		return;
	}
	currentStreamAbort?.abort();
}

let currentStreamAbort: AbortController | null = null;

/**
 * Streamed variant of callAi: invokes onText with the accumulated text after
 * every chunk and resolves with the full result. On desktop the chunks arrive
 * over a Tauri channel from the local Rust backend instead of a fetch stream.
 */
export async function callAiStream(
	action: AiAction,
	content: string,
	options: AiCallOptions | undefined,
	onText: (accumulated: string) => void,
): Promise<string> {
	if (isTauriRuntime()) {
		let accumulated = "";
		const onChunk = tauriChannel<string>((chunk) => {
			accumulated += chunk;
			onText(accumulated);
		});
		try {
			return await tauriInvoke<string>("ai_complete_stream", {
				action,
				content: contentForAction(action, content),
				targetLanguage: options?.targetLanguage ?? null,
				instruction: options?.instruction ?? null,
				onChunk,
			});
		} catch (err) {
			const message = typeof err === "string" ? err : "Local AI request failed.";
			throw new AiRequestError({
				code: "unknown",
				message,
				details:
					"Open Settings → AI to choose a provider, install a local model, or add a key.",
				status: 500,
			});
		}
	}

	const controller = new AbortController();
	currentStreamAbort = controller;

	try {
		const res = await fetch("/api/ai", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: buildAiRequestBody(action, contentForAction(action, content), options, true),
			signal: controller.signal,
		});

		if (!res.ok) await throwAiResponseError(res);
		if (!res.body) {
			throw new AiRequestError({
				code: "network_error",
				message: "The AI stream could not be opened.",
				status: 500,
			});
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let accumulated = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				accumulated += decoder.decode(value, { stream: true });
				onText(accumulated);
			}
		} catch (err) {
			if (!isAbortError(err)) throw err;
		}
		accumulated += decoder.decode();
		return accumulated;
	} finally {
		if (currentStreamAbort === controller) currentStreamAbort = null;
	}
}

export async function callAi(
	action: AiAction,
	content: string,
	options?: AiCallOptions,
): Promise<string> {
	const effectiveContent = contentForAction(action, content);

	// Desktop: there is no server — route to the local Rust backend, which runs
	// the configured provider (Ollama / Groq / Gemini) from settings.json.
	if (isTauriRuntime()) {
		try {
			return await tauriInvoke<string>("ai_complete", {
				action,
				content: effectiveContent,
				targetLanguage: options?.targetLanguage ?? null,
				instruction: options?.instruction ?? null,
			});
		} catch (err) {
			const message = typeof err === "string" ? err : "Local AI request failed.";
			throw new AiRequestError({
				code: "unknown",
				message,
				details:
					"Open Settings → AI to choose a provider, install a local model, or add a key.",
				status: 500,
			});
		}
	}

	const res = await fetch("/api/ai", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: buildAiRequestBody(action, effectiveContent, options),
	});

	if (!res.ok) await throwAiResponseError(res);

	const { result } = (await res.json()) as { result: string };
	return result;
}
