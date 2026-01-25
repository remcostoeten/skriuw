import { DAILY_PROMPT_LIMIT } from "../types"

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export type RateLimitResult = {
    allowed: boolean
    promptsUsed: number
    promptsRemaining: number
    resetAt: number
}

export function checkRateLimit(promptTimestamps: number[], now: number = Date.now()): RateLimitResult {
    const cutoff = now - TWENTY_FOUR_HOURS_MS
    const recentPrompts = promptTimestamps.filter((ts) => ts > cutoff)
    const promptsUsed = recentPrompts.length
    const promptsRemaining = Math.max(0, DAILY_PROMPT_LIMIT - promptsUsed)
    const oldestRecentPrompt = recentPrompts.length > 0 ? Math.min(...recentPrompts) : now
    const resetAt = oldestRecentPrompt + TWENTY_FOUR_HOURS_MS

    return {
        allowed: promptsUsed < DAILY_PROMPT_LIMIT,
        promptsUsed,
        promptsRemaining,
        resetAt
    }
}

export function formatTimeUntilReset(resetAt: number, now: number = Date.now()): string {
    const ms = resetAt - now
    if (ms <= 0) return 'now'

    const hours = Math.floor(ms / (60 * 60 * 1000))
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

    if (hours > 0) {
        return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
}
