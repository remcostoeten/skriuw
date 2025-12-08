/**
 * @fileoverview Server Environment Variables
 * @description Type-safe server-side environment access.
 * Use this module in API routes, server components, and server-side code.
 *
 * DO NOT import this in client-side code - it contains secrets!
 *
 * @example
 * ```typescript
 * import { env } from '@skriuw/env/server'
 *
 * const dbUrl = env.DATABASE_URL // Typed and validated!
 * ```
 */

import { serverSchema, type ServerEnv } from './schema'
import { validateEnvCached } from './validate'

// ============================================================================
// SERVER ENVIRONMENT
// ============================================================================

/**
 * Validated server environment variables.
 * Cached after first access for performance.
 *
 * @example
 * ```typescript
 * import { env } from '@skriuw/env/server'
 *
 * // Direct property access - fully typed!
 * const dbUrl = env.DATABASE_URL
 * const provider = env.DATABASE_PROVIDER
 *
 * // Optional values have proper types
 * const githubId = env.GITHUB_CLIENT_ID // string | undefined
 * ```
 */
export const env: ServerEnv = validateEnvCached('server', serverSchema)

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Database configuration.
 */
export const database = {
    get url(): string {
        return env.DATABASE_URL
    },
    get provider(): 'neon' | 'postgres' {
        return env.DATABASE_PROVIDER
    },
    get isNeon(): boolean {
        return env.DATABASE_PROVIDER === 'neon' || env.DATABASE_URL.includes('neon.tech')
    },
} as const

/**
 * Authentication configuration.
 */
export const auth = {
    github: {
        get clientId(): string | undefined {
            return env.GITHUB_CLIENT_ID
        },
        get clientSecret(): string | undefined {
            return env.GITHUB_CLIENT_SECRET
        },
        get isConfigured(): boolean {
            return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
        },
    },
    google: {
        get clientId(): string | undefined {
            return env.GOOGLE_CLIENT_ID
        },
        get clientSecret(): string | undefined {
            return env.GOOGLE_CLIENT_SECRET
        },
        get isConfigured(): boolean {
            return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
        },
    },
} as const

/**
 * AI/LLM configuration.
 */
export const ai = {
    get geminiKey(): string | undefined {
        return env.GEMINI_API_KEY || env.GEMINI_BACKUP_KEY
    },
    get openaiKey(): string | undefined {
        return env.OPENAI_API_KEY
    },
    get anthropicKey(): string | undefined {
        return env.ANTHROPIC_API_KEY
    },
} as const

// Re-export utilities
export { isProduction, isDevelopment, isTest, isVercel } from './validate'
