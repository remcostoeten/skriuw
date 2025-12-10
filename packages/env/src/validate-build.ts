#!/usr/bin/env tsx

/**
 * @fileoverview Build-time Environment Validation Script
 * @description Validates environment variables during build time with clear error messages.
 * Can be used as a pre-build step to ensure required environment variables are set.
 */

import { serverSchema, clientSchema } from './schema'
import { formatErrors } from './validate'
import type { ZodError } from 'zod'

interface ValidationResult {
    success: boolean
    errors?: string[]
    warnings?: string[]
}

/**
 * Validates server-side environment variables.
 */
function validateServer(): ValidationResult {
    try {
        serverSchema.parse(process.env)
        return { success: true }
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                success: false,
                errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
            }
        }
        return {
            success: false,
            errors: ['Unknown server validation error']
        }
    }
}

/**
 * Validates client-side environment variables.
 */
function validateClient(): ValidationResult {
    try {
        clientSchema.parse(process.env)
        return { success: true }
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                success: false,
                errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
            }
        }
        return {
            success: false,
            errors: ['Unknown client validation error']
        }
    }
}

/**
 * Validates both server and client environment variables.
 */
function validateAll(): ValidationResult {
    const serverResult = validateServer()
    const clientResult = validateClient()

    const errors: string[] = []
    const warnings: string[] = []

    if (!serverResult.success) {
        errors.push('Server validation failed:')
        errors.push(...(serverResult.errors || []))
    }

    if (!clientResult.success) {
        errors.push('Client validation failed:')
        errors.push(...(clientResult.errors || []))
    }

    // Add warnings for optional but recommended variables
    if (!process.env.DATABASE_URL) {
        warnings.push('DATABASE_URL is not set - database features will not work')
    }

    if (!process.env.AUTH_SECRET && !process.env.BETTER_AUTH_SECRET) {
        warnings.push('No authentication secret is set - auth features will not work')
    }

    return {
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
    }
}

/**
 * Prints validation results with appropriate formatting.
 */
function printResults(result: ValidationResult): void {
    if (result.success) {
        console.log('✅ Environment validation passed!\n')
        console.log(`📋 Build mode: ${process.env.NODE_ENV || 'development'}`)

        if (result.warnings && result.warnings.length > 0) {
            console.log('\n⚠️  Warnings:')
            result.warnings.forEach(warning => {
                console.log(`  • ${warning}`)
            })
        }

        console.log('\n🚀 Ready to build!')
        return
    }

    console.error('❌ Environment validation failed!\n')

    if (result.errors) {
        console.error('Missing or invalid environment variables:')
        result.errors.forEach(error => {
            console.error(`  • ${error}`)
        })
    }

    console.error('\n💡 To fix this:')
    console.error('1. Check your .env.local or .env file')
    console.error('2. Add the missing variables with correct values')
    console.error('3. Run the build command again\n')

    // Suggest creating an .env.example file
    console.error('📝 Example .env.local file:')
    console.error(`
# Required environment variables
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
AUTH_SECRET="your-very-long-secret-key-here-min-32-chars"
V0_API_KEY="v0_sk_your_api_key_here"

# Optional variables
NODE_ENV="development"
DEBUG="false"
PORT="3000"
`)
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🔍 Validating environment variables...\n')

    const result = validateAll()
    printResults(result)

    if (!result.success) {
        process.exit(1)
    }
}

// Export for programmatic use
export { validateAll, validateServer, validateClient }