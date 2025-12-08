import { describe, it, expect } from "vitest";
import { AiSettingsValidation } from "./ai-settings-validation";

describe("AiSettingsValidation", () => {
    it("validates correct gemini configuration", () => {
        const validData = {
            enabled: true,
            provider: "gemini",
            model: "gemini-2.0-flash-exp",
            userKey: "some-key",
            spellcheck: true,
        };
        const result = AiSettingsValidation.safeParse(validData);
        expect(result.success).toBe(true);
    });

    it("validates correct openrouter configuration", () => {
        const validData = {
            enabled: true,
            provider: "openrouter",
            model: "openrouter/anthropic/claude-3-haiku",
            userKey: "",
            spellcheck: false,
        };
        const result = AiSettingsValidation.safeParse(validData);
        expect(result.success).toBe(true);
    });

    it("fails on invalid provider", () => {
        const invalidData = {
            enabled: true,
            provider: "invalid-provider",
            model: "gemini-2.0-flash-exp",
            spellcheck: true,
        };
        const result = AiSettingsValidation.safeParse(invalidData);
        expect(result.success).toBe(false);
    });

    it("fails on invalid model", () => {
        const invalidData = {
            enabled: true,
            provider: "gemini",
            model: "gpt-4-turbo", // Not in our allowed list
            spellcheck: true,
        };
        const result = AiSettingsValidation.safeParse(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Invalid model selected");
        }
    });

    it("allows optional userKey", () => {
        const data = {
            enabled: true,
            provider: "gemini",
            model: "gemini-2.0-flash-exp",
            spellcheck: true,
            // userKey omitted
        };
        const result = AiSettingsValidation.safeParse(data);
        expect(result.success).toBe(true);
    });
});
