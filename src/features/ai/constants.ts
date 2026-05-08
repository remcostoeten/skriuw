export const AI_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Flash Lite", desc: "Fastest · cheapest" },
  { id: "gemini-2.5-flash", label: "Flash", desc: "Best balance", recommended: true },
  { id: "gemini-2.5-pro", label: "Pro", desc: "Most capable" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const ALLOWED_MODEL_IDS: ReadonlySet<string> = new Set(AI_MODELS.map((m) => m.id));

export const DEFAULT_AI_MODEL: AiModelId = "gemini-2.5-flash";

export const MAX_AI_CONTENT_CHARS = 50_000;
