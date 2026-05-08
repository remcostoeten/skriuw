export const AI_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Flash Lite", desc: "Fastest · cheapest" },
  { id: "gemini-2.5-flash", label: "Flash", desc: "Best balance", recommended: true },
  { id: "gemini-2.5-pro", label: "Pro", desc: "Most capable" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const ALLOWED_MODEL_IDS: ReadonlySet<AiModelId> = new Set<AiModelId>(
  AI_MODELS.map((m) => m.id),
);

export const DEFAULT_AI_MODEL: AiModelId = "gemini-2.5-flash";

export const MAX_AI_CONTENT_CHARS = 50_000;

export function isAiModelId(value: string | undefined | null): value is AiModelId {
  return Boolean(value && ALLOWED_MODEL_IDS.has(value as AiModelId));
}
