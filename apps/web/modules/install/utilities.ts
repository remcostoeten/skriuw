
import { DISMISS_KEY, DISMISS_DURATION, StandaloneNav } from "./types"

export function isIos(): boolean {
    if (typeof window === 'undefined') return false
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !(window as any).MSStream
}

export function isSafari(): boolean {
    if (typeof window === 'undefined') return false
    return /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent)
}

export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false
    const nav = window.navigator as StandaloneNav
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone)
    return isStandaloneMode
}

export function shouldShowInstallPrompt(): boolean {
    if (typeof window === 'undefined') return false

    // If already in standalone mode, never show
    if (isStandalone()) return false

    // Check cooldown
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
        const now = Date.now()
        if (now - parseInt(dismissedAt) < DISMISS_DURATION) {
            return false
        }
    }

    return true
}

export function markInstallDismissed() {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
}
