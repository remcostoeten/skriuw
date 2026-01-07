import type { ShortcutId, KeyCombo } from './shortcut-definitions'

/**
 * Strongly typed keyboard shortcut system
 * Supports modifiers, sequences (chords), delays, and multiple display formats
 */

/**
 * Modifier keys
 */
export type Modifier = 'Ctrl' | 'Cmd' | 'Alt' | 'Shift' | 'Meta'

/**
 * Regular keys (non-modifiers)
 * Common keys that can be used in shortcuts
 */
export type RegularKey =
	| 'A'
	| 'B'
	| 'C'
	| 'D'
	| 'E'
	| 'F'
	| 'G'
	| 'H'
	| 'I'
	| 'J'
	| 'K'
	| 'L'
	| 'M'
	| 'N'
	| 'O'
	| 'P'
	| 'Q'
	| 'R'
	| 'S'
	| 'T'
	| 'U'
	| 'V'
	| 'W'
	| 'X'
	| 'Y'
	| 'Z'
	| '0'
	| '1'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| 'Enter'
	| 'Space'
	| 'Tab'
	| 'Escape'
	| 'Backspace'
	| 'Delete'
	| 'ArrowUp'
	| 'ArrowDown'
	| 'ArrowLeft'
	| 'ArrowRight'
	| 'Home'
	| 'End'
	| 'PageUp'
	| 'PageDown'
	| 'F1'
	| 'F2'
	| 'F3'
	| 'F4'
	| 'F5'
	| 'F6'
	| 'F7'
	| 'F8'
	| 'F9'
	| 'F10'
	| 'F11'
	| 'F12'
	| '/'
	| '['
	| ']'
	| '\\'
	| ';'
	| "'"
	| ','
	| '.'
	| '='
	| '-'
	| string // Allow custom keys

/**
 * A single key combination (modifiers + regular key)
 * Note: This is different from the runtime KeyCombo type (string[])
 * This is for display/typing purposes
 */
export type DisplayKeyCombo = {
	modifiers?: Modifier[]
	key: RegularKey
}

/**
 * Delay configuration between key sequences
 */
export type SequenceDelay = {
	maxDelay?: number // Maximum delay in milliseconds between sequences
}

/**
 * A keyboard shortcut sequence (chord)
 * Supports up to 3 key combinations with optional delays
 */
export type ShortcutSequence =
	| [DisplayKeyCombo]
	| [DisplayKeyCombo, DisplayKeyCombo]
	| [DisplayKeyCombo, DisplayKeyCombo, DisplayKeyCombo]
	| [DisplayKeyCombo, SequenceDelay, DisplayKeyCombo]
	| [DisplayKeyCombo, DisplayKeyCombo, SequenceDelay, DisplayKeyCombo]
	| [DisplayKeyCombo, SequenceDelay, DisplayKeyCombo, SequenceDelay, DisplayKeyCombo]

/**
 * Display format for shortcuts
 */
export type DisplayFormat = 'text' | 'icon' | 'mixed'

/**
 * Icon mapping for modifier keys
 */
export const MODIFIER_ICONS: Record<Modifier, string> = {
	Ctrl: '⌃',
	Cmd: '⌘',
	Alt: '⌥',
	Shift: '⇧',
	Meta: '⌘',
}

/**
 * Icon mapping for special keys
 */
export const KEY_ICONS: Partial<Record<RegularKey, string>> = {
	Enter: '↵',
	Space: '␣',
	Tab: '⇥',
	Escape: '⎋',
	Backspace: '⌫',
	Delete: '⌦',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	Home: '⇱',
	End: '⇲',
	PageUp: '⇞',
	PageDown: '⇟',
}

/**
 * Complete keyboard shortcut definition (for display)
 */
export type KeyboardShortcut = {
	sequences: ShortcutSequence[]
	displayFormat?: DisplayFormat
	description?: string
}

/**
 * Helper type for creating shortcuts with better DX
 */
export type ShortcutBuilder = {
	/**
	 * Create a simple shortcut with modifiers and a key
	 * @example shortcut().modifiers('Ctrl', 'Shift').key('N')
	 */
	modifiers: (...modifiers: Modifier[]) => ShortcutBuilder
	key: (key: RegularKey) => KeyboardShortcut

	/**
	 * Create a sequence (chord) shortcut
	 * @example shortcut().combo('Ctrl', 'K').then('Ctrl', 'S')
	 * @example shortcut().combo(undefined, '/').then('Ctrl', 'K')
	 */
	combo: (modifiers: Modifier | Modifier[] | undefined, key: RegularKey) => SequenceBuilder
}

export type SequenceBuilder = {
	then: (
		modifiers: Modifier | Modifier[] | undefined,
		key: RegularKey,
		delay?: SequenceDelay
	) => SequenceBuilder
	build: () => KeyboardShortcut
}

// -----------------------------------------------------------------------------
// Storage Entity Types
// -----------------------------------------------------------------------------

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
export interface CustomShortcut extends BaseEntity {
	id: ShortcutId
	keys: KeyCombo[]
	customizedAt: string // ISO date string
}

/**
 * Data required to create a custom shortcut
 */
export interface CreateCustomShortcutData {
	id: ShortcutId
	keys: KeyCombo[]
}
