// apps/web/features/settings/components/AiSettingsTab.tsx
// AI Settings tab for Skriuw Settings dialog.
// Uses existing SettingsGroup component for consistent styling.

import React from "react";
import { SettingsGroup } from "./SettingsGroup";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AiSettingsValidation } from "../types"; // Assume this type exists in settings/types.ts
import { useSettings } from "../hooks/useSettings"; // hypothetical hook to read/write settings

type FormValues = {
    enabled: boolean;
    provider: string;
    model: string;
    userKey: string;
    spellcheck: boolean;
};

export const AiSettingsTab: React.FC = () => {
    const { settings, updateSetting } = useSettings();
    const defaultValues: FormValues = {
        enabled: settings["ai.enabled"] ?? false,
        provider: settings["ai.provider"] ?? "gemini",
        model: settings["ai.model"] ?? "gemini-2.0-flash-exp",
        userKey: settings["ai.user_key"] ?? "",
        spellcheck: settings["ai.features.spellcheck"] ?? true,
    };

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(AiSettingsValidation),
        defaultValues,
    });

    const onSubmit = (data: FormValues) => {
        // Persist each setting individually – the Settings system expects key/value pairs.
        updateSetting("ai.enabled", data.enabled);
        updateSetting("ai.provider", data.provider);
        updateSetting("ai.model", data.model);
        updateSetting("ai.user_key", data.userKey);
        updateSetting("ai.features.spellcheck", data.spellcheck);
    };

    const selectedProvider = watch("provider");

    // Model options per provider – can be extended later.
    const modelOptions: Record<string, string[]> = {
        gemini: ["gemini-2.0-flash-exp", "gemini-1.5-flash"],
        openrouter: ["openrouter/anthropic/claude-3-haiku", "openrouter/openai/gpt-4o"],
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <SettingsGroup title="AI Features" description="Enable AI-powered tools such as spellcheck.">
                <label className="flex items-center space-x-2">
                    <input type="checkbox" {...register("enabled")} />
                    <span>Enable AI</span>
                </label>
                {errors.enabled && <p className="text-red-500">{errors.enabled.message}</p>}
            </SettingsGroup>

            {watch("enabled") && (
                <>
                    <SettingsGroup title="Provider" description="Select the AI provider.">
                        <select {...register("provider")} className="w-full p-2 border rounded">
                            <option value="gemini">Google Gemini</option>
                            <option value="openrouter">OpenRouter (OpenAI/Anthropic)</option>
                        </select>
                        {errors.provider && <p className="text-red-500">{errors.provider.message}</p>}
                    </SettingsGroup>

                    <SettingsGroup title="Model" description="Choose the model for the selected provider.">
                        <select {...register("model")} className="w-full p-2 border rounded">
                            {modelOptions[selectedProvider]?.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                        {errors.model && <p className="text-red-500">{errors.model.message}</p>}
                    </SettingsGroup>

                    <SettingsGroup title="API Key" description="Optional custom API key – overrides system keys.">
                        <input
                            type="text"
                            placeholder="sk-..."
                            {...register("userKey")}
                            className="w-full p-2 border rounded"
                        />
                        {errors.userKey && <p className="text-red-500">{errors.userKey.message}</p>}
                    </SettingsGroup>

                    <SettingsGroup title="Spellcheck" description="Enable AI‑driven spellcheck and grammar fixing.">
                        <label className="flex items-center space-x-2">
                            <input type="checkbox" {...register("spellcheck")} />
                            <span>Enable Spellcheck</span>
                        </label>
                        {errors.spellcheck && <p className="text-red-500">{errors.spellcheck.message}</p>}
                    </SettingsGroup>
                </>
            )}

            <div className="mt-4 flex justify-end">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Save AI Settings
                </button>
            </div>
        </form>
    );
};
