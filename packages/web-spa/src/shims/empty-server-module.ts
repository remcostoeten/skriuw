/**
 * Stub for Next.js server-only modules (next/headers, next/server, next/cache,
 * next/og). The desktop SPA never executes server code paths — cloud features
 * are capability-gated off — so any transitive import of these resolves to
 * inert no-ops instead of pulling server runtime into the browser bundle.
 */

function unavailable(name: string) {
	return function () {
		throw new Error(`next server API "${name}" is unavailable in the desktop SPA`);
	};
}

export const cookies = unavailable("cookies");
export const headers = unavailable("headers");
export const draftMode = unavailable("draftMode");
export const revalidatePath = function () {};
export const revalidateTag = function () {};
export const unstable_cache = function <T>(fn: T): T {
	return fn;
};
export const cacheTag = function () {};
export const cacheLife = function () {};
export const revalidate = function () {};
export const updateTag = function () {};
export const refresh = function () {};
export const expireTag = function () {};
export const expirePath = function () {};

export class NextResponse {}
export class NextRequest {}

export default {};
