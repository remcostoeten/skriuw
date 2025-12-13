/**
 * @fileoverview Environment Variable Schema Definitions
 * @description Centralized schema definitions using Zod for all environment variables.
 * Provides type-safe access and validation with helpful error messages.
 */

import { z } from 'zod'

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Database configuration schema.
 * Supports multiple database providers and configurations.
 */
export const databaseSchema = z.object({
    // PostgreSQL (primary)
    DATABASE_URL: z
        .string({
            required_error: '❌ DATABASE_URL is required',
            invalid_type_error: 'DATABASE_URL must be a string',
        })
        .url('DATABASE_URL must be a valid URL')
        .refine(
            (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
            'DATABASE_URL must be a PostgreSQL connection string'
        ),

    // Alternative PostgreSQL configurations
    POSTGRES_URL: z.string().url().optional(),
    POSTGRES_PRISMA_URL: z.string().url().optional(),
    POSTGRES_URL_NON_POOLING: z.string().url().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_HOST: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DATABASE: z.string().optional(),

    // Database provider
    DATABASE_PROVIDER: z
        .enum(['neon', 'postgres'], {
            errorMap: () => ({ message: 'DATABASE_PROVIDER must be "neon" or "postgres"' }),
        })
        .optional()
        .default('postgres'),
})

/**
 * Authentication configuration schema (Better Auth, NextAuth, etc.).
 */
export const authSchema = z.object({
    // Generic auth
    AUTH_SECRET: z
        .string()
        .min(32, { message: 'AUTH_SECRET must be at least 32 characters long' })
        .optional(),
    AUTH_URL: z.string().url().optional(),
    AUTH_TRUST_HOST: z
        .string()
        .transform((val) => val === 'true')
        .optional()
        .default('false'),

    // Better Auth
    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_URL: z.string().url().optional(),

    // NextAuth
    NEXTAUTH_SECRET: z.string().optional(),
    NEXTAUTH_URL: z.string().url().optional(),

    // OAuth providers
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
})

/**
 * AI/LLM configuration schema.
 */
export const aiSchema = z.object({
    // Google
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_BACKUP_KEY: z.string().optional(),

    // OpenAI
    OPENAI_API_KEY: z.string().optional(),

    // Anthropic
    ANTHROPIC_API_KEY: z.string().optional(),
})

/**
 * OAuth Storage configuration schema.
 * ⚠️ WARNING: These keys are required for cloud storage backup features.
 */
export const oauthStorageSchema = z.object({
    // Dropbox OAuth
    DROPBOX_CLIENT_ID: z
        .string({
            description: '⚠️ WARNING: DROPBOX_CLIENT_ID is required for Dropbox storage integration',
        })
        .optional(),
    DROPBOX_CLIENT_SECRET: z
        .string({
            description: '⚠️ WARNING: DROPBOX_CLIENT_SECRET is required for Dropbox storage integration',
        })
        .optional(),

    // Google Drive OAuth
    GOOGLE_DRIVE_CLIENT_ID: z
        .string({
            description: '⚠️ WARNING: GOOGLE_DRIVE_CLIENT_ID is required for Google Drive storage integration',
        })
        .optional(),
    GOOGLE_DRIVE_CLIENT_SECRET: z
        .string({
            description: '⚠️ WARNING: GOOGLE_DRIVE_CLIENT_SECRET is required for Google Drive storage integration',
        })
        .optional(),
})

/**
 * Other API Keys and services.
 */
export const apiKeysSchema = z.object({
    // Resend (email)
    RESEND_API_KEY: z.string().optional(),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // AWS
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
})

/**
 * Vercel-specific configuration schema.
 */
export const vercelSchema = z.object({
    VERCEL: z.string().optional(),
    VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_OIDC_TOKEN: z.string().optional(),
})

/**
 * Full server-side environment schema.
 * Includes all sensitive variables that should never be exposed to the client.
 */
export const serverSchema = z.object({
    ...databaseSchema.shape,
    ...authSchema.shape,
    ...aiSchema.shape,
    ...oauthStorageSchema.shape,
    ...apiKeysSchema.shape,
    ...vercelSchema.shape,

    // Node environment
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .optional()
        .default('development'),

    // Server configuration
    PORT: z
        .string()
        .transform(Number)
        .optional()
        .default('3000'),

    // Debug mode
    DEBUG: z
        .string()
        .transform((val) => val === 'true')
        .optional()
        .default('false'),
})

/**
 * Client-side environment schema.
 * Only includes NEXT_PUBLIC_* variables that are safe for the browser.
 */
export const clientSchema = z.object({
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_VERCEL_URL: z.string().optional(),

    // Feature Flags & Logging
    NEXT_PUBLIC_ENABLE_AUTH_LOGGING: z
        .string()
        .transform((val) => val === 'true')
        .optional()
        .default('false'),
    NEXT_PUBLIC_ENABLE_SHORTCUT_LOGGING: z
        .string()
        .transform((val) => val === 'true')
        .optional()
        .default('false'),
    NEXT_PUBLIC_ENABLE_GENERAL_LOGGING: z
        .string()
        .transform((val) => val === 'true')
        .optional()
        .default('false'),
    NEXT_PUBLIC_DISABLE_AUTO_SIGNIN: z
        .string()
        .transform((val) => val === 'true')
        .optional()
        .default('false'),
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DatabaseEnv = z.infer<typeof databaseSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type AIEnv = z.infer<typeof aiSchema>
export type OAuthStorageEnv = z.infer<typeof oauthStorageSchema>
export type APIKeysEnv = z.infer<typeof apiKeysSchema>
export type VercelEnv = z.infer<typeof vercelSchema>
export type ServerEnv = z.infer<typeof serverSchema>
export type ClientEnv = z.infer<typeof clientSchema>
