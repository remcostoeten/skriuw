/**
 * Desktop SPA stub for `@/lib/prisma`. The real module eagerly constructs a
 * PrismaClient from process.env.DATABASE_URL at import time — impossible in a
 * browser. Desktop persistence runs through the Rust/SQLite tauriBackend, and
 * every cloud code path that would touch `prisma` is capability-gated off, so
 * this proxy only needs to be import-safe; any actual access is a programmer
 * error worth surfacing loudly.
 */
function unavailable(): never {
	throw new Error("prisma is unavailable in the desktop SPA (cloud feature reached on desktop)");
}

export const prisma = new Proxy(
	{},
	{
		get: unavailable,
		apply: unavailable,
	},
) as never;
