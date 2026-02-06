import { getDatabase } from '@skriuw/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous } from 'better-auth/plugins'

let _db: ReturnType<typeof getDatabase> | null = null

function getDb() {
	if (!_db) {
		try {
			_db = getDatabase()
		} catch (error) {
			console.error('Failed to connect to database:', error instanceof Error ? error.message : error)
			throw new Error(
				'Database connection failed. Please ensure DATABASE_URL is set in your .env.local file.\n' +
				'Run: cp .env.example .env.local and configure your database connection.'
			)
		}
	}
	return _db
}

function createAuthConfig() {
	try {
		const db = getDb()
		return {
			database: drizzleAdapter(db as any, {
				provider: 'pg'
			}),
			emailAndPassword: {
				enabled: true
			},
			socialProviders: {
				github: {
					clientId: process.env.GITHUB_CLIENT_ID!,
					clientSecret: process.env.GITHUB_CLIENT_SECRET!
				},
				google: {
					clientId: process.env.GOOGLE_CLIENT_ID!,
					clientSecret: process.env.GOOGLE_CLIENT_SECRET!
				}
			},
			plugins: [anonymous()]
		}
	} catch (error) {
		console.error('Failed to initialize auth:', error)
		// Return a minimal auth config that will fail gracefully
		throw error
	}
}

export const auth = betterAuth(createAuthConfig())
