import { apiRequest } from "@/lib/storage/adapters/client-api"
import type { AIModel, AIPromptRequest, AIPromptResponse, AIProvider, AIProviderConfig, AIUsageStats } from "../types"

const AI_API_BASE = '/api/ai'

export async function getAIConfig(): Promise<AIProviderConfig | null> {
    return apiRequest<AIProviderConfig | null>(`${AI_API_BASE}/config`, {
        method: 'GET',
        credentials: 'include'
    })
}

export async function saveAIConfig(config: {
    provider: AIProvider
    model: AIModel
    basePrompt?: string
    temperature?: number
}): Promise<AIProviderConfig> {
    const result = await apiRequest<AIProviderConfig>(`${AI_API_BASE}/config`, {
        method: 'POST',
        body: JSON.stringify(config),
        credentials: 'include'
    })
    if (!result) throw new Error('Failed to save AI configuration')
    return result
}

export async function updateAIConfig(updates: Partial<{
    provider: AIProvider
    model: AIModel
    basePrompt: string | null
    temperature: number
}>): Promise<AIProviderConfig> {
    const result = await apiRequest<AIProviderConfig>(`${AI_API_BASE}/config`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        credentials: 'include'
    })
    if (!result) throw new Error('Failed to update AI configuration')
    return result
}

export async function sendPrompt(request: AIPromptRequest): Promise<AIPromptResponse> {
    const result = await apiRequest<AIPromptResponse>(`${AI_API_BASE}/prompt`, {
        method: 'POST',
        body: JSON.stringify(request),
        credentials: 'include'
    })
    if (!result) throw new Error('Failed to send prompt')
    return result
}

export async function getUsageStats(): Promise<AIUsageStats> {
    const result = await apiRequest<AIUsageStats>(`${AI_API_BASE}/usage`, {
        method: 'GET',
        credentials: 'include'
    })
    if (!result) throw new Error('Failed to get usage stats')
    return result
}

export async function testPrompt(prompt: string): Promise<AIPromptResponse> {
    const result = await apiRequest<AIPromptResponse>(`${AI_API_BASE}/prompt`, {
        method: 'POST',
        body: JSON.stringify({ prompt, isTest: true }),
        credentials: 'include'
    })
    if (!result) throw new Error('Failed to test prompt')
    return result
}
