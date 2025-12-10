import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDatabase } from '@skriuw/db'
import { anonymous } from 'better-auth/plugins'
import { auth as authConfig } from '@skriuw/env/server'

const db = getDatabase()

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
	emailAndPassword: {
		enabled: true,
	},
	socialProviders: {
		github: {
			clientId: authConfig.github.clientId || '',
			clientSecret: authConfig.github.clientSecret || '',
			enabled: authConfig.github.isConfigured,
		},
	},
	plugins: [anonymous()],
})
