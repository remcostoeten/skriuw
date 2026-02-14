export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI__' in window
}

export function isExpo(): boolean {
	return typeof globalThis !== 'undefined' && 'expo' in globalThis
}

export function isWeb(): boolean {
	return typeof window !== 'undefined' && !isTauri() && !isExpo()
}

export function isServer(): boolean {
	return typeof window === 'undefined'
}
