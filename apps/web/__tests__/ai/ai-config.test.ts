import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateLimit } from '../../features/ai/utilities/rate-limit'
import { selectApiKey } from '../../features/ai/utilities/key-rotation'

describe('AI Rate Limiting', () => {
    it('allows requests within limit', () => {
        const now = Date.now()
        const timestamps = [now - 1000, now - 2000] // 2 requests
        const result = checkRateLimit(timestamps, now)

        expect(result.allowed).toBe(true)
        expect(result.promptsUsed).toBe(2)
        expect(result.promptsRemaining).toBe(1)
    })

    it('blocks requests exceeding limit', () => {
        const now = Date.now()
        // 3 requests within 24 hours
        const timestamps = [now - 1000, now - 2000, now - 3000]
        const result = checkRateLimit(timestamps, now)

        expect(result.allowed).toBe(false)
        expect(result.promptsUsed).toBe(3)
        expect(result.promptsRemaining).toBe(0)
    })

    it('resets after 24 hours', () => {
        const now = Date.now()
        const twentyFiveHoursAgo = now - (25 * 60 * 60 * 1000)
        const timestamps = [twentyFiveHoursAgo, twentyFiveHoursAgo - 1000, twentyFiveHoursAgo - 2000]
        const result = checkRateLimit(timestamps, now)

        expect(result.allowed).toBe(true)
        expect(result.promptsUsed).toBe(0)
        expect(result.promptsRemaining).toBe(3)
    })
})

describe('AI Key Rotation', () => {
    const mockKeys = [
        {
            id: '1',
            provider: 'gemini' as const,
            encryptedKey: 'enc-1',
            priority: 10, // Higher priority
            usageCount: 5,
            isActive: true,
            rateLimitedUntil: null,
            createdAt: 0,
            updatedAt: 0
        },
        {
            id: '2',
            provider: 'gemini' as const,
            encryptedKey: 'enc-2',
            priority: 5,
            usageCount: 0,
            isActive: true,
            rateLimitedUntil: null,
            createdAt: 0,
            updatedAt: 0
        }
    ]

    it('selects highest priority key', () => {
        const result = selectApiKey(mockKeys, 'gemini')
        expect(result.key?.id).toBe('1')
        expect(result.reason).toBe('selected')
    })

    it('skips rate-limited keys', () => {
        const now = Date.now()
        const limitedKeys = [
            { ...mockKeys[0], rateLimitedUntil: now + 5000 },
            mockKeys[1]
        ]

        const result = selectApiKey(limitedKeys, 'gemini', now)
        expect(result.key?.id).toBe('2')
    })

    it('returns error if all keys rate limited', () => {
        const now = Date.now()
        const allLimited = mockKeys.map(k => ({ ...k, rateLimitedUntil: now + 5000 }))

        const result = selectApiKey(allLimited, 'gemini', now)
        expect(result.key).toBeNull()
        expect(result.reason).toBe('all_rate_limited')
    })
})
