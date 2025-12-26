/**
 * @fileoverview Zero-Session Manager
 * @description Manages zero-session state, Nth-request tracking, and auth popup logic
 */

import { ZERO_SESSION_COOKIE, ZERO_SESSION_STORAGE_KEY } from './constants'
import { dispatchIdentityRequired } from './identity-guard'

const NTH_REQUEST_THRESHOLD = 5
const POPUP_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

const POPUP_SHOWN_KEY = 'zero_session:popup_shown'
const REQUEST_COUNT_KEY = 'zero_session:request_count'
const LAST_POPUP_KEY = 'zero_session:last_popup'

/**
 * Gets the current request count
 */
function getRequestCount(): number {
	if (typeof window === 'undefined') return 0

	const count = localStorage.getItem(REQUEST_COUNT_KEY)
	return count ? parseInt(count, 10) : 0
}

/**
 * Increments the request count
 */
export function incrementRequestCount(): number {
	if (typeof window === 'undefined') return 0

	const current = getRequestCount()
	const next = current + 1
	localStorage.setItem(REQUEST_COUNT_KEY, next.toString())

	return next
}

/**
 * Gets the last popup timestamp
 */
function getLastPopupTime(): number {
	if (typeof window === 'undefined') return 0

	const time = localStorage.getItem(LAST_POPUP_KEY)
	return time ? parseInt(time, 10) : 0
}

/**
 * Checks if the cooldown period has passed since last popup
 */
function isCooldownOver(): boolean {
	const lastPopup = getLastPopupTime()
	const now = Date.now()
	return now - lastPopup > POPUP_COOLDOWN_MS
}

/**
 * Gets the zero session ID
 */
export function getZeroSessionId(): string | null {
	if (typeof window === 'undefined') return null

	const cookieMatch = document.cookie
		.split('; ')
		.find((row) => row.startsWith(`${ZERO_SESSION_COOKIE}=`))

	const cookieValue = cookieMatch?.split('=')[1]
	if (cookieValue) return cookieValue

	try {
		return localStorage.getItem(ZERO_SESSION_STORAGE_KEY)
	} catch {
		return null
	}
}

/**
 * Checks if user is a zero-session user
 */
export function isZeroSessionUser(): boolean {
	if (typeof window === 'undefined') return false
	return !!getZeroSessionId()
}

/**
 * Checks if auth popup should be shown based on Nth-request logic
 * Returns true if popup should be shown, false otherwise
 */
export function shouldShowAuthPopup(): boolean {
	if (!isZeroSessionUser()) return false
	if (!isCooldownOver()) return false

	const count = incrementRequestCount()

	if (count % NTH_REQUEST_THRESHOLD === 0) {
		// Show popup and record timestamp
		localStorage.setItem(LAST_POPUP_KEY, Date.now().toString())
		return true
	}

	return false
}

/**
 * Manually triggers auth popup for zero-session users
 * Call this when you want to show the login prompt immediately
 */
export function triggerAuthPopup(): void {
	if (!isZeroSessionUser()) return

	// Check cooldown
	if (!isCooldownOver()) return

	// Show popup and record timestamp
	localStorage.setItem(LAST_POPUP_KEY, Date.now().toString())
	dispatchIdentityRequired({ action: 'save-your-work' })
}

/**
 * Resets the request count (for testing or debugging)
 */
export function resetRequestCount(): void {
	if (typeof window === 'undefined') return
	localStorage.setItem(REQUEST_COUNT_KEY, '0')
}

/**
 * Clears all zero-session tracking data
 */
export function clearZeroSessionTracking(): void {
	if (typeof window === 'undefined') return

	localStorage.removeItem(POPUP_SHOWN_KEY)
	localStorage.removeItem(REQUEST_COUNT_KEY)
	localStorage.removeItem(LAST_POPUP_KEY)
}
