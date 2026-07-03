import type { AiAction } from "@/domain/ai/types";
import promptCatalog from "./prompts.json";

export type AiPrompt = {
	system: string;
	prompt: string;
};

export type AiPromptOptions = {
	/** Target language for translateSelection; empty/"auto" keeps the EN↔NL heuristic. */
	targetLanguage?: string;
};

export const AI_PROMPT_ACTIONS: readonly string[] = Object.keys(promptCatalog.actions);

/**
 * Validates a user-configurable translate target language: a short plain
 * language name, nothing that can smuggle extra prompt instructions.
 */
export function sanitizeTargetLanguage(value: string | undefined | null): string | null {
	const trimmed = value?.trim() ?? "";
	if (!trimmed || trimmed.toLowerCase() === "auto") return null;
	return /^[\p{L}][\p{L} '-]{1,39}$/u.test(trimmed) ? trimmed : null;
}

function translateDirective(targetLanguage: string | undefined): string {
	const language = sanitizeTargetLanguage(targetLanguage);
	if (!language) return promptCatalog.translate.auto;
	return promptCatalog.translate.target.replaceAll("{targetLanguage}", language);
}

/**
 * Builds the system + user prompt pair for an AI action from the shared
 * prompt catalog (`prompts.json`), which is the single source of truth for
 * both the web API route and the desktop Rust backend.
 */
export function buildAiPrompt(
	action: AiAction,
	content: string,
	options?: AiPromptOptions,
): AiPrompt {
	const spec = promptCatalog.actions[action];
	const user = spec.user
		.replaceAll("{matchLanguageRule}", promptCatalog.rules.matchLanguageRule)
		.replaceAll("{preserveTokensRule}", promptCatalog.rules.preserveTokensRule)
		.replaceAll("{translateDirective}", translateDirective(options?.targetLanguage))
		.replace("{content}", () => content);
	return { system: spec.system, prompt: user };
}
