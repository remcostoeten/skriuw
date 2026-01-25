import type { AIProvider } from "../types"
import type { ProviderAdapter } from "../types/provider"
import { geminiProvider } from "./gemini"
import { grokProvider } from "./grok"

const providers: Record<AIProvider, ProviderAdapter> = {
    gemini: geminiProvider,
    grok: grokProvider
}

export function getProvider(name: AIProvider): ProviderAdapter {
    const provider = providers[name]
    if (!provider) {
        throw new Error(`Unknown AI provider: ${name}`)
    }
    return provider
}

export function getAllProviders(): ProviderAdapter[] {
    return Object.values(providers)
}

export { geminiProvider } from './gemini'
export { grokProvider } from './grok'
