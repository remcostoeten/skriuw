import { CloudOff, Globe, Zap, Upload } from 'lucide-react'
import { useState, useMemo, useCallback } from 'react'

import { useSettingsContext } from '../../features/settings/settings-provider'
import { createShortcut } from '../../features/shortcuts/builder'
import { useShortcut } from '../../features/shortcuts/use-shortcut'

import { SidebarMenu } from '../sidebar-menu'
import { Kbd, ThemeToggle, Tooltip, TooltipContent, TooltipTrigger } from '@skriuw/ui'
import { useIsTouchDevice } from '@skriuw/shared/client'

export function Footer() {
	const [activeMenu, setActiveMenu] = useState<string | null>(null)
	const { settings, updateSetting } = useSettingsContext()
	const currentTheme = settings.theme || 'dark'
	const isTouchDevice = useIsTouchDevice()

	const isDark = useMemo(() => {
		if (currentTheme === 'dark') return true
		if (currentTheme === 'light') return false
		if (currentTheme === 'system') {
			return window.matchMedia('(prefers-color-scheme: dark)').matches
		}
		return true // default to dark
	}, [currentTheme])

	const handleThemeToggle = useCallback((isDarkMode: boolean) => {
		updateSetting('theme', isDarkMode ? 'dark' : 'light')
	}, [updateSetting])

	const handleCloseMenu = useCallback((open: boolean) => {
		if (!open) setActiveMenu(null)
	}, [])

	const handleThemeClick = useCallback(() => {
		setActiveMenu('theme')
	}, [])
	const handleOfflineClick = useCallback(() => setActiveMenu('offline'), [])
	const handleLanguageClick = useCallback(() => setActiveMenu('language'), [])
	const handlePerformanceClick = useCallback(() => setActiveMenu('performance'), [])
	const handleSyncClick = useCallback(() => setActiveMenu('sync'), [])

	useShortcut('toggle-theme', (e) => {
		e.preventDefault()
		handleThemeToggle(!isDark)
	})

	return (
		<>
			<footer className="fixed bottom-0 left-0 right-0 bg-sidebar-background border-t border-border flex items-center justify-between px-1.5 min-h-[2.25rem] pb-[env(safe-area-inset-bottom)]">
				<div className="flex items-center gap-1.5">
					{isTouchDevice ? (
						<button
							onClick={handleThemeClick}
							className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
							aria-label="Theme settings"
						>
							<ThemeToggle size={24} isDark={isDark} onChange={handleThemeToggle} />
						</button>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									onClick={handleThemeClick}
									className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
									aria-label="Theme settings"
								>
									<ThemeToggle size={24} isDark={isDark} onChange={handleThemeToggle} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="top" align="center">
								<div className="flex items-center gap-2">
									<span>Theme settings</span>
									<Kbd shortcut={createShortcut('Alt', 't')} />
								</div>
							</TooltipContent>
						</Tooltip>
					)}
					<button
						onClick={handleOfflineClick}
						className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
						aria-label="Offline mode"
					>
						<CloudOff className="w-4 h-4 text-muted-foreground" />
					</button>
				</div>

				<div className="flex items-center gap-1.5">
					<button
						onClick={handleLanguageClick}
						className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
						aria-label="Language settings"
					>
						<Globe className="w-4 h-4 text-muted-foreground" />
					</button>
					<button
						onClick={handlePerformanceClick}
						className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
						aria-label="Performance settings"
					>
						<Zap className="w-4 h-4 text-muted-foreground" />
					</button>
					<button
						onClick={handleSyncClick}
						className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
						aria-label="Sync settings"
					>
						<Upload className="w-4 h-4 text-muted-foreground" />
					</button>
				</div>
			</footer>

			<SidebarMenu
				open={activeMenu === 'theme'}
				onOpenChange={handleCloseMenu}
			/>
			<SidebarMenu
				open={activeMenu === 'offline'}
				onOpenChange={handleCloseMenu}
			/>
			<SidebarMenu
				open={activeMenu === 'language'}
				onOpenChange={handleCloseMenu}
			/>
			<SidebarMenu
				open={activeMenu === 'performance'}
				onOpenChange={handleCloseMenu}
			/>
			<SidebarMenu
				open={activeMenu === 'sync'}
				onOpenChange={handleCloseMenu}
			/>
		</>
	)
}
