import { X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

import { KeyCombo } from '../shortcut-definitions'

type ShortcutRecorderProps = {
	value: KeyCombo[]
	onChange: (keys: KeyCombo[]) => void
	onCancel?: () => void
	isRecording: boolean
	onStartRecording: () => void
	onStopRecording: () => void
}

/**
 * Component for recording keyboard shortcuts
 * Captures single keys or modifier + key combinations
 */
export function ShortcutRecorder({
	value,
	onChange,
	onCancel,
	isRecording,
	onStartRecording,
	onStopRecording,
}: ShortcutRecorderProps) {
	const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())
	const pressedKeysRef = useRef<Set<string>>(new Set())
	const inputRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isRecording) {
			setPressedKeys(new Set())
			pressedKeysRef.current = new Set()
			return
		}

		function saveCurrentCombo() {
			const currentKeys = pressedKeysRef.current
			if (currentKeys.size > 0) {
				// Sort keys: modifiers first (in consistent order), then the actual key
				const keysArray = Array.from(currentKeys)
				const modifierOrder = ['Ctrl', 'Meta', 'Shift', 'Alt']
				const modifiers = keysArray.filter((k) => modifierOrder.includes(k))
				const nonModifiers = keysArray.filter((k) => !modifierOrder.includes(k))

				// Sort modifiers according to the standard order
				const sortedModifiers = modifierOrder.filter((m) => modifiers.includes(m))
				const sortedKeys = [...sortedModifiers, ...nonModifiers]

				onChange([sortedKeys])
				onStopRecording()
			}
		}

		function handleKeyDown(e: KeyboardEvent) {
			e.preventDefault()
			e.stopPropagation()

			// Build the complete key combination from the current event state
			const keys = new Set<string>()

			// Add modifiers based on current keyboard state
			// These flags are always accurate for the current event
			if (e.ctrlKey) keys.add('Ctrl')
			if (e.metaKey) keys.add('Meta')
			if (e.shiftKey) keys.add('Shift')
			if (e.altKey) keys.add('Alt')

			// Add the actual key (if it's not a modifier key itself)
			const key = e.key
			const code = e.code // e.code gives us physical key position
			const modifierKeys = ['Control', 'Meta', 'Shift', 'Alt', 'CapsLock']

			if (!modifierKeys.includes(key)) {
				// Map special key names to their expected format
				const keyMap: Record<string, string> = {
					Backquote: '`',
					Backslash: '\\',
					BracketLeft: '[',
					BracketRight: ']',
					Comma: ',',
					Period: '.',
					Slash: '/',
					Semicolon: ';',
					Quote: "'",
					Minus: '-',
					Equal: '=',
					'`': '`', // Direct backquote support
					'~': '~', // Tilde support (Shift + backquote)
				}

				// Special handling for backquote key - prioritize e.code for physical key detection
				let normalizedKey = key
				if (code === 'Backquote' || key === 'Backquote') {
					normalizedKey = '`'
					console.log('Backquote key detected via code/key:', { key, code, keyCode: e.keyCode })
				} else {
					// Use mapped key if available, otherwise use the key as-is
					normalizedKey = keyMap[key] || key
				}

				// Debug logging for backquote key
				if (normalizedKey === '`') {
					console.log('Final backquote normalization:', {
						originalKey: key,
						code,
						normalizedKey,
						keyCode: e.keyCode,
					})
				}

				// Additional fallback for unusual key representations
				if (!normalizedKey || normalizedKey === 'undefined' || normalizedKey === 'null') {
					console.warn('Unrecognized key detected:', { key, code, keyCode: e.keyCode })
					// Try to get a meaningful representation
					normalizedKey = code || key || 'Unknown'
				}

				keys.add(normalizedKey)
			}

			// Update the ref and state with the complete combination
			pressedKeysRef.current = keys
			setPressedKeys(keys)
		}

		function handleKeyUp(e: KeyboardEvent) {
			// Only save when a non-modifier key is released
			// This ensures we capture the complete combination
			const isModifierKey = ['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)

			if (isModifierKey) {
				// Modifier keys can be released first, don't save yet
				// We'll save when the actual key is released
				return
			}

			e.preventDefault()
			e.stopPropagation()

			// Save the current combination when a non-modifier key is released
			saveCurrentCombo()
		}

		window.addEventListener('keydown', handleKeyDown, true)
		window.addEventListener('keyup', handleKeyUp, true)

		return () => {
			window.removeEventListener('keydown', handleKeyDown, true)
			window.removeEventListener('keyup', handleKeyUp, true)
		}
	}, [isRecording, onChange, onStopRecording])

	function formatKeyCombo(combo: KeyCombo): string {
		// Debug for backquote combos
		if (combo.some((key) => key === '`' || key === 'Backquote')) {
			console.log('Formatting backquote combo:', combo)
		}
		return combo.join(' + ')
	}

	function formatShortcut(keyCombos: KeyCombo[]): string {
		if (keyCombos.length === 0) return 'Not set'
		return keyCombos.map(formatKeyCombo).join(' or ')
	}

	function handleClick() {
		if (!isRecording) {
			onStartRecording()
			inputRef.current?.focus()
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		// Only handle Enter key when not recording and focused
		if (!isRecording && e.key === 'Enter') {
			e.preventDefault()
			e.stopPropagation()
			onStartRecording()
			inputRef.current?.focus()
		}
	}

	return (
		<div className="flex items-center gap-2">
			<div
				ref={inputRef}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				tabIndex={0}
				role="button"
				aria-label={isRecording ? 'Recording shortcut' : 'Click or press Enter to record shortcut'}
				className={`
          flex-1 px-3 py-2 rounded-md border text-sm
          transition-all duration-200 cursor-pointer
          ${
						isRecording
							? 'border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/20'
							: 'border-border bg-background hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-brand-500/50'
					}
        `}
			>
				{isRecording ? (
					<span className="text-brand-400 animate-pulse">
						{pressedKeys.size > 0
							? formatKeyCombo(Array.from(pressedKeys))
							: 'Press any key combination...'}
					</span>
				) : (
					<span className="text-foreground">{formatShortcut(value)}</span>
				)}
			</div>

			{isRecording && (
				<button
					onClick={() => {
						onStopRecording()
						onCancel?.()
					}}
					className="p-2 rounded-md hover:bg-accent/50 transition-colors"
					aria-label="Cancel recording"
				>
					<X className="w-4 h-4 text-muted-foreground" />
				</button>
			)}
		</div>
	)
}
