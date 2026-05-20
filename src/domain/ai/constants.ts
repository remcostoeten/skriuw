export type AiProvider = "google" | "groq";

export type AiModelConfig = {
	id: string;
	provider: AiProvider;
	label: string;
	desc: string;
	recommended?: boolean;
};

export const AI_MODELS: readonly AiModelConfig[] = [
	{
		id: "google.gemini-2.5-flash-lite",
		provider: "google",
		label: "Flash Lite",
		desc: "Fastest · cheapest",
	},
	{
		id: "google.gemini-2.5-flash",
		provider: "google",
		label: "Flash",
		desc: "Best balance",
		recommended: true,
	},
	{ id: "google.gemini-2.5-pro", provider: "google", label: "Pro", desc: "Most capable" },
	{
		id: "groq.llama-3.3-70b-versatile",
		provider: "groq",
		label: "Llama 3.3 70B",
		desc: "Groq · fast inference",
	},
	{
		id: "groq.llama-3.1-8b-instant",
		provider: "groq",
		label: "Llama 3.1 8B",
		desc: "Groq · ultra fast",
	},
	{ id: "groq.gemma2-9b-it", provider: "groq", label: "Gemma 2 9B", desc: "Groq · lightweight" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const ALLOWED_MODEL_IDS: ReadonlySet<AiModelId> = new Set<AiModelId>(
	AI_MODELS.map((m) => m.id),
);

export const DEFAULT_AI_MODEL: AiModelId = "google.gemini-2.5-flash";

export const ACTION_MODEL_DEFAULTS: Record<string, AiModelId> = {
	generateTitle: "google.gemini-2.5-flash",
	spellCheck: "google.gemini-2.5-flash",
	continueWriting: "google.gemini-2.5-pro",
};

export const MAX_AI_CONTENT_CHARS = 50_000;

export function isAiModelId(value: string | undefined | null): value is AiModelId {
	return Boolean(value && ALLOWED_MODEL_IDS.has(value as AiModelId));
}

export function getModelConfig(modelId: string): AiModelConfig | undefined {
	return AI_MODELS.find((m) => m.id === modelId);
}

export function getProviderFromModelId(modelId: string): AiProvider | undefined {
	return getModelConfig(modelId)?.provider;
}
