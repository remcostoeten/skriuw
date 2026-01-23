import type { KeyboardShortcut, DisplayKeyCombo, Modifier, RegularKey, SequenceBuilder, SequenceDelay, ShortcutBuilder } from "./types";

/**
 * Creates a new shortcut builder for easy DX
 * @example
 * shortcut().modifiers('Ctrl', 'Shift').key('N')
 * shortcut().combo('Ctrl', 'K').then('Ctrl', 'S')
 */
export function shortcut(): ShortcutBuilder {
	let currentModifiers: Modifier[] = []
	const currentKey: RegularKey | null = null
	let sequences: KeyboardShortcut['sequences'] = []

	const builder: ShortcutBuilder = {
		modifiers: (...modifiers: Modifier[]) => {
			currentModifiers = modifiers
			return builder
		},
		key: (key: RegularKey): KeyboardShortcut => {
			if (currentModifiers.length === 0) {
				sequences = [[{ key }]]
			} else {
				sequences = [[{ modifiers: currentModifiers, key }]]
			}
			return { sequences }
		},
		combo: (modifiers: Modifier | Modifier[] | undefined, key: RegularKey): SequenceBuilder => {
			const mods = modifiers ? (Array.isArray(modifiers) ? modifiers : [modifiers]) : []
			const firstCombo: DisplayKeyCombo = mods.length > 0 ? { modifiers: mods, key } : { key }
			sequences = [[firstCombo]]

			const sequenceBuilder: SequenceBuilder = {
				then: (
					nextModifiers: Modifier | Modifier[] | undefined,
					nextKey: RegularKey,
					delay?: SequenceDelay
				): SequenceBuilder => {
					const nextMods = nextModifiers
						? Array.isArray(nextModifiers)
							? nextModifiers
							: [nextModifiers]
						: []
					const nextCombo: DisplayKeyCombo =
						nextMods.length > 0
							? { modifiers: nextMods, key: nextKey }
							: { key: nextKey }

					const currentSequence = sequences[0] as any[]
					if (currentSequence.length === 1) {
						// First sequence, add delay and next combo
						if (delay) {
							sequences[0] = [currentSequence[0], delay, nextCombo] as any
						} else {
							sequences[0] = [currentSequence[0], nextCombo] as any
						}
					} else if (currentSequence.length === 3) {
						// Second sequence, add delay and final combo
						if (delay) {
							sequences[0] = [...currentSequence, delay, nextCombo] as any
						} else {
							sequences[0] = [...currentSequence, nextCombo] as any
						}
					}

					return sequenceBuilder
				},
				build: (): KeyboardShortcut => {
					return { sequences }
				}
			}

			return sequenceBuilder
		}
	}

	return builder
}

/**
 * Helper function to create a simple shortcut
 * @example
 * createShortcut('Ctrl', 'N')
 * createShortcut(['Ctrl', 'Shift'], 'N')
 */
export function createShortcut(
	modifiers: Modifier | Modifier[],
	key: RegularKey
): KeyboardShortcut {
	const mods = Array.isArray(modifiers) ? modifiers : [modifiers]
	return {
		sequences: [[{ modifiers: mods, key }]]
	}
}

/**
 * Helper function to create a sequence shortcut
 * @example
 * createSequence(
 *   [{ modifiers: ['Ctrl'], key: 'K' }],
 *   [{ modifiers: ['Ctrl'], key: 'S' }]
 * )
 */
export function createSequence(...combos: DisplayKeyCombo[]): KeyboardShortcut {
	if (combos.length === 0) {
		throw new Error('Sequence must have at least one key combination')
	}
	if (combos.length > 3) {
		throw new Error('Sequence can have at most 3 key combinations')
	}
	return {
		sequences: [combos as any]
	}
}
