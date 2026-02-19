import type { Item } from '@/features/notes/types'

// ============================================================================
// Public API
// ============================================================================

export function generatePreseededItems(userId: string): Item[] {
	return []
}

export function hasPreseededItems(): boolean {
	if (typeof window === 'undefined') return false
	return localStorage.getItem('zero_session:preseeded') === 'true'
}

export function markPreseededItems(): void {
	if (typeof window === 'undefined') return
	localStorage.setItem('zero_session:preseeded', 'true')
}

export function clearPreseededFlag(): void {
	if (typeof window === 'undefined') return
	localStorage.removeItem('zero_session:preseeded')
}
