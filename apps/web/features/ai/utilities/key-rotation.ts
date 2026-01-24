import type { AIApiKey } from "@skriuw/db"
import type { AIProvider } from "../types"

export type KeySelectionResult = {
    key: AIApiKey | null
    reason: 'selected' | 'all_rate_limited' | 'no_keys'
}

export function selectApiKey(keys: AIApiKey[], provider: AIProvider, now: number = Date.now()): KeySelectionResult {
    const providerKeys = keys.filter((k) => k.provider === provider && k.isActive)

    if (providerKeys.length === 0) {
        return { key: null, reason: 'no_keys' }
    }

    const availableKeys = providerKeys.filter((k) => !k.rateLimitedUntil || k.rateLimitedUntil < now)

    if (availableKeys.length === 0) {
        return { key: null, reason: 'all_rate_limited' }
    }

    const sorted = [...availableKeys].sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority
        }
        return a.usageCount - b.usageCount
    })

    return { key: sorted[0], reason: 'selected' }
}

export function getNextAvailableTime(keys: AIApiKey[], provider: AIProvider): number | null {
    const providerKeys = keys.filter((k) => k.provider === provider && k.isActive)

    if (providerKeys.length === 0) {
        return null
    }

    const rateLimitedKeys = providerKeys.filter((k) => k.rateLimitedUntil && k.rateLimitedUntil > Date.now())

    if (rateLimitedKeys.length === 0) {
        return null
    }

    const times = rateLimitedKeys.map((k) => k.rateLimitedUntil!)
    return Math.min(...times)
}
