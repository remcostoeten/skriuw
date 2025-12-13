import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous } from 'better-auth/plugins'
import { getDatabase } from '@skriuw/db'
import { env } from './env'

type AuthInstance = ReturnType<typeof betterAuth> | null

const missingVars: string[] = []
if (!env.BETTER_AUTH_SECRET) missingVars.push('BETTER_AUTH_SECRET')

const hasGithub = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)

export const authEnabled = missingVars.length === 0
export const authDisabledReason = authEnabled
	? null
	: `Auth disabled: missing ${missingVars.join(', ')}`

let hasWarned = false

function warnOnce() {
	if (hasWarned || authEnabled) return
	hasWarned = true
	console.warn(authDisabledReason)
}

function createAuth(): AuthInstance {
	if (!authEnabled) {
		warnOnce()
		return null
	}

	const db = getDatabase()

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: 'pg'
		}),
		emailAndPassword: {
			enabled: true
		},
		socialProviders: hasGithub
			? {
				github: {
					clientId: env.GITHUB_CLIENT_ID!,
					clientSecret: env.GITHUB_CLIENT_SECRET!
				}
			}
			: undefined,
		secret: env.BETTER_AUTH_SECRET,
		plugins: [anonymous()]
	})
}

export const auth = createAuth()
