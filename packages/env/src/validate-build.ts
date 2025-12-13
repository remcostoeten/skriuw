#!/usr/bin/env tsx

/**
 * @fileoverview Build-time Environment Validation Script
 * @description Validates environment variables during build time with clear error messages.
 * Can be used as a pre-build step to ensure required environment variables are set.
 * Supports checking for improper process.env usage with --check-env-usage flag.
 */

import { serverSchema, clientSchema } from './schema'
import { formatErrors } from './validate'
import { ZodError } from 'zod'
import { glob } from 'glob'
import { readFile } from 'fs/promises'
import { relative, resolve } from 'path'
import pc from 'picocolors'
import dotenv from 'dotenv'

// Load environment variables from root if not already set
// Try loading from project root (assuming monorepo structure)
dotenv.config({ path: resolve(process.cwd(), '../../.env') })
// Also try loading from current directory as fallback or override
dotenv.config()

interface ValidationResult {
	success: boolean
	errors?: string[]
	warnings?: string[]
}

/**
 * Scans for improper process.env usage in TypeScript files.
 */
async function scanProcessEnvUsage(): Promise<string[]> {
	const warnings: string[] = []
	const files = await glob('**/*.{ts,tsx}', {
		ignore: ['node_modules/**', 'dist/**', '.next/**', 'packages/*/dist/**']
	})

	for (const file of files) {
		try {
			const content = await readFile(file, 'utf-8')
			const lines = content.split('\n')
			lines.forEach((line, index) => {
				const trimmed = line.trim()
				if (
					trimmed.includes('process.env') &&
					!trimmed.includes('@skriuw/env') &&
					!trimmed.includes('import') &&
					!trimmed.includes('from')
				) {
					// Simple check: if process.env is used without importing from env
					warnings.push(
						`${pc.cyan(relative(process.cwd(), file))}:${pc.yellow(String(index + 1))}: ${pc.dim(trimmed)}`
					)
				}
			})
		} catch (error) {
			// Skip files that can't be read
		}
	}

	return warnings
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
				errors: error.errors.map(
					(err) =>
						`${pc.bold(err.path.join('.'))}: ${pc.red(err.message)}`
				)
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
				errors: error.errors.map(
					(err) =>
						`${pc.bold(err.path.join('.'))}: ${pc.red(err.message)}`
				)
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
async function validateAll(
	checkEnvUsage: boolean = false
): Promise<ValidationResult> {
	const serverResult = validateServer()
	const clientResult = validateClient()

	const errors: string[] = []
	const warnings: string[] = []

	if (!serverResult.success) {
		errors.push(pc.bold(pc.underline('Server validation failed:')))
		errors.push(...(serverResult.errors || []))
	}

	if (!clientResult.success) {
		errors.push(pc.bold(pc.underline('Client validation failed:')))
		errors.push(...(clientResult.errors || []))
	}

	// Add warnings for optional but recommended variables
	if (!process.env.DATABASE_URL) {
		warnings.push(
			`${pc.bold('DATABASE_URL')} is not set - ${pc.yellow('database features will not work')}`
		)
	}

	if (!process.env.AUTH_SECRET && !process.env.BETTER_AUTH_SECRET) {
		warnings.push(
			`${pc.bold('AUTH_SECRET')} is not set - ${pc.yellow('auth features will not work')}`
		)
	}

	// Check for improper process.env usage if flag is set
	if (checkEnvUsage) {
		const envUsageWarnings = await scanProcessEnvUsage()
		warnings.push(
			...envUsageWarnings.map((w) => `Improper env usage: ${w}`)
		)
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
		console.log(pc.green('\n✔ Environment validation passed!\n'))
		console.log(
			`📋 Build mode: ${pc.cyan(process.env.NODE_ENV || 'development')}`
		)

		if (result.warnings && result.warnings.length > 0) {
			console.log(pc.yellow('\n⚠️  Warnings:'))
			result.warnings.forEach((warning) => {
				console.log(`  • ${warning}`)
			})
		}

		console.log(pc.green('\n🚀 Ready to build!'))
		return
	}

	console.error(pc.red('\n✖ Environment validation failed!\n'))

	if (result.errors) {
		console.error(pc.bold('Missing or invalid environment variables:'))
		result.errors.forEach((error) => {
			console.error(`  • ${error}`)
		})
	}

	console.error(pc.cyan('\n💡 To fix this:'))
	console.error(`1. Check your ${pc.bold('.env.local')} or ${pc.bold('.env')} file`)
	console.error('2. Add the missing variables with correct values')
	console.error('3. Run the build command again\n')

	// Suggest creating an .env.example file
	console.error(pc.bold('📝 Example .env.local file:'))
	console.error(pc.dim(`
# Required environment variables
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
AUTH_SECRET="your-very-long-secret-key-here-min-32-chars"

# Optional variables
NODE_ENV="development"
DEBUG="false"
PORT="3000"
`))
}

if (import.meta.url === `file://${process.argv[1]}`) {
	; (async () => {
		const checkEnvUsage = process.argv.includes('--check-env-usage')

		console.log('🔍 Validating environment variables...\n')

		const result = await validateAll(checkEnvUsage)
		printResults(result)

		if (!result.success) {
			process.exit(1)
		}
	})()
}

// Export for programmatic use
export { validateAll, validateServer, validateClient }
