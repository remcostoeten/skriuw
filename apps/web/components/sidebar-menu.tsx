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
	ChevronDown,
	ChevronRight,
} from 'lucide-react'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useGesture } from '@use-gesture/react'

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
import { Button } from '@skriuw/ui/button'

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

interface MobileSettingsSectionProps {
	title: string
	children: React.ReactNode
	defaultExpanded?: boolean
	description?: string
}

// Mobile-optimized collapsible section component
function MobileSettingsSection({
	title,
	children,
	defaultExpanded = false,
	description,
}: MobileSettingsSectionProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded)
	const sectionId = title.toLowerCase().replace(/\s+/g, '-')

	return (
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				className="w-full px-4 py-4 flex items-center justify-between touch-manipulation hover:bg-accent/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
				aria-controls={`${sectionId}-content`}
				aria-describedby={description ? `${sectionId}-description` : undefined}
			>
				<div className="flex items-center gap-3 flex-1 text-left">
					<ChevronRight
						className={`w-5 h-5 transition-transform duration-200 flex-shrink-0 text-muted-foreground ${isExpanded ? 'rotate-90' : ''
							}`}
						aria-hidden="true"
					/>
					<div>
						<h3 className="text-base font-medium text-foreground">{title}</h3>
						{description && (
							<p id={`${sectionId}-description`} className="text-sm text-muted-foreground mt-1">
								{description}
							</p>
						)}
					</div>
				</div>
			</button>
			<div
				id={`${sectionId}-content`}
				className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'
					}`}
				aria-hidden={!isExpanded}
			>
				<div className="px-4 pb-4 pt-2">
					{children}
				</div>
			</div>
		</div>
	)
}

type props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function SidebarMenu({ open, onOpenChange }: props) {
	const [activeItem, setActiveItem] = useState<string>('editor')
	const { settings, updateMultipleSettings } = useSettings()

	// Mobile detection and state
	const [isMobile, setIsMobile] = useState(false)
	const drawerRef = useRef<HTMLDivElement>(null)

	// Shortcuts state
	const [shortcuts, setShortcuts] = useState<ShortcutState[]>([])
	const [recordingId, setRecordingId] = useState<ShortcutId | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const searchInputRef = useRef<HTMLInputElement>(null)
	const firstFocusableRef = useRef<HTMLButtonElement>(null)
	const previousFocusRef = useRef<HTMLElement | null>(null)

	// Detect mobile screen size
	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth < 768)
		}

		checkMobile()
		window.addEventListener('resize', checkMobile)
		return () => window.removeEventListener('resize', checkMobile)
	}, [])

	// Handle focus trapping
	useEffect(() => {
		if (open) {
			previousFocusRef.current = document.activeElement as HTMLElement
			// Focus first element after drawer opens
			setTimeout(() => {
				firstFocusableRef.current?.focus()
			}, 100)

			// Trap focus within drawer
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					onOpenChange(false)
					return
				}

				if (e.key === 'Tab') {
					const focusableElements = drawerRef.current?.querySelectorAll(
						'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
					) as NodeListOf<HTMLElement>

					if (!focusableElements.length) return

					const firstElement = focusableElements[0]
					const lastElement = focusableElements[focusableElements.length - 1]

					if (e.shiftKey) {
						if (document.activeElement === firstElement) {
							e.preventDefault()
							lastElement.focus()
						}
					} else {
						if (document.activeElement === lastElement) {
							e.preventDefault()
							firstElement.focus()
						}
					}
				}
			}

			document.addEventListener('keydown', handleKeyDown)
			return () => {
				document.removeEventListener('keydown', handleKeyDown)
				// Restore focus when drawer closes
				previousFocusRef.current?.focus()
			}
		}
	}, [open, onOpenChange])

	// Load shortcuts when opening settings or switching to shortcuts tab
	useEffect(() => {
		if (open && activeItem === 'shortcuts') {
			loadShortcuts()
		}
	}, [open, activeItem])

	const loadShortcuts = async () => {
		const customShortcuts = await getShortcuts()

		const shortcutStates: ShortcutState[] = Object.entries(shortcutDefinitions)
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

	const handleSettingChange = useCallback((key: string, value: unknown) => {
		updateMultipleSettings({ [key]: value })
	}, [updateMultipleSettings])

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

	function renderSettingsContent() {
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
			if (isMobile) {
				return (
					<div className="space-y-1">
						<MobileSettingsSection
							title={settingsGroup.title}
							description={settingsGroup.description}
							defaultExpanded
						>
							<SettingsGroupComponent
								group={settingsGroup}
								values={settings}
								onChange={handleSettingChange}
							/>
						</MobileSettingsSection>
					</div>
				)
			}
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
						<div className={`${isMobile ? 'px-4 pt-4' : ''} space-y-2`}>
							<h3 className={`${isMobile ? 'text-xl' : 'text-lg'} font-semibold text-foreground`}>Keyboard Shortcuts</h3>
							<p className="text-sm text-muted-foreground">
								Customize keyboard shortcuts for quick access to common actions.
							</p>
						</div>

						{/* Search */}
						<div className={`${isMobile ? 'px-4' : ''} relative`}>
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
							<Input
								ref={searchInputRef}
								type="text"
								placeholder="Search shortcuts..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className={`pl-9 ${isMobile ? 'h-11' : 'h-9'} w-full ${isMobile ? 'text-base' : ''}`}
								aria-label="Search shortcuts"
							/>
						</div>

						{/* Content */}
						<div className={`flex-1 overflow-y-auto ${isMobile ? 'px-4' : ''}`}>
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
						<div className={`${isMobile ? 'px-4 py-4' : 'pt-4'} border-t border-border`}>
							{isMobile ? (
								<Button
									onClick={handleResetAll}
									variant="outline"
									size="lg"
									className="w-full touch-manipulation"
								>
									Reset All to Defaults
								</Button>
							) : (
								<button
									onClick={handleResetAll}
									className="px-4 py-2 rounded-md border border-border hover:bg-accent/30 transition-colors text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								>
									Reset All to Defaults
								</button>
							)}
						</div>
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

	// Navigation items for mobile
	const navigationItems = [
		{
			id: 'editor',
			label: 'Editor',
			icon: <Pencil className="w-5 h-5" />,
			description: 'Editor preferences and behavior',
		},
		{
			id: 'appearance',
			label: 'Appearance',
			icon: <Palette className="w-5 h-5" />,
			description: 'Theme and visual settings',
		},
		{
			id: 'advanced',
			label: 'Advanced',
			icon: <Sliders className="w-5 h-5" />,
			description: 'Advanced configuration options',
		},
		{
			id: 'shortcuts',
			label: 'Shortcuts',
			icon: <Keyboard className="w-5 h-5" />,
			description: 'Keyboard shortcuts customization',
		},
		{
			id: 'Skriuw',
			label: 'Sync',
			icon: <Hand className="w-5 h-5" />,
			description: 'Data synchronization settings',
		},
	]

	// Mobile layout
	if (isMobile) {
		return (
			<DrawerDialog open={open} onOpenChange={onOpenChange}>
				<DrawerContent
					className="flex flex-col p-0 overflow-hidden max-h-[90vh] touch-manipulation"
					enableDragToClose
					dragThreshold={100}
				>
					<div
						ref={drawerRef}
						className="flex flex-col h-full"
					>
						{/* Drag handle for mobile */}
						<div className="flex justify-center py-2 cursor-grab active:cursor-grabbing">
							<div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
						</div>


						{/* Navigation */}
						<div className="border-b border-border">
							<nav role="navigation" aria-label="Settings sections">
								{navigationItems.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => setActiveItem(item.id)}
										className={`w-full px-4 py-3 flex items-center gap-3 touch-manipulation transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset ${activeItem === item.id
											? 'bg-accent/50 text-accent-foreground border-l-4 border-primary'
											: 'hover:bg-accent/30'
											}`}
										aria-current={activeItem === item.id ? 'page' : undefined}
									>
										<span className="flex-shrink-0">{item.icon}</span>
										<div className="text-left">
											<div className="font-medium">{item.label}</div>
											{item.description && (
												<div className="text-sm text-muted-foreground">{item.description}</div>
											)}
										</div>
									</button>
								))}
							</nav>
						</div>

						{/* Content */}
						<div className="flex-1 overflow-y-auto">
							{renderSettingsContent()}
						</div>
					</div>
				</DrawerContent>
			</DrawerDialog>
		)
	}

	// Desktop layout (preserve existing 2-column design)
	return (
		<DrawerDialog open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex flex-col p-0 overflow-hidden">
				<DrawerClose aria-label="Close settings" />
				<div className="flex flex-row flex-1 min-h-0 max-w-5xl mx-auto w-full">
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
