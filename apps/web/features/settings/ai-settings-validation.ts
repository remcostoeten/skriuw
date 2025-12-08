import { z } from "zod";
import { AI_SETTINGS } from "./ai-settings";

// Extract valid options from settings config for stricter validation
const providerSetting = AI_SETTINGS.find((s) => s.key === "ai.provider");
const providerOptions = providerSetting?.options || ["gemini", "openrouter"];

// We can't easily extract all model options statically because they are split across multiple settings entries
// based on conditions, but we can list the known ones or just allow string for now if we want to be loose,
// or gather them all.
const geminiModelSetting = AI_SETTINGS.find(
    (s) => s.key === "ai.model" && s.defaultValue.includes("gemini")
);
const openRouterModelSetting = AI_SETTINGS.find(
    (s) => s.key === "ai.model" && s.defaultValue.includes("openrouter")
);

const geminiModels = geminiModelSetting?.options || [];
const openRouterModels = openRouterModelSetting?.options || [];
const allModels = [...geminiModels, ...openRouterModels];

export const AiSettingsValidation = z.object({
    enabled: z.boolean(),
    provider: z.enum(providerOptions as [string, ...string[]]),
    model: z.string().refine((val) => allModels.includes(val), {
        message: "Invalid model selected",
    }),
    userKey: z.string().optional(),
    spellcheck: z.boolean(),
});

export type AiSettingsFormValues = z.infer<typeof AiSettingsValidation>;
