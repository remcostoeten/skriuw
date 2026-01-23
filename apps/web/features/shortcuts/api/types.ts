import type { ShortcutId, KeyCombo } from "../shortcut-definitions";

// Define types locally since shared package has issues
type BaseEntity = {
	id: string
} & {
	createdAt: number
	updatedAt: number
	deletedAt?: number
}

/**
 * Custom shortcut entity that extends BaseEntity for CRUD operations
 */
export type CustomShortcut = {
	id: ShortcutId
	keys: KeyCombo[]
	customizedAt: string // ISO date string
} & BaseEntity

/**
 * Data required to create a custom shortcut
 */
export type CreateCustomShortcutData = {
	id: ShortcutId
	keys: KeyCombo[]
}
