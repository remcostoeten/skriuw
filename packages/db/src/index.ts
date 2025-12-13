import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeon, NeonHttpDatabase } from 'drizzle-orm/neon-http'
import postgres from 'postgres'
import { drizzle as drizzlePostgres, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

// Lazy import to avoid build-time validation
// drizzle.config.ts uses dotenv, runtime uses @skriuw/env
let _dbClient: NeonHttpDatabase<typeof schema> | PostgresJsDatabase<typeof schema> | null = null

export * from './schema'
export { schema }
export * from './user-owned'

type DatabaseProvider = 'neon' | 'postgres'

function detectProvider(url: string): DatabaseProvider {
	// Check explicit provider first
	const explicitProvider = process.env.DATABASE_PROVIDER as DatabaseProvider | undefined
	if (explicitProvider && (explicitProvider === 'neon' || explicitProvider === 'postgres')) {
		return explicitProvider
	}

	// Auto-detect from URL
	if (url.includes('neon.tech') || url.includes('neon')) {
		return 'neon'
	}

	return 'postgres'
}

/**
 * Get the database connection.
 * Automatically detects Neon vs PostgreSQL and creates the appropriate client.
 * Uses @skriuw/env for validated environment configuration.
 *
 * @example
 * ```typescript
 * import { getDatabase } from '@skriuw/db'
 *
 * const db = getDatabase()
 * const users = await db.select().from(users)
 * ```
 */
export function getDatabase() {
	if (_dbClient) {
		return _dbClient
	}

	// Try @skriuw/env first, fallback to process.env for drizzle-kit compatibility
	let url: string

	try {
		// Dynamic import to avoid validation at build time
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { database } = require('@skriuw/env/server')
		url = database.url
	} catch {
		// Fallback for drizzle-kit commands that use dotenv
		url = process.env.DATABASE_URL || ''
	}

	if (!url) {
		throw new Error(
			'DATABASE_URL environment variable is required.\n' +
			'Set DATABASE_URL=postgresql://user:password@host:port/database'
		)
	}

	const provider = detectProvider(url)

	if (provider === 'neon') {
		const sql = neon(url)
		_dbClient = drizzleNeon(sql, { schema })
		console.log('✅ Database: Connected via Neon')
	} else {
		const queryClient = postgres(url)
		_dbClient = drizzlePostgres(queryClient, { schema })
		console.log('✅ Database: Connected via PostgreSQL')
	}

	return _dbClient
}
