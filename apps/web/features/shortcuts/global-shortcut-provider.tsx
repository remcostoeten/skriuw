'use client'

import { createContext, useEffect, useRef } from 'react'
import { logger } from '@/lib/logger'
import { initializeCommands } from '../commands/definitions'
import { initializeKeybindings, handleKeyboardEvent } from '../keybindings/manager'
import { ShortcutId } from './shortcut-definitions'

type ShortcutHandler = (event: KeyboardEvent) => void
type ShortcutRegistry = Map<ShortcutId, ShortcutHandler>

export type ShortcutContextValue = {
	register: (id: ShortcutId, handler: ShortcutHandler) => void
	unregister: (id: ShortcutId) => void
}

export const ShortcutContext = createContext<ShortcutContextValue | null>(null)

export const ShortcutProvider = ({ children }: { children: React.ReactNode }) => {
	const shortcuts = useRef<ShortcutRegistry>(new Map())
	const initialized = useRef(false)

	const registryManager = useRef<ShortcutContextValue>({
		register: (id: ShortcutId, handler: ShortcutHandler) => {
			// logger.info('shortcuts', `📝 Registering legacy shortcut: ${id}`)
			shortcuts.current.set(id, handler)
		},
		unregister: (id: ShortcutId) => {
			shortcuts.current.delete(id)
		},
	})

	// Initialize new command system
	useEffect(() => {
		if (!initialized.current) {
			initializeCommands()
			initializeKeybindings()
			initialized.current = true
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			// New system handles the event
			handleKeyboardEvent(event)
		}

		window.addEventListener('keydown', handleKeyDown, true)
		return () => window.removeEventListener('keydown', handleKeyDown, true)
	}, [])

	// Listen for commands triggered by the new system that target legacy handlers
	useEffect(() => {
		const handleCommand = (e: Event) => {
			const customEvent = e as CustomEvent
			const { id, context } = customEvent.detail
			const handler = shortcuts.current.get(id)

			if (handler) {
				logger.info('shortcuts', `✅ Executing legacy handler for: ${id}`)
				// Pass original event if available, otherwise mock or cast
				const originalEvent = context?.originalEvent as KeyboardEvent || new KeyboardEvent('keydown')
				handler(originalEvent)
			}
		}

		window.addEventListener('skriuw:command', handleCommand)
		return () => window.removeEventListener('skriuw:command', handleCommand)
	}, [])

	return (
		<ShortcutContext.Provider value={registryManager.current}>{children}</ShortcutContext.Provider>
	)
}
