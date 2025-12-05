import { X, Search } from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'

import { createFocusTrap } from '@skriuw/core-logic/focus-trap'

import { Input } from '@skriuw/ui/input'

import { resetAllShortcuts } from '../api/mutations/reset-all-shortcuts'
import { resetShortcut } from '../api/mutations/reset-shortcut'
import { saveShortcut } from '../api/mutations/save-shortcut'
import { getShortcuts } from '../api/queries/get-shortcuts'
import { ShortcutId, shortcutDefinitions, KeyCombo } from '../shortcut-definitions'

import { ShortcutsList, ShortcutState } from './shortcuts-list'

type props = {
	isOpen: boolean
	onClose: () => void
}

/**
 * Sidebar panel for managing keyboard shortcuts
 * Allows users to view, customize, and reset shortcuts
 */
export function ShortcutsSidebar({ isOpen, onClose }: props) {
	const [shortcuts, setShortcuts] = useState<ShortcutState[]>([])
	const [recordingId, setRecordingId] = useState<ShortcutId | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const sidebarRef = useRef<HTMLDivElement>(null)
	const searchInputRef = useRef<HTMLInputElement>(null)

	// Load shortcuts on mount
	useEffect(() => {
		loadShortcuts()
	}, [])

	// Focus trap: trap focus inside the sidebar when open
	useEffect(() => {
		if (!isOpen || !sidebarRef.current) return

		const trap = createFocusTrap(sidebarRef.current)
		trap.activate()

		// Focus search input when sidebar opens
		if (searchInputRef.current) {
			setTimeout(() => {
				searchInputRef.current?.focus()
			}, 100)
		}

		return () => {
			trap.deactivate()
		}
	}, [isOpen])

	// Filter shortcuts based on search query
	const filteredShortcuts = useMemo(() => {
		if (!searchQuery.trim()) return shortcuts

		const query = searchQuery.toLowerCase().trim()
		return shortcuts.filter((shortcut) => {
			const matchesDescription = shortcut.description.toLowerCase().includes(query)
			const matchesId = shortcut.id.toLowerCase().includes(query)
			const matchesKeys = shortcut.currentKeys.some((combo) =>
				combo.join(' ').toLowerCase().includes(query)
			)
			return matchesDescription || matchesId || matchesKeys
		})
	}, [shortcuts, searchQuery])

	// Handle keyboard navigation for closing sidebar
	useEffect(() => {
		if (!isOpen) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (recordingId !== null) return

			if (e.key === 'Escape' && document.activeElement !== searchInputRef.current) {
				e.preventDefault()
				e.stopPropagation()
				onClose()
				return
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [isOpen, recordingId, onClose])

	const loadShortcuts = async () => {
		const customShortcuts = await getShortcuts()

		const shortcutStates: ShortcutState[] = Object.entries(shortcutDefinitions)
			.filter(([, definition]) => definition.enabled !== false)
			.map(([id, definition]) => {
				const shortcutId = id as ShortcutId
				const customKeys = customShortcuts[shortcutId]

				return {
					id: shortcutId,
					currentKeys: customKeys || definition.keys,
					defaultKeys: definition.keys,
					description: definition.description || id,
					isCustomized: !!customKeys,
				}
			})

		setShortcuts(shortcutStates)
	}

	const handleShortcutChange = async (id: ShortcutId, keys: KeyCombo[]) => {
		await saveShortcut(id, keys)
		await loadShortcuts()
		setRecordingId(null)
		window.dispatchEvent(new CustomEvent('shortcuts-updated'))
	}

	const handleResetShortcut = async (id: ShortcutId) => {
		await resetShortcut(id)
		await loadShortcuts()
		window.dispatchEvent(new CustomEvent('shortcuts-updated'))
	}

	const handleResetAll = async () => {
		if (confirm('Reset all shortcuts to defaults?')) {
			await resetAllShortcuts()
			await loadShortcuts()
			window.dispatchEvent(new CustomEvent('shortcuts-updated'))
		}
	}

	return (
		<>
			{/* Sidebar */}
			<div
				ref={sidebarRef}
				className={`fixed top-0 right-0 h-full w-full sm:w-[500px] bg-popover border-l border-border z-50 flex flex-col shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
					isOpen ? 'translate-x-0' : 'translate-x-full'
				}`}
				tabIndex={-1}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-border">
					<h2 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h2>
					<button
						onClick={onClose}
						className="p-2 rounded-md hover:bg-accent/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
						aria-label="Close shortcuts panel"
					>
						<X className="w-5 h-5 text-muted-foreground" />
					</button>
				</div>

				{/* Search */}
				<div className="p-4 border-b border-border">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
						<Input
							ref={searchInputRef}
							type="text"
							placeholder="Search shortcuts..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9 h-9 w-full"
							aria-label="Search shortcuts"
						/>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-4">
					{filteredShortcuts.length === 0 ? (
						<div className="py-12 text-center">
							<p className="text-sm text-muted-foreground">
								{searchQuery.trim() ? 'No shortcuts found' : 'No shortcuts available'}
							</p>
						</div>
					) : (
						<ShortcutsList
							shortcuts={filteredShortcuts}
							recordingId={recordingId}
							onShortcutChange={handleShortcutChange}
							onResetShortcut={handleResetShortcut}
							onStartRecording={setRecordingId}
							onStopRecording={() => setRecordingId(null)}
						/>
					)}
				</div>

				{/* Footer */}
				<div className="p-4 border-t border-border bg-popover">
					<button
						onClick={handleResetAll}
						className="w-full px-4 py-2 rounded-md border border-border hover:bg-accent/30 transition-colors text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					>
						Reset All to Defaults
					</button>
				</div>
			</div>
		</>
	)
}
