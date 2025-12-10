import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import postgres from 'postgres'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import pc from 'picocolors'
import * as schema from './schema'

// Global type definition to prevent multiple connections in development
declare global {
	// eslint-disable-next-line no-var
	var _dbClient: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePostgres> | undefined
}

// Use global cache in development to prevent hot-reload connection leaks
// In production, each request/lambda gets its own scope usually, or we want a fresh connection
let _dbClient = globalThis._dbClient

export * from './schema'
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
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { database } = require('@skriuw/env/server')
		url = database.url
	} catch {
		// Fallback for drizzle-kit commands that use dotenv
		url = process.env.DATABASE_URL || ''
	}

	if (!url) {
		const errorMsg =
			pc.red('✖ DATABASE_URL environment variable is required.\n') +
			pc.yellow('Set DATABASE_URL=postgresql://user:password@host:port/database')
		throw new Error(errorMsg)
	}

	const provider = detectProvider(url)

	if (provider === 'neon') {
		const sql = neon(url)
		_dbClient = drizzleNeon(sql, { schema })
		console.log(pc.green('✅ Database: Connected via Neon'))
	} else {
		const queryClient = postgres(url)
		_dbClient = drizzlePostgres(queryClient, { schema })
		console.log(pc.cyan('✅ Database: Connected via PostgreSQL'))
	}

	// Cache the connection in development
	if (process.env.NODE_ENV !== 'production') {
		globalThis._dbClient = _dbClient
	}

	return _dbClient
}
