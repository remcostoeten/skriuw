"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import type { AiEditorHandle, AiErrorCode } from "@/features/ai/service";
import { usePreferencesStore } from "@/features/settings/store";
import {
	useAiAction,
	type AiActionController,
	type AiActionRateLimitPrompt,
	type AiActionUiError,
} from "@/features/ai/hooks/use-ai-action";
import type { JournalEntry } from "../types";

export type JournalAiAction = "spellCheck" | "continueWriting";

export type JournalRateLimitPrompt = AiActionRateLimitPrompt<JournalAiAction>;

export type JournalAiUiError = AiActionUiError<JournalAiAction>;

export type { AiErrorCode };

export type JournalAiController = AiActionController<JournalAiAction>;

const JOURNAL_AI_ACTIONS: readonly JournalAiAction[] = ["spellCheck", "continueWriting"];

export function useJournalAi(
	selectedDate: Date,
	entry: JournalEntry | undefined,
): JournalAiController {
	const dateKey = format(selectedDate, "yyyy-MM-dd");
	const aiPrefs = usePreferencesStore((s) => s.ai);

	const applyResult = useMemo(
		() => ({
			spellCheck: (result: string, editorHandle: AiEditorHandle) => {
				editorHandle.replaceContent(result);
			},
			continueWriting: (result: string, editorHandle: AiEditorHandle) => {
				editorHandle.continueWriting(result);
			},
		}),
		[],
	);

	return useAiAction<JournalAiAction>({
		actions: JOURNAL_AI_ACTIONS,
		applyResult,
		model: aiPrefs.model,
		resourceType: "journal",
		resourceId: entry?.id,
		resourceUrl: `/app/journal?date=${encodeURIComponent(dateKey)}`,
		resetKey: dateKey,
		loadingEntityLabel: "entry",
		errorTitleOverrides: { content_too_large: "Entry is too large" },
	});
}
