/**
 * @fileoverview Environment Validation Utilities
 * @description Core validation logic for environment variables.
 * Provides detailed error messages and type-safe access.
 */

import { z, type ZodError, type ZodSchema } from 'zod'

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Formats Zod validation errors into readable messages.
 */
export function formatErrors(errors: ZodError): string {
    const messages = errors.errors.map((error) => {
        const path = error.path.join('.')
        return `  • ${path}: ${error.message}`
    })

    return [
        '',
        '❌ Invalid environment variables:',
        '',
        ...messages,
        '',
        '💡 Check your .env.local file or environment configuration.',
        '',
    ].join('\n')
}

/**
 * Validates environment variables against a schema.
 * Throws with detailed errors if validation fails.
 *
 * @param schema - Zod schema to validate against
 * @param env - Environment object to validate (defaults to process.env)
 * @param options - Validation options
 * @returns Validated and typed environment object
 */
export function validateEnv<T extends ZodSchema>(
    schema: T,
    env: Record<string, string | undefined> = process.env,
    options: { skipValidation?: boolean } = {}
): z.infer<T> {
    // Skip validation in certain environments (e.g., build time)
    if (options.skipValidation) {
        return env as z.infer<T>
    }

    const result = schema.safeParse(env)

    if (!result.success) {
        console.error(formatErrors(result.error))
        throw new Error('Environment validation failed')
    }

    return result.data
}

// ============================================================================
// CACHED VALIDATION
// ============================================================================

const validationCache = new Map<string, unknown>()

/**
 * Validates and caches environment variables.
 * Uses memoization to avoid re-validating on every access.
 *
 * @param key - Cache key for this validation
 * @param schema - Zod schema to validate against
 * @param env - Environment object to validate
 */
export function validateEnvCached<T extends ZodSchema>(
    key: string,
    schema: T,
    env: Record<string, string | undefined> = process.env
): z.infer<T> {
    if (validationCache.has(key)) {
        return validationCache.get(key) as z.infer<T>
    }

    const validated = validateEnv(schema, env)
    validationCache.set(key, validated)
    return validated
}

/**
 * Clears the validation cache.
 * Useful for testing.
 */
export function clearEnvCache(): void {
    validationCache.clear()
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Creates an env getter with type-safe access and defaults.
 *
 * @example
 * ```typescript
 * const env = createEnvGetter(serverSchema)
 * const dbUrl = env('DATABASE_URL') // string, validated
 * ```
 */
export function createEnvGetter<T extends ZodSchema>(
    schema: T,
    env: Record<string, string | undefined> = process.env
) {
    const validated = validateEnv(schema, env)

    return function get<K extends keyof z.infer<T>>(key: K): z.infer<T>[K] {
        return validated[key]
    }
}

/**
 * Check if running in production.
 */
export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production'
}

/**
 * Check if running in development.
 */
export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development'
}

/**
 * Check if running in test.
 */
export function isTest(): boolean {
    return process.env.NODE_ENV === 'test'
}

/**
 * Check if running on Vercel.
 */
export function isVercel(): boolean {
    return !!process.env.VERCEL
}
