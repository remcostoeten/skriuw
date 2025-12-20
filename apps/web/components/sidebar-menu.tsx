'use client'

import {
	Pencil,
	Hand,
	Keyboard,
	Settings,
	Palette,
	Sliders,
	Search,
	X,
} from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'

import {
	DrawerDialog,
	DrawerContent,
	DrawerClose,
	DrawerHeader,
	DrawerTitle,
	DrawerFooter,
	DialogAside,
	DialogContentArea,
	DialogNavGroup,
	DialogSection,
	DialogSeparator,
} from '@skriuw/ui/dialog-drawer'
import { Input } from '@skriuw/ui/input'

import { useSettings, SettingsGroup as SettingsGroupComponent } from '../features/settings'
import { EDITOR_SETTINGS_GROUPS } from '../features/settings/editor-settings'

import { StorageAdaptersPanel } from '@/features/backup/components/storage-adapters-panel'
import { ShortcutsList, ShortcutState } from '../features/shortcuts/components/shortcuts-list'
import { resetAllShortcuts } from '../features/shortcuts/api/mutations/reset-all-shortcuts'
import { resetShortcut } from '../features/shortcuts/api/mutations/reset-shortcut'
import { saveShortcut } from '../features/shortcuts/api/mutations/save-shortcut'
import { getShortcuts } from '../features/shortcuts/api/queries/get-shortcuts'
import { ShortcutId, shortcutDefinitions, KeyCombo } from '../features/shortcuts/shortcut-definitions'
import type { SettingsGroup as SettingsGroupDefinition } from '../features/settings/types'

type props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function SidebarMenu({ open, onOpenChange }: props) {
	const [activeItem, setActiveItem] = useState<string>('editor')
	const { settings, updateMultipleSettings } = useSettings()

	// Shortcuts state
	const [shortcuts, setShortcuts] = useState<ShortcutState[]>([])
	const [recordingId, setRecordingId] = useState<ShortcutId | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const searchInputRef = useRef<HTMLInputElement>(null)

	// Load shortcuts when opening settings or switching to shortcuts tab
	useEffect(() => {
		if (open && activeItem === 'shortcuts') {
			loadShortcuts()
		}
	}, [open, activeItem])

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

	const appItems = [
		{
			id: 'editor',
			label: 'Editor',
			icon: <Pencil className="w-4 h-4" />,
			active: activeItem === 'editor',
			onClick: () => setActiveItem('editor'),
		},
		{
			id: 'appearance',
			label: 'Appearance',
			icon: <Palette className="w-4 h-4" />,
			active: activeItem === 'appearance',
			onClick: () => setActiveItem('appearance'),
		},

		{
			id: 'advanced',
			label: 'Advanced',
			icon: <Sliders className="w-4 h-4" />,
			active: activeItem === 'advanced',
			onClick: () => setActiveItem('advanced'),
		},
		{
			id: 'shortcuts',
			label: 'Shortcuts',
			icon: <Keyboard className="w-4 h-4" />,
			active: activeItem === 'shortcuts',
			onClick: () => setActiveItem('shortcuts'),
		},
	]

	const syncItems = [
		{
			id: 'Skriuw',
			label: 'Skriuw Sync',
			icon: <Hand className="w-4 h-4" />,
			active: activeItem === 'Skriuw',
			onClick: () => setActiveItem('Skriuw'),
		},
	]

	const handleSettingChange = (key: string, value: unknown) => {
		updateMultipleSettings({ [key]: value })
	}

	const renderSettingsContent = () => {
		const animationSetting: SettingsGroupDefinition = {
			category: 'appearance',
			title: 'UI Preferences',
			description: 'Global interface preferences',
			settings: [
				{
					key: 'ui.animations',
					label: 'UI Animations',
					value: settings['ui.animations'] !== false,
					defaultValue: true,
					type: 'boolean',
					description: 'Enable interface transitions and motion effects across the app',
					category: 'appearance',
					implemented: true,
				},
			],
		}

		const allSettingsGroups = [...EDITOR_SETTINGS_GROUPS, animationSetting]
		const settingsGroup = allSettingsGroups.find((group) => group.category === activeItem)

		if (settingsGroup) {
			return (
				<SettingsGroupComponent
					group={settingsGroup}
					values={settings}
					onChange={handleSettingChange}
				/>
			)
		}

		// Placeholder content for non-settings sections
		switch (activeItem) {
			case 'shortcuts':
				return (
					<div className="space-y-6">
						<div className="space-y-2">
							<h3 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h3>
							<p className="text-sm text-muted-foreground">
								Customize keyboard shortcuts for quick access to common actions.
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
								className="pl-9 h-9 w-full"
								aria-label="Search shortcuts"
							/>
						</div>

						{/* Content */}
						<div className="flex-1 overflow-y-auto">
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
						<div className="pt-4 border-t border-border">
							<button
								onClick={handleResetAll}
								className="px-4 py-2 rounded-md border border-border hover:bg-accent/30 transition-colors text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							>
								Reset All to Defaults
							</button>
						</div>
					</div>
				)
			case 'Skriuw':
				return (
					<div className="space-y-4">
						<div className="pb-4 mb-2 border-b border-border">
							<h2 className="text-xl font-semibold text-foreground">Skriuw Sync</h2>
							<p className="text-sm text-muted-foreground mt-1">
								Configure Skriuw synchronization settings.
							</p>
						</div>
						<div className="text-sm text-muted-foreground">Sync functionality coming soon...</div>
					</div>
				)
			case 'Skriuw':
				return (
					<div className="space-y-4">
						<div className="pb-4 mb-2 border-b border-border">
							<h3 className="text-xl font-semibold text-foreground">Skriuw Sync</h3>
							<p className="text-sm text-muted-foreground mt-1">
								Connect a cloud destination for backups and syncing.
							</p>
						</div>
						<StorageAdaptersPanel />
					</div>
				)
			default:
				return null
		}
	}

	return (
		<DrawerDialog open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex flex-col p-0 overflow-hidden">
				<DrawerClose aria-label="Close settings" />
				<div className="flex flex-row flex-1 min-h-0 max-w-5xl mx-auto w-full ">
					<DialogAside className="min-w-[220px] max-w-[220px] border-r border-border/50 bg-background/50 p-6 overflow-y-auto h-full">
						<DrawerHeader className="w-full pb-6">
							<DrawerTitle className="text-xl">Settings</DrawerTitle>
						</DrawerHeader>
						<DialogSection label="App">
							<DialogNavGroup items={appItems} />
						</DialogSection>

						<DialogSeparator className="my-4 bg-border/50" />

						<DialogSection label="Synchronization">
							<DialogNavGroup items={syncItems} />
						</DialogSection>
					</DialogAside>

					<DialogContentArea className="flex-1 min-w-0 p-8 overflow-y-auto h-full bg-background">
						<div className="max-w-2xl mx-auto w-full">{renderSettingsContent()}</div>
					</DialogContentArea>
				</div>
			</DrawerContent>
		</DrawerDialog>
	)
}
