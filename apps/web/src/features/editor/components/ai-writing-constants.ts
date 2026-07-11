import type { AiAction } from "@/features/ai/service";

export type AiWritingAction = AiAction;

export const AI_WRITING_LABELS: Record<AiWritingAction, string> = {
	continueWriting: "Continuing your writing",
	spellCheck: "Checking spelling & grammar",
	generateTitle: "Generating a title",
	summarize: "Summarizing this note",
	extractTasks: "Extracting action items",
	suggestTags: "Suggesting tags",
	fixSelection: "Fixing the selection",
	rewriteSelection: "Rewriting the selection",
	shortenSelection: "Shortening the selection",
	expandSelection: "Expanding the selection",
	translateSelection: "Translating the selection",
	customPrompt: "Running your instruction",
};
