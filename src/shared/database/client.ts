/**
 * Drizzle database client
 * 
 * @description Drizzle database client
 * @returns {Promise<any>} The database client
 */
let dbClient: any = null

export async function getDatabase() {
	// Check if we're in a browser environment without database support
	if (typeof window !== 'undefined' && !import.meta.env.SSR) {
		// Check if localStorage adapter is being used
		const storageAdapter = import.meta.env.VITE_STORAGE_ADAPTER || 'localStorage'
		if (storageAdapter === 'localStorage') {
			throw new Error('Database not available in localStorage mode')
		}
	}

	if (dbClient) {
		return dbClient
	}

	// Dynamic import to avoid errors if packages aren't installed yet
	try {
		const postgres = await import('postgres')
		const { drizzle } = await import('drizzle-orm/postgres-js')

		const url = import.meta.env.VITE_DATABASE_URL

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

