/**
 * Desktop SPA stub for `@/generated/prisma/client`. Replaces the generated
 * Prisma client (which pulls the Node-only @prisma/client runtime) with the
 * two runtime values a handful of server modules import: `PrismaClient` and
 * the `Prisma` namespace. Only needs to be import-safe — these modules never
 * execute on desktop.
 */
export class PrismaClient {
	constructor() {
		throw new Error("PrismaClient is unavailable in the desktop SPA");
	}
}

export const Prisma = new Proxy(
	{},
	{
		get: (_target, key) => String(key),
	},
);
