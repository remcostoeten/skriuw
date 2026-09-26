/**
 * Desktop SPA stub for `@/lib/auth` (server-side better-auth instance). The
 * real module eagerly wires a Prisma adapter + OAuth providers at import time.
 * The desktop app runs as a single local profile with no server auth, so this
 * is import-safe only; client auth uses `@/lib/auth-client` instead.
 */
function unavailable(): never {
	throw new Error("server auth is unavailable in the desktop SPA (single local profile)");
}

export const auth = new Proxy(
	{},
	{
		get: unavailable,
		apply: unavailable,
	},
) as never;
