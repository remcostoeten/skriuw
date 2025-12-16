/**
 * @fileoverview @skriuw/env - Unified Environment Configuration
 * @description Type-safe, validated environment variable access for the Skriuw monorepo.
 *
 * @example Server-side (API routes, server components):
 * ```typescript
 * import { env, database, auth, ai } from '@skriuw/env/server'
 *
 * const dbUrl = env.DATABASE_URL           // Validated!
 * const isNeon = database.isNeon           // Convenience getter
 * const gemini = ai.geminiKey              // AI config
 * ```
 *
 * @example Client-side (React components):
 * ```typescript
 * import { env, getAppUrl } from '@skriuw/env/client'
 *
 * const appUrl = getAppUrl()               // Auto-detects Vercel URLs
 * ```
 *
 * @module @skriuw/env
 */

// Schemas (for custom validation)
export * from './schema'

// Validation utilities
export * from './validate'

// Note: Don't re-export server/client here.
// Users should import from '@skriuw/env/server' or '@skriuw/env/client' directly
// to ensure proper tree-shaking and avoid leaking server secrets to client.
