/**
 * @fileoverview Environment Variable Schema Definitions
 * @description Centralized schema definitions using Zod for all environment variables.
 * Provides type-safe access and validation with helpful error messages.
 */

import { createEnv } from '@t3-oss/env-core'
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
    AUTH_SECRET: z
        .string()
        .min(32, { message: 'AUTH_SECRET must be at least 32 characters long' })
        .optional()
        .describe('Generate with: openssl rand -base64 32'),

    AUTH_TRUST_HOST: z
        .string()
        .transform((val) => val === 'true')
        .optional()
        .default('false'),

    // Better Auth
    BETTER_AUTH_SECRET: z.string().optional().describe('Generate with: openssl rand -base64 32'),
    BETTER_AUTH_URL: z.string().url().optional(),
    // OAuth providers
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

})

/**
 * AI/LLM configuration schema.
 */
export const aiSchema = z.object({
    // Encryption
    CONNECTOR_ENCRYPTION_KEY: z.string().min(16).optional().describe('Generate with: openssl rand -hex 16'),

    // Cron
    CRON_SECRET: z.string().optional().describe('Generate with: openssl rand -hex 32'),

    // Google
    GEMINI_API_KEY: z.string().optional().describe('Get from: https://aistudio.google.com/app/apikey'),
    GEMINI_BACKUP_KEY: z.string().optional(),


})

/**
 * OAuth Storage configuration schema.
 * ⚠️ WARNING: These keys are required for cloud storage backup features.
 */
export const oauthStorageSchema = z.object({
    // Dropbox OAuth
    DROPBOX_CLIENT_SECRET: z
        .string({
            description: '⚠️ WARNING: DROPBOX_CLIENT_SECRET is required for Dropbox storage integration',
        })
        .optional(),

    // Google Drive OAuth
    GOOGLE_DRIVE_CLIENT_SECRET: z
        .string({
            description: '⚠️ WARNING: GOOGLE_DRIVE_CLIENT_SECRET is required for Google Drive storage integration',
        })
        .optional(),
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

    // Public variables also needed on server for SSR and API routes
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_DROPBOX_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
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

    // OAuth Public Keys
    NEXT_PUBLIC_DROPBOX_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DatabaseEnv = z.infer<typeof databaseSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type AIEnv = z.infer<typeof aiSchema>
export type OAuthStorageEnv = z.infer<typeof oauthStorageSchema>


export type ServerEnv = z.infer<typeof serverSchema>
export type ClientEnv = z.infer<typeof clientSchema>
