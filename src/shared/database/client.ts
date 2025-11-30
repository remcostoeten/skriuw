/**
 * Drizzle database client
 * 
 * NOTE: Requires drizzle-orm and postgres packages to be installed:
 *   bun add drizzle-orm postgres
 *   bun add -d drizzle-kit
 */

let dbClient: any = null

export async function getDatabase() {
	if (dbClient) {
		return dbClient
	}

	// Dynamic import to avoid errors if packages aren't installed yet
	try {
		const postgres = await import('postgres')
		const { drizzle } = await import('drizzle-orm/postgres-js')
		
		const url = import.meta.env.VITE_DATABASE_URL || process.env.DATABASE_URL

		if (!url) {
			throw new Error('DATABASE_URL environment variable is required')
		}

		// Create postgres client
		const queryClient = postgres.default(url)
		
		dbClient = drizzle(queryClient)

		return dbClient
	} catch (error) {
		console.error('Failed to initialize database client:', error)
		throw new Error(
			'Database client not available. Please install drizzle-orm and postgres packages.'
		)
	}
}

export function isDatabaseAvailable(): boolean {
	try {
		// Check if we can access the client
		return dbClient !== null
	} catch {
		return false
	}
}

