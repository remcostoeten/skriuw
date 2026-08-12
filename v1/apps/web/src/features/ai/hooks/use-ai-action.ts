"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import {
	callAi,
	callAiStream,
	cancelAiStream,
	AiRateLimitError,
	AiRequestError,
	type AiAction,
	type AiEditorHandle,
	type AiErrorCode,
} from "@/features/ai/service";
import { useAiProviderKeys } from "@/features/ai/hooks/use-ai-provider-keys";
import { listFallbackAiKeys, resolveAiKey } from "@/features/ai/lib/resolve-ai-key";
import { usePreferencesStore } from "@/features/settings/store";

export type AiActionRateLimitPrompt<TAction extends AiAction> = {
	action: TAction;
	exhaustedKeyIds: string[];
	message: string;
	details?: string;
	eventId?: string;
};

export type AiActionUiError<TAction extends AiAction> = {
	title: string;
	message: string;
	details?: string;
	code?: AiErrorCode | "unknown";
	eventId?: string;
	action: TAction;
};

const DEFAULT_AI_ERROR_TITLES: Partial<Record<AiErrorCode, string>> = {
	authentication_required: "Authentication required",
	invalid_model: "Unsupported model",
	content_too_large: "Content is too large",
	server_not_configured: "Server AI is not configured",
	invalid_key: "AI key failed",
	forbidden: "AI access denied",
	model_not_found: "AI model unavailable",
	provider_error: "AI provider error",
	network_error: "Network error",
	rate_limited: "AI key rate limited",
};

export type ApplyAiActionResult = (result: string, editorHandle: AiEditorHandle) => void;

export type UseAiActionOptions<TAction extends AiAction> = {
	/** The full set of actions this consumer supports, used to seed the loading map. */
	actions: readonly TAction[];
	/**
	 * How to apply a successful AI result for each action. Actions without an
	 * entry here are treated as unavailable (the request still fires, but the
	 * result is silently dropped) — every action a consumer wires up through
	 * `runAiAction` should have a matching entry.
	 */
	applyResult: Partial<Record<TAction, ApplyAiActionResult>>;
	/**
	 * Per-action content override. Actions without an entry send the full
	 * document markdown; selection-scoped actions read the captured selection
	 * here instead.
	 */
	contentSource?: Partial<Record<TAction, (handle: AiEditorHandle) => string | Promise<string>>>;
	model: string;
	resourceType?: string;
	resourceId?: string;
	resourceUrl?: string;
	/** Clears transient error/rate-limit state whenever this value changes (e.g. file id, journal date key). */
	resetKey?: unknown;
	/** Human label used in the "editor not ready yet" message, e.g. "note body" or "entry". Defaults to "content". */
	loadingEntityLabel?: string;
	/** Overrides merged over the default AI error title map (e.g. a different content_too_large title). */
	errorTitleOverrides?: Partial<Record<AiErrorCode, string>>;
	/** Called after a streamed action finishes applying, with the ids of any blocks it inserted (for revert). */
	onStreamComplete?: (action: TAction, insertedIds: string[]) => void;
};

export type AiActionController<TAction extends AiAction> = {
	aiLoading: Record<TAction, boolean>;
	aiError: AiActionUiError<TAction> | null;
	rateLimitPrompt: AiActionRateLimitPrompt<TAction> | null;
	availableKeysForFallback: ReturnType<typeof listFallbackAiKeys>;
	handleEditorReady: (handle: AiEditorHandle) => void;
	/** The most recently registered editor handle, e.g. for callers that need to act on it outside of `runAiAction` (title sync, exports, etc.). */
	editorHandleRef: RefObject<AiEditorHandle | null>;
	runAiAction: (
		action: TAction,
		keyId?: string,
		exhaustedIds?: string[],
		instruction?: string,
	) => void;
	/** Cancels the in-flight streamed request, if any — the stream resolves with its partial result. */
	cancelAiAction: () => void;
	dismissAiError: () => void;
	dismissRateLimit: () => void;
};

function buildInitialLoadingState<TAction extends AiAction>(
	actions: readonly TAction[],
): Record<TAction, boolean> {
	const initial = {} as Record<TAction, boolean>;
	for (const action of actions) {
		initial[action] = false;
	}
	return initial;
}

/**
 * Shared AI-action runner used by both the note editor and the journal
 * editor. Resolves an AI key, calls the AI service with the note/journal
 * markdown, applies the result via the caller-provided `applyResult` map,
 * and surfaces rate-limit / error state in a shape both editors' UI already
 * expects.
 *
 * Re-entrancy: `runAiAction` no-ops if the same action is already in flight,
 * so double-firing (e.g. a fast double click) can't launch overlapping
 * requests against the same editor content.
 */
export function useAiAction<TAction extends AiAction>(
	options: UseAiActionOptions<TAction>,
): AiActionController<TAction> {
	const {
		actions,
		applyResult,
		contentSource,
		model,
		resourceType,
		resourceId,
		resourceUrl,
		resetKey,
		loadingEntityLabel = "content",
		errorTitleOverrides,
	} = options;

	const aiHandleRef = useRef<AiEditorHandle | null>(null);
	const inFlightActionsRef = useLazyRef(() => new Set<TAction>());
	const onStreamCompleteRef = useRef(options.onStreamComplete);
	onStreamCompleteRef.current = options.onStreamComplete;

	const [aiLoading, setAiLoading] = useState<Record<TAction, boolean>>(() =>
		buildInitialLoadingState(actions),
	);
	const [aiError, setAiError] = useState<AiActionUiError<TAction> | null>(null);
	const [rateLimitPrompt, setRateLimitPrompt] = useState<AiActionRateLimitPrompt<TAction> | null>(
		null,
	);

	const aiPrefs = usePreferencesStore((s) => s.ai);
	const { data: serverKeys = [] } = useAiProviderKeys();

	const translateLanguage = usePreferencesStore((s) => s.ai.translateLanguage);

	const aiResourceOptions = useMemo(
		() => ({
			model,
			resourceType,
			resourceId,
			resourceUrl,
			...(translateLanguage && translateLanguage !== "auto"
				? { targetLanguage: translateLanguage }
				: {}),
		}),
		[model, resourceType, resourceId, resourceUrl, translateLanguage],
	);

	const errorTitles = useMemo(
		() => ({ ...DEFAULT_AI_ERROR_TITLES, ...errorTitleOverrides }),
		[errorTitleOverrides],
	);

	const [prevResetKey, setPrevResetKey] = useState<unknown>(resetKey);
	if (resetKey !== prevResetKey) {
		setPrevResetKey(resetKey);
		setAiError(null);
		setRateLimitPrompt(null);
	}

	const handleEditorReady = useCallback((handle: AiEditorHandle) => {
		aiHandleRef.current = handle;
	}, []);

	const runAiAction = useCallback(
		(action: TAction, keyId?: string, exhaustedIds: string[] = [], instruction?: string) => {
			if (inFlightActionsRef.current.has(action)) return;
			inFlightActionsRef.current.add(action);

			void (async () => {
				const editorHandle = aiHandleRef.current;
				if (!editorHandle) {
					setAiError({
						action,
						code: "unknown",
						title: "Editor is still loading",
						message:
							"The AI action could not start because the editor is not ready yet.",
						details: `Wait for the ${loadingEntityLabel} to finish loading, then try again.`,
					});
					inFlightActionsRef.current.delete(action);
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

				const callOptions = {
					...(resolvedKey
						? {
								...aiResourceOptions,
								...(resolvedKey.source === "local"
									? { apiKey: resolvedKey.apiKey }
									: { keyId: resolvedKey.keyId }),
							}
						: aiResourceOptions),
					...(instruction ? { instruction } : {}),
				};

				setAiLoading((s) => ({ ...s, [action]: true }));
				setRateLimitPrompt(null);
				setAiError(null);

				try {
					const getContent = contentSource?.[action];
					const markdown = getContent
						? await getContent(editorHandle)
						: await editorHandle.getMarkdown();
					if (!markdown.trim()) {
						setAiError({
							action,
							code: "no_content",
							title: "Nothing to send to AI",
							message: getContent
								? "Select some text first, then run the AI action again."
								: "Write some content first, then run the AI action again.",
						});
						return;
					}

					const streamApplier =
						action === "continueWriting"
							? editorHandle.beginStreamingContinue?.()
							: action === "customPrompt"
								? editorHandle.beginStreamingCustomPrompt?.()
								: undefined;

					if (streamApplier) {
						try {
							const result = await callAiStream(
								action,
								markdown,
								callOptions,
								(text) => {
									streamApplier.update(text);
								},
							);
							streamApplier.update(result);
						} finally {
							const insertedIds = streamApplier.done();
							onStreamCompleteRef.current?.(action, insertedIds);
						}
						return;
					}

					const result = await callAi(action, markdown, callOptions);
					if (!result) return;

					const apply = applyResult[action];
					apply?.(result, editorHandle);
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
								title: errorTitles[err.code] ?? "AI request failed",
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
					inFlightActionsRef.current.delete(action);
				}
			})();
		},
		[
			aiPrefs.keys,
			aiPrefs.activeKeyId,
			aiPrefs.model,
			aiResourceOptions,
			applyResult,
			contentSource,
			errorTitles,
			loadingEntityLabel,
			serverKeys,
		],
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
		editorHandleRef: aiHandleRef,
		runAiAction,
		cancelAiAction: cancelAiStream,
		dismissAiError: () => setAiError(null),
		dismissRateLimit: () => setRateLimitPrompt(null),
	};
}
