import { z } from "zod";

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Database configuration schema.
 * Supports both Neon (serverless) and standard PostgreSQL.
 */
export const databaseSchema = z.object({
	DATABASE_URL: z
		.string({
			required_error: '❌ DATABASE_URL is required',
			invalid_type_error: 'DATABASE_URL must be a string'
		})
		.url('DATABASE_URL must be a valid URL')
		.refine(
			(url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
			'DATABASE_URL must be a PostgreSQL connection string'
		),

	DATABASE_PROVIDER: z
		.enum(['neon', 'postgres'], {
			errorMap: () => ({ message: 'DATABASE_PROVIDER must be "neon" or "postgres"' })
		})
		.optional()
		.default('postgres')
})

/**
 * Authentication configuration schema (Better Auth).
 */
export const authSchema = z.object({
	GITHUB_CLIENT_ID: z.string().optional(),
	GITHUB_CLIENT_SECRET: z.string().optional(),
	GOOGLE_CLIENT_ID: z.string().optional(),
	GOOGLE_CLIENT_SECRET: z.string().optional(),
	BETTER_AUTH_SECRET: z.string().optional(),
	BETTER_AUTH_URL: z.string().url().optional()
})

/**
 * AI/LLM configuration schema.
 */
export const aiSchema = z.object({
	GEMINI_API_KEY: z.string().optional(),
	GEMINI_BACKUP_KEY: z.string().optional(),
	OPENAI_API_KEY: z.string().optional(),
	ANTHROPIC_API_KEY: z.string().optional(),
	GROK_API_KEY: z.string().optional(),
	GROK_BACKUP_KEY: z.string().optional(),
	AI_PROMPT_ENCRYPTION_KEY: z.string().optional()
})

/**
 * Vercel-specific configuration schema.
 */
export const vercelSchema = z.object({
	VERCEL: z.string().optional(),
	VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
	VERCEL_URL: z.string().optional(),
	VERCEL_OIDC_TOKEN: z.string().optional()
})

/**
 * Full server-side environment schema.
 * Includes all sensitive variables that should never be exposed to the client.
 */
export const serverSchema = z.object({
	...databaseSchema.shape,
	...authSchema.shape,
	...aiSchema.shape,
	...vercelSchema.shape,

	// Node environment
	NODE_ENV: z.enum(['development', 'test', 'production']).optional().default('development'),

	// Admin access
	ADMIN_EMAILS: z.string().optional(),

	// File uploads (UploadThing)
	UPLOADTHING_TOKEN: z.string().optional()
})

/**
 * Client-side environment schema.
 * Only includes NEXT_PUBLIC_* variables that are safe for the browser.
 */
export const clientSchema = z.object({
	NEXT_PUBLIC_APP_URL: z.string().url().optional(),
	NEXT_PUBLIC_VERCEL_URL: z.string().optional()
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DatabaseEnv = z.infer<typeof databaseSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type AIEnv = z.infer<typeof aiSchema>
export type VercelEnv = z.infer<typeof vercelSchema>
export type ServerEnv = z.infer<typeof serverSchema>
export type ClientEnv = z.infer<typeof clientSchema>
