'use client'

import { ShortcutId, shortcutDefinitions, KeyCombo } from "./shortcut-definitions";
import { createContext, useEffect, useRef } from "react";

type ShortcutHandler = (event: KeyboardEvent) => void
type ShortcutRegistry = Map<ShortcutId, ShortcutHandler>

export type ShortcutContextValue = {
	register: (id: ShortcutId, handler: ShortcutHandler) => void
	unregister: (id: ShortcutId) => void
}

export const ShortcutContext = createContext<ShortcutContextValue | null>(null)

/**
 * Check if the current target is an input field where we should NOT trigger shortcuts
 */
function isInputField(target: EventTarget | null): boolean {
	if (!target || !(target instanceof HTMLElement)) return false

	const tagName = target.tagName.toLowerCase()
	const isContentEditable = target.isContentEditable

	return (
		tagName === 'input' ||
		tagName === 'textarea' ||
		tagName === 'select' ||
		isContentEditable ||
		target.closest('[contenteditable="true"]') !== null ||
		target.closest('.ProseMirror') !== null || // TipTap/ProseMirror editor
		target.closest('.bn-editor') !== null // BlockNote editor
	)
}

/**
 * Check if a keyboard event matches a key combination
 */
function matchesKeyCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
	const pressed = {
		ctrl: event.ctrlKey,
		meta: event.metaKey,
		alt: event.altKey,
		shift: event.shiftKey,
		key: event.key
	}

	// Check if all keys in the combo are pressed
	const hasCtrl = combo.includes('Ctrl')
	const hasMeta = combo.includes('Meta')
	const hasAlt = combo.includes('Alt')
	const hasShift = combo.includes('Shift')
	const regularKeys = combo.filter((k) => !['Ctrl', 'Meta', 'Alt', 'Shift'].includes(k))

	// Modifiers must match exactly
	if (hasCtrl && !pressed.ctrl) return false
	if (hasMeta && !pressed.meta) return false
	if (hasAlt && !pressed.alt) return false
	if (hasShift && !pressed.shift) return false

	// If combo has no modifiers, pressed event shouldn't have modifiers either
	// (except for special keys like Delete, Backspace, etc.)
	if (!hasCtrl && !hasMeta && !hasAlt && !hasShift) {
		const isSpecialKey = [
			'Delete',
			'Backspace',
			'ArrowLeft',
			'ArrowRight',
			'ArrowUp',
			'ArrowDown'
		].includes(event.key)
		if (!isSpecialKey && (pressed.ctrl || pressed.meta || pressed.alt)) {
			return false
		}
	}

	// Check if the regular key matches
	return regularKeys.length === 0 || regularKeys.some((k) => k === pressed.key)
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
	const shortcuts = useRef<ShortcutRegistry>(new Map())

	const registryManager = useRef<ShortcutContextValue>({
		register: (id: ShortcutId, handler: ShortcutHandler) => {
			shortcuts.current.set(id, handler)
		},
		unregister: (id: ShortcutId) => {
			shortcuts.current.delete(id)
		}
	})

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Don't trigger shortcuts in input fields (unless they have modifiers)
			const hasModifiers = event.ctrlKey || event.metaKey || event.altKey
			if (!hasModifiers && isInputField(event.target)) {
				return
			}

			// Check each registered shortcut
			for (const [id, handler] of shortcuts.current.entries()) {
				const definition = shortcutDefinitions[id]
				if (!definition || !definition.enabled) continue

				// Check if any of the key combinations match
				const matches = definition.keys.some((combo) => matchesKeyCombo(event, combo))

				if (matches) {
					event.preventDefault()
					event.stopPropagation()
					handler(event)
					break // Only trigger the first matching shortcut
				}
			}
		}

		window.addEventListener('keydown', handleKeyDown, true)
		return () => window.removeEventListener('keydown', handleKeyDown, true)
	}, [])

	return (
		<ShortcutContext.Provider value={registryManager.current}>
			{children}
		</ShortcutContext.Provider>
	)
}
