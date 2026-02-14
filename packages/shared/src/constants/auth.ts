export const GUEST_USER_ID = 'guest-user'
export const LEGACY_GUEST_USER_ID = 'guest'

export const GUEST_USER_IDS = [LEGACY_GUEST_USER_ID, GUEST_USER_ID] as const

export function isGuestUserId(userId?: string | null): boolean {
	return userId != null && GUEST_USER_IDS.includes(userId as (typeof GUEST_USER_IDS)[number])
}
