import type { ProviderAdapter, ProviderSendConfig } from "../types/provider"
import type { AIPromptResponse, GeminiModel } from "../types"
import { GEMINI_MODELS } from "../types"

async function callGeminiApi(
    prompt: string,
    config: ProviderSendConfig
): Promise<{ content: string; tokensUsed: number }> {
    const modelName = config.model as GeminiModel
    const fullPrompt = config.basePrompt ? `${config.basePrompt}\n\n${prompt}` : prompt

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: {
                    temperature: config.temperature / 100
                }
            })
        }
    )

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Gemini API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const tokensUsed = data.usageMetadata?.totalTokenCount || 0

    return { content, tokensUsed }
}

async function validateGeminiApiKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            { method: 'GET' }
        )
        return response.ok
    } catch {
        return false
    }
}

export const geminiProvider: ProviderAdapter = {
    name: 'gemini',

    async sendPrompt(prompt: string, config: ProviderSendConfig): Promise<AIPromptResponse> {
        const { content, tokensUsed } = await callGeminiApi(prompt, config)
        return {
            content,
            tokensUsed,
            provider: 'gemini',
            model: config.model
        }
    },

    validateApiKey: validateGeminiApiKey,

    listModels() {
        return [...GEMINI_MODELS]
    }
}
