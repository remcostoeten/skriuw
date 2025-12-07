'use client'

import { Pencil, Hand, Keyboard, Settings, Palette, Sliders } from 'lucide-react'
import { useState } from 'react'

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

import { useSettings, SettingsGroup } from '../features/settings'
import { EDITOR_SETTINGS_GROUPS } from '../features/settings/editor-settings'
import { ShortcutsReference } from '../features/shortcuts/components'

type props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function SidebarMenu({ open, onOpenChange }: props) {
	const [activeItem, setActiveItem] = useState<string>('editor')
	const { settings, updateMultipleSettings } = useSettings()

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
		const settingsGroup = EDITOR_SETTINGS_GROUPS.find((group) => group.category === activeItem)

		if (settingsGroup) {
			return (
				<SettingsGroup group={settingsGroup} values={settings} onChange={handleSettingChange} />
			)
		}

		// Placeholder content for non-settings sections
		switch (activeItem) {
			case 'shortcuts':
				return <ShortcutsReference />
			case 'Skriuw':
				return (
					<div className="space-y-4">
						<div className="pb-4 mb-2 border-b border-border">
							<h2 className="text-xl font-semibold text-foreground">Skriuw Sync</h2>
							<p className="text-sm text-muted-foreground mt-1">
								Configure Skriuw synchronization settings.
							</p>
						</div>
						<div className="text-sm text-muted-foreground">
							Sync functionality coming soon...
						</div>
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
						<div className="max-w-2xl mx-auto w-full">
							{renderSettingsContent()}
						</div>
					</DialogContentArea>
				</div>
			</DrawerContent>
		</DrawerDialog>
	)
}
