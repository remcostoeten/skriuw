import type { ShortcutId, KeyCombo } from './shortcut-definitions'
import type { BaseEntity } from '@/types/common'

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
	| string

export type DisplayKeyCombo = {
	modifiers?: Modifier[]
	key: RegularKey
}

export type SequenceDelay = {
	maxDelay?: number
}

export type ShortcutSequence =
	| [DisplayKeyCombo]
	| [DisplayKeyCombo, DisplayKeyCombo]
	| [DisplayKeyCombo, DisplayKeyCombo, DisplayKeyCombo]
	| [DisplayKeyCombo, SequenceDelay, DisplayKeyCombo]
	| [DisplayKeyCombo, DisplayKeyCombo, SequenceDelay, DisplayKeyCombo]
	| [DisplayKeyCombo, SequenceDelay, DisplayKeyCombo, SequenceDelay, DisplayKeyCombo]

export type DisplayFormat = 'text' | 'icon' | 'mixed'

export const MODIFIER_ICONS: Record<Modifier, string> = {
	Ctrl: '⌃',
	Cmd: '⌘',
	Alt: '⌥',
	Shift: '⇧',
	Meta: '⌘',
}

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

export type KeyboardShortcut = {
	sequences: ShortcutSequence[]
	displayFormat?: DisplayFormat
	description?: string
}

export type ShortcutBuilder = {
	modifiers: (...modifiers: Modifier[]) => ShortcutBuilder
	key: (key: RegularKey) => KeyboardShortcut
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

export interface CustomShortcut extends BaseEntity {
	id: ShortcutId
	keys: KeyCombo[]
	customizedAt: string
}

/**
 * Data required to create a custom shortcut
 */
export interface CreateCustomShortcutData {
	id: ShortcutId
	keys: KeyCombo[]
}
