import { Search, Keyboard } from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@quantum-work/ui/card'
import { Input } from '@quantum-work/ui/input'

import { getShortcuts } from '../api/queries/get-shortcuts'
import { ShortcutId, shortcutDefinitions, KeyCombo } from '../shortcut-definitions'

type ShortcutState = {
	id: ShortcutId
	currentKeys: KeyCombo[]
	description: string
}

/**
 * Formats a key combo array to a readable string
 */
function formatKeyCombo(combo: KeyCombo): string {
	return combo.join(' + ')
}

/**
 * Formats shortcuts array to display string
 */
function formatShortcut(keyCombos: KeyCombo[]): string {
	if (keyCombos.length === 0) return 'Not set'
	return keyCombos.map(formatKeyCombo).join(' or ')
}

/**
 * Reference view component for displaying all keyboard shortcuts
 * This is a read-only view shown in the settings dialog
 */
export function ShortcutsReference() {
	const [shortcuts, setShortcuts] = useState<ShortcutState[]>([])
	const [searchQuery, setSearchQuery] = useState('')
	const searchInputRef = useRef<HTMLInputElement>(null)

	// Load shortcuts on mount
	useEffect(() => {
		loadShortcuts()
	}, [])

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
					description: definition.description || id,
				}
			})

		setShortcuts(shortcutStates)
	}

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

	// Group shortcuts by category (based on id prefix)
	const groupedShortcuts = useMemo(() => {
		const groups: Record<string, ShortcutState[]> = {}

		filteredShortcuts.forEach((shortcut) => {
			// Extract category from id (e.g., "editor-focus" -> "editor")
			const category = shortcut.id.split('-')[0] || 'other'
			if (!groups[category]) {
				groups[category] = []
			}
			groups[category].push(shortcut)
		})

		return groups
	}, [filteredShortcuts])

	const categoryLabels: Record<string, string> = {
		editor: 'Editor',
		toggle: 'Toggle',
		create: 'Create',
		open: 'Open',
		save: 'Save',
		search: 'Search',
		delete: 'Delete',
		other: 'Other',
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<Keyboard className="w-5 h-5 text-muted-foreground" />
					<h3 className="text-lg font-semibold text-foreground">Keyboard Shortcuts Reference</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					View all available keyboard shortcuts. Press{' '}
					<kbd className="px-1.5 py-0.5 rounded bg-secondary text-xs font-mono">Ctrl+/</kbd> or{' '}
					<kbd className="px-1.5 py-0.5 rounded bg-secondary text-xs font-mono">Meta+/</kbd> to
					customize shortcuts.
				</p>
			</div>

			{/* Search */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
				<Input
					ref={searchInputRef}
					type="text"
					placeholder="Search shortcuts..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 h-10 w-full"
					aria-label="Search shortcuts"
				/>
			</div>

			{/* Shortcuts List */}
			{filteredShortcuts.length === 0 ? (
				<div className="py-12 text-center">
					<p className="text-sm text-muted-foreground">
						{searchQuery.trim() ? 'No shortcuts found' : 'No shortcuts available'}
					</p>
				</div>
			) : (
				<div className="space-y-6">
					{Object.entries(groupedShortcuts)
						.sort(([a], [b]) => {
							// Sort categories: put "other" last
							if (a === 'other') return 1
							if (b === 'other') return -1
							return a.localeCompare(b)
						})
						.map(([category, categoryShortcuts]) => (
							<Card key={category}>
								<CardHeader>
									<CardTitle className="text-base">
										{categoryLabels[category] ||
											category.charAt(0).toUpperCase() + category.slice(1)}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-3">
										{categoryShortcuts.map((shortcut) => (
											<div
												key={shortcut.id}
												className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0"
											>
												<div className="flex-1 min-w-0">
													<p className="text-sm font-medium text-foreground">
														{shortcut.description}
													</p>
													<p className="text-xs text-muted-foreground/60 mt-0.5">{shortcut.id}</p>
												</div>
												<div className="flex items-center gap-2 shrink-0">
													{shortcut.currentKeys.map((combo, comboIndex) => (
														<span key={comboIndex} className="inline-flex items-center gap-1">
															{comboIndex > 0 && (
																<span className="text-xs text-muted-foreground mx-1">or</span>
															)}
															<kbd className="pointer-events-none inline-flex h-[22px] min-w-[22px] px-2 tracking-widest select-none items-center justify-center gap-1 rounded bg-secondary px-2 font-mono text-xs text-muted-foreground opacity-100">
																{combo.map((key, keyIndex) => (
																	<span key={keyIndex}>
																		{key}
																		{keyIndex < combo.length - 1 && (
																			<span className="mx-0.5">+</span>
																		)}
																	</span>
																))}
															</kbd>
														</span>
													))}
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						))}
				</div>
			)}
		</div>
	)
}
