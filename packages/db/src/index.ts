import * as schema from './schema'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle as drizzleNeon, NeonDatabase } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePostgres, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import ws from 'ws'

if (!globalThis.WebSocket) {
	neonConfig.webSocketConstructor = ws
}

let _dbClient: NeonDatabase<typeof schema> | PostgresJsDatabase<typeof schema> | null = null

export * from './schema'
export { schema }
export * from './user-owned'
export * from './activity-events'
export * from './timestamps'

export { eq, isNull, and, inArray, or, sql, desc, asc, like } from 'drizzle-orm'

type DatabaseProvider = 'neon' | 'postgres'

function detectProvider(url: string): DatabaseProvider {
	const explicitProvider = process.env.DATABASE_PROVIDER as DatabaseProvider | undefined
	if (explicitProvider && (explicitProvider === 'neon' || explicitProvider === 'postgres')) {
		return explicitProvider
	}

	return 'postgres'
}

export function getDatabase() {
	if (_dbClient) {
		return _dbClient
	}

	const url = process.env.DATABASE_URL || ''

	if (!url) {
		throw new Error(
			'DATABASE_URL environment variable is required.\n' +
			'Set DATABASE_URL=postgresql://user:password@host:port/database'
		)
	}

	const provider = detectProvider(url)

	if (provider === 'neon') {
		const pool = new Pool({ connectionString: url })
		_dbClient = drizzleNeon(pool, { schema })
		console.log('✅ Database: Connected via Neon (Function/Pool)')
	} else {
		const queryClient = postgres(url)
		_dbClient = drizzlePostgres(queryClient, { schema })
		console.log('✅ Database: Connected via PostgreSQL')
	}

	return _dbClient
}
