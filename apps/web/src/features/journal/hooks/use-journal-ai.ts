"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
	callAi,
	AiRateLimitError,
	AiRequestError,
	type AiEditorHandle,
	type AiErrorCode,
} from "@/features/ai/service";
import { useAiProviderKeys } from "@/features/ai/hooks/use-ai-provider-keys";
import { listFallbackAiKeys, resolveAiKey } from "@/features/ai/lib/resolve-ai-key";
import { usePreferencesStore } from "@/features/settings/store";
import type { JournalEntry } from "../types";

export type JournalAiAction = "spellCheck" | "continueWriting";

export type JournalRateLimitPrompt = {
	action: JournalAiAction;
	exhaustedKeyIds: string[];
	message: string;
	details?: string;
	eventId?: string;
};

export type JournalAiUiError = {
	title: string;
	message: string;
	details?: string;
	code?: AiErrorCode | "unknown";
	eventId?: string;
	action: JournalAiAction;
};

const AI_ERROR_TITLES: Partial<Record<AiErrorCode, string>> = {
	authentication_required: "Authentication required",
	invalid_model: "Unsupported model",
	content_too_large: "Entry is too large",
	server_not_configured: "Server AI is not configured",
	invalid_key: "AI key failed",
	forbidden: "AI access denied",
	model_not_found: "AI model unavailable",
	provider_error: "AI provider error",
	network_error: "Network error",
	rate_limited: "AI key rate limited",
};

export type JournalAiController = {
	aiLoading: { spellCheck: boolean; continueWriting: boolean };
	aiError: JournalAiUiError | null;
	rateLimitPrompt: JournalRateLimitPrompt | null;
	availableKeysForFallback: ReturnType<typeof listFallbackAiKeys>;
	handleEditorReady: (handle: AiEditorHandle) => void;
	runAiAction: (action: JournalAiAction, keyId?: string, exhaustedIds?: string[]) => void;
	dismissAiError: () => void;
	dismissRateLimit: () => void;
};

export function useJournalAi(
	selectedDate: Date,
	entry: JournalEntry | undefined,
): JournalAiController {
	const dateKey = format(selectedDate, "yyyy-MM-dd");
	const aiHandleRef = useRef<AiEditorHandle | null>(null);
	const [aiLoading, setAiLoading] = useState({ spellCheck: false, continueWriting: false });
	const [aiError, setAiError] = useState<JournalAiUiError | null>(null);
	const [rateLimitPrompt, setRateLimitPrompt] = useState<JournalRateLimitPrompt | null>(null);

	const aiPrefs = usePreferencesStore((s) => s.ai);
	const { data: serverKeys = [] } = useAiProviderKeys();

	const aiResourceOptions = useMemo(
		() => ({
			model: aiPrefs.model,
			resourceType: "journal",
			resourceId: entry?.id,
			resourceUrl: `/app/journal?date=${encodeURIComponent(dateKey)}`,
		}),
		[aiPrefs.model, dateKey, entry?.id],
	);

	useEffect(() => {
		setAiError(null);
		setRateLimitPrompt(null);
	}, [dateKey]);

	const handleEditorReady = useCallback((handle: AiEditorHandle) => {
		aiHandleRef.current = handle;
	}, []);

	const runAiAction = useCallback(
		(action: JournalAiAction, keyId?: string, exhaustedIds: string[] = []) => {
			void (async () => {
				const editorHandle = aiHandleRef.current;
				if (!editorHandle) {
					setAiError({
						action,
						code: "unknown",
						title: "Editor is still loading",
						message: "The AI action could not start because the editor is not ready yet.",
						details: "Wait for the entry to finish loading, then try again.",
					});
					return;
				}

				const resolvedKey = resolveAiKey({
					model: aiPrefs.model,
					localKeys: aiPrefs.keys,
					activeLocalKeyId: aiPrefs.activeKeyId,
					serverKeys,
					overrideKeyId: keyId,
					exhaustedIds,
				});

				const callOptions = resolvedKey
					? {
							...aiResourceOptions,
							...(resolvedKey.source === "local"
								? { apiKey: resolvedKey.apiKey }
								: { keyId: resolvedKey.keyId }),
						}
					: aiResourceOptions;

				setAiLoading((s) => ({ ...s, [action]: true }));
				setRateLimitPrompt(null);
				setAiError(null);

				try {
					const markdown = await editorHandle.getMarkdown();
					if (!markdown.trim()) {
						setAiError({
							action,
							code: "no_content",
							title: "Nothing to send to AI",
							message: "Write some content first, then run the AI action again.",
						});
						return;
					}

					const result = await callAi(action, markdown, callOptions);
					if (!result) return;

					if (action === "spellCheck") {
						editorHandle.replaceContent(result);
					} else {
						editorHandle.continueWriting(result);
					}
				} catch (err) {
					if (err instanceof AiRateLimitError) {
						const newExhausted = resolvedKey
							? [...exhaustedIds, resolvedKey.id]
							: exhaustedIds;
						setRateLimitPrompt({
							action,
							exhaustedKeyIds: newExhausted,
							message: err.message,
							details: err.details,
							eventId: err.eventId,
						});
					} else {
						console.error(`[AI/${action}]`, err);
						if (err instanceof AiRequestError) {
							setAiError({
								action,
								code: err.code,
								eventId: err.eventId,
								title: AI_ERROR_TITLES[err.code] ?? "AI request failed",
								message: err.message,
								details: err.details,
							});
						} else {
							setAiError({
								action,
								code: "unknown",
								title: "AI request failed",
								message:
									err instanceof Error
										? err.message
										: "An unknown AI error occurred.",
								details:
									"No structured server diagnostic was returned for this failure.",
							});
						}
					}
				} finally {
					setAiLoading((s) => ({ ...s, [action]: false }));
				}
			})();
		},
		[aiPrefs.keys, aiPrefs.activeKeyId, aiPrefs.model, aiResourceOptions, serverKeys],
	);

	const availableKeysForFallback = rateLimitPrompt
		? listFallbackAiKeys({
				localKeys: aiPrefs.keys,
				serverKeys,
				exhaustedIds: rateLimitPrompt.exhaustedKeyIds,
			})
		: [];

	return {
		aiLoading,
		aiError,
		rateLimitPrompt,
		availableKeysForFallback,
		handleEditorReady,
		runAiAction,
		dismissAiError: () => setAiError(null),
		dismissRateLimit: () => setRateLimitPrompt(null),
	};
}
