// apps/web/features/settings/components/AiSettingsTab.tsx
// AI Settings tab for Skriuw Settings dialog.
// Uses existing SettingsGroup component for consistent styling.

import React from "react";
import { useForm } from "react-hook-form";
import { SettingsGroup } from "./SettingsGroup";
import { useSettings } from "../use-settings";
import { AiSettingsValidation } from "../ai-settings-validation";

type FormValues = {
    enabled: boolean;
    provider: string;
    model: string;
    userKey?: string;
    spellcheck: boolean;
};



export function ActiveTab() {
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">AI Features</h3>
                <p className="text-sm text-gray-600 mb-4">Enable AI-powered tools such as spellcheck.</p>
                <label className="flex items-center space-x-2">
                    <input type="checkbox" {...register("enabled")} />
                    <span>Enable AI</span>
                </label>
                {errors.enabled && <p className="text-red-500">{errors.enabled.message}</p>}
            </div>

            {watch("enabled") && (
                <>
                    <div>
                        <h3 className="text-lg font-medium">Provider</h3>
                        <p className="text-sm text-gray-600 mb-4">Select the AI provider.</p>
                        <select {...register("provider")} className="w-full p-2 border rounded">
                            <option value="gemini">Google Gemini</option>
                            <option value="openrouter">OpenRouter (OpenAI/Anthropic)</option>
                        </select>
                        {errors.provider && <p className="text-red-500">{errors.provider.message}</p>}
                    </div>

                    <div>
                        <h3 className="text-lg font-medium">Model</h3>
                        <p className="text-sm text-gray-600 mb-4">Choose the model for the selected provider.</p>
                        <select {...register("model")} className="w-full p-2 border rounded">
                            {modelOptions[selectedProvider]?.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                        {errors.model && <p className="text-red-500">{errors.model.message}</p>}
                    </div>

                    <div>
                        <h3 className="text-lg font-medium">API Key</h3>
                        <p className="text-sm text-gray-600 mb-4">Optional custom API key – overrides system keys.</p>
                        <input
                            type="text"
                            placeholder="sk-..."
                            {...register("userKey")}
                            className="w-full p-2 border rounded"
                        />
                        {errors.userKey && <p className="text-red-500">{errors.userKey.message}</p>}
                    </div>

                    <div>
                        <h3 className="text-lg font-medium">Spellcheck</h3>
                        <p className="text-sm text-gray-600 mb-4">Enable AI‑driven spellcheck and grammar fixing.</p>
                        <label className="flex items-center space-x-2">
                            <input type="checkbox" {...register("spellcheck")} />
                            <span>Enable Spellcheck</span>
                        </label>
                        {errors.spellcheck && <p className="text-red-500">{errors.spellcheck.message}</p>}
                    </div>
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
