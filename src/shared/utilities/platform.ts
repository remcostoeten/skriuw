/**
 * Cross-platform runtime and OS detection utilities.
 * Works in Browser (Next.js), Node.js, and Tauri environments.
 */

type OS = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown'
type Runtime = 'tauri' | 'electron' | 'node' | 'browser'

const hasNavigator = typeof navigator !== 'undefined'
const hasWindow = typeof window !== 'undefined'
const hasProcess =
    typeof process !== 'undefined' && typeof process.platform === 'string'

/**
 * Safely retrieves the user agent string from navigator.
 * @returns Lowercase user agent string or empty string if unavailable.
 */
function safeUserAgent(): string {
    if (hasNavigator && navigator.userAgent) return navigator.userAgent
    if (hasNavigator && (navigator as any).userAgentData?.brands) {
        try {
            return JSON.stringify((navigator as any).userAgentData.brands)
        } catch {
            return ''
        }
    }
    return ''
}

const UA = safeUserAgent().toLowerCase()

/**
 * Detects if the app is running in Tauri.
 * Checks for `__TAURI_INTERNALS__` (always present in Tauri 2.0)
 * or `__TAURI__` (requires `withGlobalTauri` config flag).
 * @returns True if running in Tauri environment.
 */
export function isTauri(): boolean {
    return (
        hasWindow &&
        (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__)
    )
}

/**
 * Determines the current runtime environment.
 * @returns The detected runtime: 'tauri', 'electron', 'node', or 'browser'.
 */
export function runtime(): Runtime {
    if (isTauri()) return 'tauri'
    if (
        typeof (globalThis as any).process === 'object' &&
        (globalThis as any).process?.versions?.node
    ) {
        const isElectron =
            !!(process as any).versions?.electron || UA.includes('electron')
        return isElectron ? 'electron' : 'node'
    }
    return 'browser'
}

/**
 * Detects the current operating system.
 * @returns The detected OS or 'unknown' if unable to determine.
 */
export function os(): OS {
    if (hasProcess) {
        switch (process.platform) {
            case 'darwin':
                return 'macos'
            case 'win32':
                return 'windows'
            case 'linux':
                return 'linux'
        }
    }

    if (/mac os x|macintosh/.test(UA)) return 'macos'
    if (/windows nt|win64|win32/.test(UA)) return 'windows'
    if (/linux|x11/.test(UA)) return 'linux'
    if (/iphone|ipad|ipod|ios/.test(UA)) return 'ios'
    if (/android/.test(UA)) return 'android'
    return 'unknown'
}

/**
 * Checks if the OS is macOS.
 * @returns True if running on macOS.
 */
export function isMac(): boolean {
    return os() === 'macos'
}

/**
 * Checks if the OS is Windows.
 * @returns True if running on Windows.
 */
export function isWindows(): boolean {
    return os() === 'windows'
}

/**
 * Checks if the OS is Linux.
 * @returns True if running on Linux.
 */
export function isLinux(): boolean {
    return os() === 'linux'
}

/**
 * Checks if the OS is mobile (iOS or Android).
 * @returns True if running on a mobile OS.
 */
export function isMobile(): boolean {
    return os() === 'ios' || os() === 'android'
}

/**
 * Returns the primary modifier key label for the current platform.
 * @returns 'Cmd' on macOS, 'Ctrl' on other platforms.
 */
export function primaryModKey(): 'Cmd' | 'Ctrl' {
    return isMac() ? 'Cmd' : 'Ctrl'
}

/**
 * Returns the primary modifier key event property name for the current platform.
 * @returns 'metaKey' on macOS, 'ctrlKey' on other platforms.
 */
export function primaryModEventKey(): 'metaKey' | 'ctrlKey' {
    return isMac() ? 'metaKey' : 'ctrlKey'
}

/**
 * Returns the CPU architecture when available.
 * @returns Architecture string (e.g., 'x64', 'arm64') or null if unavailable.
 */
export function arch(): string | null {
    try {
        if (hasProcess && (process as any).arch) return (process as any).arch
    } catch { }
    return null
}

/**
 * Returns a concise descriptor of the current environment.
 * @returns Format: "runtime-os" (e.g., "tauri-macos", "browser-windows").
 */
export function platformTag(): string {
    return `${runtime()}-${os()}`
}

/**
 * Convenience object containing all platform detection utilities.
 */
export const Platform = {
    os,
    runtime,
    isTauri,
    isMac,
    isWindows,
    isLinux,
    isMobile,
    primaryModKey,
    primaryModEventKey,
    arch,
    platformTag,
}

export default Platform

