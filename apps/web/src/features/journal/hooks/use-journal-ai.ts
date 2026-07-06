"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { AiEditorHandle, AiErrorCode, AiSelectionAction } from "@/features/ai/service";
import { usePreferencesStore } from "@/features/settings/store";
import {
	useAiAction,
	type AiActionController,
	type AiActionRateLimitPrompt,
	type AiActionUiError,
} from "@/features/ai/hooks/use-ai-action";
import type { JournalEntry } from "../types";

export type JournalAiAction =
	| "spellCheck"
	| "continueWriting"
	| "summarize"
	| "extractTasks"
	| AiSelectionAction;

export type JournalRateLimitPrompt = AiActionRateLimitPrompt<JournalAiAction>;

export type JournalAiUiError = AiActionUiError<JournalAiAction>;

export type { AiErrorCode };

export type JournalAiController = AiActionController<JournalAiAction> & {
	/** Pre-correction markdown snapshot while the spell-check revert banner is showing. */
	spellCheckRevert: string | null;
	revertSpellCheck: () => void;
	dismissSpellCheckRevert: () => void;
};

const JOURNAL_SELECTION_ACTIONS: readonly AiSelectionAction[] = [
	"fixSelection",
	"rewriteSelection",
	"shortenSelection",
	"expandSelection",
	"translateSelection",
];

const JOURNAL_AI_ACTIONS: readonly JournalAiAction[] = [
	"spellCheck",
	"continueWriting",
	"summarize",
	"extractTasks",
	...JOURNAL_SELECTION_ACTIONS,
];

function readSelectionContent(handle: AiEditorHandle): string {
	return handle.getSelectionText?.() ?? "";
}

export function useJournalAi(
	selectedDate: Date,
	entry: JournalEntry | undefined,
): JournalAiController {
	const dateKey = format(selectedDate, "yyyy-MM-dd");
	const aiPrefs = usePreferencesStore((s) => s.ai);
	const [spellCheckRevert, setSpellCheckRevert] = useState<string | null>(null);

	useEffect(() => {
		setSpellCheckRevert(null);
	}, [dateKey]);

	const applyResult = useMemo(() => {
		const applySelection = (result: string, editorHandle: AiEditorHandle) => {
			editorHandle.replaceSelection?.(result.trim());
		};
		return {
			spellCheck: (result: string, editorHandle: AiEditorHandle) => {
				// Snapshot the pre-correction markdown so the user can revert the
				// whole-entry replace from the banner.
				void (async () => {
					const previous = await editorHandle.getMarkdown();
					editorHandle.replaceContent(result);
					setSpellCheckRevert(previous);
				})();
			},
			continueWriting: (result: string, editorHandle: AiEditorHandle) => {
				editorHandle.continueWriting(result);
			},
			summarize: (result: string, editorHandle: AiEditorHandle) => {
				const trimmed = result.trim();
				if (!trimmed) return;
				editorHandle.appendMarkdown?.(`## Summary\n\n${trimmed}`);
			},
			extractTasks: (result: string, editorHandle: AiEditorHandle) => {
				const trimmed = result.trim();
				if (!trimmed || trimmed.toUpperCase() === "NONE") return;
				editorHandle.appendMarkdown?.(`## Action items\n\n${trimmed}`);
			},
			fixSelection: applySelection,
			rewriteSelection: applySelection,
			shortenSelection: applySelection,
			expandSelection: applySelection,
			translateSelection: applySelection,
		};
	}, []);

	const contentSource = useMemo(
		() =>
			Object.fromEntries(
				JOURNAL_SELECTION_ACTIONS.map((action) => [action, readSelectionContent]),
			) as Partial<Record<JournalAiAction, (handle: AiEditorHandle) => string>>,
		[],
	);

	const controller = useAiAction<JournalAiAction>({
		actions: JOURNAL_AI_ACTIONS,
		applyResult,
		contentSource,
		model: aiPrefs.model,
		resourceType: "journal",
		resourceId: entry?.id,
		resourceUrl: `/app/journal?date=${encodeURIComponent(dateKey)}`,
		resetKey: dateKey,
		loadingEntityLabel: "entry",
		errorTitleOverrides: { content_too_large: "Entry is too large" },
	});

	return {
		...controller,
		spellCheckRevert,
		revertSpellCheck: () => {
			if (spellCheckRevert !== null) {
				controller.editorHandleRef.current?.replaceContent(spellCheckRevert);
			}
			setSpellCheckRevert(null);
		},
		dismissSpellCheckRevert: () => setSpellCheckRevert(null),
	};
}
