/**
 * Prefix used for guest/demo workspace note & folder ids (see
 * {@link file://./../seed/guest-bundle.ts}). Guest ids look like
 * `guest:note-research-workflow` and are NOT persisted UUIDs.
 */
export const GUEST_ID_PREFIX = "guest:";

/**
 * True for guest/demo ids. Server queries that hit Postgres (uuid columns) must
 * skip these — otherwise Prisma throws `P2007 invalid input syntax for type
 * uuid`. This happens when a stale `?note=guest:…` URL from a guest session is
 * carried into an authenticated session and prefetched server-side.
 */
export function isGuestScopedId(id: string): boolean {
	return id.startsWith(GUEST_ID_PREFIX);
}
