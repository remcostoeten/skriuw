import type { AIProvider, AIModel, GeminiModel, GrokModel } from "../types"
import { GEMINI_MODELS, GROK_MODELS, AI_PROVIDERS } from "../types"

export interface ConfigBody {
    provider?: AIProvider
    model?: AIModel
    basePrompt?: string | null
    temperature?: number
}

export function validateConfigBody(body: unknown, isPartial = false): { success: true; data: ConfigBody } | { success: false; error: string } {
    if (!body || typeof body !== 'object') {
        return { success: false, error: 'Invalid request body' }
    }

    const result: ConfigBody = {}
    const bodyObj = body as Record<string, unknown>

    // Validate provider
    if ('provider' in bodyObj) {
        if (bodyObj.provider === null || bodyObj.provider === undefined) {
            if (!isPartial) {
                return { success: false, error: 'Provider is required' }
            }
        } else if (typeof bodyObj.provider === 'string') {
            if (!AI_PROVIDERS.includes(bodyObj.provider as AIProvider)) {
                return { success: false, error: `Invalid provider. Must be one of: ${AI_PROVIDERS.join(', ')}` }
            }
            result.provider = bodyObj.provider as AIProvider
        } else {
            return { success: false, error: 'Provider must be a string' }
        }
    } else if (!isPartial) {
        return { success: false, error: 'Provider is required' }
    }

    // Validate model
    if ('model' in bodyObj) {
        if (bodyObj.model === null || bodyObj.model === undefined) {
            if (!isPartial) {
                return { success: false, error: 'Model is required' }
            }
        } else if (typeof bodyObj.model === 'string') {
            const provider = result.provider || (bodyObj.provider as AIProvider)
            const candidateModel = bodyObj.model
            
            if (provider === 'gemini') {
                if (!GEMINI_MODELS.includes(candidateModel as GeminiModel)) {
                    return { success: false, error: `Invalid model for gemini. Must be one of: ${GEMINI_MODELS.join(', ')}` }
                }
            } else if (provider === 'grok') {
                if (!GROK_MODELS.includes(candidateModel as GrokModel)) {
                    return { success: false, error: `Invalid model for grok. Must be one of: ${GROK_MODELS.join(', ')}` }
                }
            }
            result.model = candidateModel as AIModel
        } else {
            return { success: false, error: 'Model must be a string' }
        }
    } else if (!isPartial) {
        return { success: false, error: 'Model is required' }
    }

    // Validate basePrompt
    if ('basePrompt' in bodyObj) {
        if (bodyObj.basePrompt === null || bodyObj.basePrompt === undefined) {
            result.basePrompt = null
        } else if (typeof bodyObj.basePrompt === 'string') {
            result.basePrompt = bodyObj.basePrompt
        } else {
            return { success: false, error: 'Base prompt must be a string or null' }
        }
    }

    // Validate temperature
    if ('temperature' in bodyObj) {
        if (typeof bodyObj.temperature === 'number') {
            if (bodyObj.temperature < 0 || bodyObj.temperature > 100) {
                return { success: false, error: 'Temperature must be between 0 and 100' }
            }
            result.temperature = bodyObj.temperature
        } else {
            return { success: false, error: 'Temperature must be a number between 0 and 100' }
        }
    }

    return { success: true, data: result }
}