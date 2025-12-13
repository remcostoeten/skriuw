import { mock } from "bun:test";

// Native Bun mock for local env
mock.module("../env", () => ({
    env: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db',
        DATABASE_PROVIDER: 'postgres',
        AUTH_SECRET: 'test-auth-secret-min-32-chars-long-123',
        BETTER_AUTH_SECRET: 'test-better-auth-secret-min-32-chars',
        CONNECTOR_ENCRYPTION_KEY: 'test-encryption-key-min-16-chars',
        CRON_SECRET: 'test-cron-secret-min-32-chars-1234',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        NEXT_PUBLIC_ENABLE_SHORTCUT_LOGGING: 'true',
        NEXT_PUBLIC_ENABLE_GENERAL_LOGGING: 'true',
        NODE_ENV: 'test',
        DEBUG: 'true'
    },
    database: {
        url: 'postgresql://postgres:postgres@localhost:5432/test_db',
        provider: 'postgres',
        isNeon: false
    },
    auth: {
        github: {
            clientId: undefined,
            clientSecret: undefined,
            isConfigured: false
        }
    },
    ai: {
        geminiKey: undefined
    },
    isProduction: false,
    isDevelopment: false,
    isTest: true,
    isVercel: false
}));

// Also set process.env for any code bypassing the env package
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test_db'
process.env.AUTH_SECRET = 'test-auth-secret-min-32-chars-long-123'
