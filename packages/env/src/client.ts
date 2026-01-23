import { clientSchema, type ClientEnv } from "./schema";
import { validateEnvCached } from "./validate";

// ============================================================================
// CLIENT ENVIRONMENT
// ============================================================================

/**
 * Validated client environment variables.
 * Only includes variables prefixed with NEXT_PUBLIC_*.
 *
 * @example
 * ```typescript
 * import { env } from '@skriuw/env/client'
 *
 * const appUrl = env.NEXT_PUBLIC_APP_URL
 * ```
 */
export const env: ClientEnv = validateEnvCached('client', clientSchema)

/**
 * Get the current app URL.
 * Handles Vercel preview deployments automatically.
 */
export function getAppUrl(): string {
	if (env.NEXT_PUBLIC_APP_URL) {
		return env.NEXT_PUBLIC_APP_URL
	}

	if (env.NEXT_PUBLIC_VERCEL_URL) {
		return `https://${env.NEXT_PUBLIC_VERCEL_URL}`
	}

	// Fallback for local development
	if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
		return (globalThis as typeof globalThis & { location: { origin: string } }).location.origin
	}

	return 'http://localhost:3000'
}
