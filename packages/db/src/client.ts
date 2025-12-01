/**
 * Database provider types
 */
export type DatabaseProvider = 'neon' | 'postgres' | 'auto'

/**
 * Drizzle database client with support for multiple providers
 * 
 * @description Automatically detects provider or uses DATABASE_PROVIDER env var
 * Supports:
 * - Neon (cloud PostgreSQL) - uses @neondatabase/serverless
 * - Local PostgreSQL (Docker/local) - uses postgres package
 * 
 * Auto-detection: If DATABASE_URL contains 'neon', uses Neon provider
 * 
 * @returns {Promise<any>} The database client
 */
let dbClient: any = null

function getEnvValue(key: string): string | undefined {
	if (typeof process !== 'undefined' && process.env?.[key]) {
		return process.env[key]
	}
	if (typeof import.meta !== 'undefined' && import.meta.env?.[key]) {
		return import.meta.env[key]
	}
	return undefined
}

function detectProvider(url: string, explicitProvider?: string): DatabaseProvider {
	if (explicitProvider && (explicitProvider === 'neon' || explicitProvider === 'postgres')) {
		return explicitProvider
	}
	
	// Auto-detect based on URL
	if (url.includes('neon.tech') || url.includes('neon')) {
		return 'neon'
	}
	
	// Default to postgres for local/standard PostgreSQL
	return 'postgres'
}

export async function getDatabase() {
	// Check if we're in a browser environment without database support
	if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && !import.meta.env?.SSR) {
		// Check if localStorage adapter is being used
		const storageAdapter = import.meta.env?.VITE_STORAGE_ADAPTER || 'localStorage'
		if (storageAdapter === 'localStorage') {
			throw new Error('Database not available in localStorage mode')
		}
	}

	if (dbClient) {
		return dbClient
	}

	try {
		// Get database URL from environment
		const url = getEnvValue('DATABASE_URL') || getEnvValue('VITE_DATABASE_URL')
		
		if (!url) {
			throw new Error(
				'DATABASE_URL environment variable is required.\n' +
				'Set DATABASE_URL=postgresql://user:password@host:port/database\n' +
				'Or use docker-compose up for local development.'
			)
		}

		// Get provider (explicit or auto-detect)
		const explicitProvider = getEnvValue('DATABASE_PROVIDER') as DatabaseProvider | undefined
		const provider = detectProvider(url, explicitProvider)

		// Import schema once
		const schemaModule = await import('./schema.js')
		
		if (provider === 'neon') {
			// Use Neon serverless driver
			const { neon } = await import('@neondatabase/serverless')
			const { drizzle: drizzleNeon } = await import('drizzle-orm/neon-http')
			
			const sql = neon(url)
			dbClient = drizzleNeon(sql, { schema: schemaModule })
			
			console.log('✅ Database: Connected via Neon')
		} else {
			// Use standard PostgreSQL driver (for Docker/local)
			const postgres = await import('postgres')
			const { drizzle: drizzlePostgres } = await import('drizzle-orm/postgres-js')
			
			const queryClient = postgres.default(url)
			dbClient = drizzlePostgres(queryClient, { schema: schemaModule })
			
			console.log('✅ Database: Connected via PostgreSQL')
		}

		return dbClient
	} catch (error) {
		console.error('❌ Failed to initialize database client:', error)
		
		if (error instanceof Error && error.message.includes('Cannot find module')) {
			const provider = detectProvider(getEnvValue('DATABASE_URL') || '', getEnvValue('DATABASE_PROVIDER') as DatabaseProvider | undefined)
			
			if (provider === 'neon') {
				throw new Error(
					'Neon database provider requires @neondatabase/serverless package.\n' +
					'Install it: pnpm add @neondatabase/serverless'
				)
			} else {
				throw new Error(
					'PostgreSQL database provider requires postgres package.\n' +
					'Install it: pnpm add postgres'
				)
			}
		}
		
		throw error
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

