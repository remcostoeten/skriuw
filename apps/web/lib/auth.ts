import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDatabase } from '@skriuw/db'
import { anonymous } from 'better-auth/plugins'

let _db: ReturnType<typeof getDatabase> | null = null

function getDb() {
	if (!_db) {
		_db = getDatabase()
	}
	return _db
}

export const auth = betterAuth({
	database: drizzleAdapter(getDb() as any, {
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
})
