import { Elysia } from 'elysia'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous } from 'better-auth/plugins'
import { getDatabase } from '@skriuw/db'

// ============================================================================
// AUTH INSTANCE (lazy)
// ============================================================================

let _db: ReturnType<typeof getDatabase> | null = null

function getDb() {
	if (!_db) {
		_db = getDatabase()
	}
	return _db
}

type BetterAuthInstance = ReturnType<typeof betterAuth>
let _auth: BetterAuthInstance | null = null

/**
 * Returns the Better Auth instance, creating it lazily on first access.
 * This defers DB connection until the first request, so the server can
 * start up without DATABASE_URL being available at module-load time.
 *
 * Shares the same database and configuration as apps/web/lib/auth.ts
 * so sessions created by the web app are valid here too.
 */
function getAuth(): BetterAuthInstance {
	if (!_auth) {
		_auth = betterAuth({
			database: drizzleAdapter(getDb() as any, {
				provider: 'pg',
			}),
			emailAndPassword: {
				enabled: true,
			},
			socialProviders: {
				github: {
					clientId: process.env.GITHUB_CLIENT_ID!,
					clientSecret: process.env.GITHUB_CLIENT_SECRET!,
				},
				google: {
					clientId: process.env.GOOGLE_CLIENT_ID!,
					clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
				},
			},
			plugins: [anonymous()],
		})
	}
	return _auth
}

/** Convenience accessor — use `getAuth()` in route handlers. */
export { getAuth as auth }

// ============================================================================
// SESSION TYPES
// ============================================================================

export type Session = {
	user: {
		id: string
		email: string
		name: string | null
		isAnonymous?: boolean
	}
	session: {
		id: string
		expiresAt: Date
	}
}

// ============================================================================
// ELYSIA AUTH PLUGIN
// ============================================================================

/**
 * Elysia plugin that derives `session` and `userId` from the incoming request.
 *
 * Usage:
 *   app.use(authPlugin)
 *      .get('/protected', ({ userId }) => { ... })
 */
export const authPlugin = new Elysia({ name: 'middleware/auth' }).derive(
	{ as: 'global' },
	async ({ request }) => {
		try {
			const session = (await getAuth().api.getSession({
				headers: request.headers,
			})) as Session | null

			return {
				session,
				userId: session?.user?.id ?? null,
			}
		} catch {
			return {
				session: null as Session | null,
				userId: null as string | null,
			}
		}
	},
)

// ============================================================================
// AUTH GUARD HELPERS
// ============================================================================

/**
 * Throws a 401 error if the request is not authenticated.
 * Use inside route handlers after applying `authPlugin`.
 *
 * @example
 * ```ts
 * .post('/notes', ({ userId, error }) => {
 *   requireUserId(userId, error)
 *   // userId is now guaranteed to be a string
 * })
 * ```
 */
export function requireUserId(
	userId: string | null,
	error: (status: number, body: { error: string; message: string }) => never
): asserts userId is string {
	if (!userId) {
		error(401, {
			error: 'Unauthorized',
			message: 'Authentication required',
		})
	}
}

/**
 * Throws a 401 error if the user is not authenticated or is anonymous.
 * Guests / anonymous users cannot perform mutations.
 */
export function requireMutationAccess(
	session: Session | null,
	error: (status: number, body: { error: string; message: string }) => never
): asserts session is Session {
	if (!session?.user?.id || session.user.isAnonymous) {
		error(401, {
			error: 'Unauthorized',
			message: 'Authentication required for mutations',
		})
	}
}
