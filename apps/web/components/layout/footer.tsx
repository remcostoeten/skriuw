import { CloudOff, Globe, Zap, Upload } from 'lucide-react'
import { useState, useMemo } from 'react'

import { useSettingsContext } from '../../features/settings/settings-provider'
import { createShortcut } from '../../features/shortcuts/builder'
import { useShortcut } from '../../features/shortcuts/use-shortcut'

import { SidebarMenu } from '../sidebar-menu'
import { Kbd, ThemeToggle, Tooltip, TooltipContent, TooltipTrigger } from '@skriuw/ui'
import { useIsTouchDevice } from '@skriuw/core-logic/use-is-touch-device'

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

	const handleThemeToggle = (isDarkMode: boolean) => {
		updateSetting('theme', isDarkMode ? 'dark' : 'light')
	}

	useShortcut('toggle-theme', (e) => {
		e.preventDefault()
		handleThemeToggle(!isDark)
	})

        return (
                <>
                        <footer className="fixed bottom-0 left-0 right-0 bg-sidebar-background border-t border-border flex items-center justify-between px-1.5 min-h-[2.25rem] pb-[env(safe-area-inset-bottom)]">
                                <div className="flex items-center gap-1.5">
                                        {isTouchDevice ? (
                                                <div className="w-6 h-6 flex items-center justify-center" aria-label="Toggle theme">
                                                        <ThemeToggle size={24} isDark={isDark} onChange={handleThemeToggle} />
                                                </div>
                                        ) : (
                                                <Tooltip>
                                                        <TooltipTrigger asChild>
                                                                <div className="w-6 h-6 flex items-center justify-center">
                                                                        <ThemeToggle size={24} isDark={isDark} onChange={handleThemeToggle} />
                                                                </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" align="center">
                                                                <div className="flex items-center gap-2">
                                                                        <span>Toggle theme</span>
                                                                        <Kbd shortcut={createShortcut('Alt', 't')} />
                                                                </div>
                                                        </TooltipContent>
                                                </Tooltip>
                                        )}
                                        <button
                                                onClick={() => setActiveMenu('offline')}
                                                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
                                                aria-label="Offline mode"
                                        >
						<CloudOff className="w-4 h-4 text-muted-foreground" />
					</button>
				</div>

				<div className="flex items-center gap-1.5">
					<button
						onClick={() => setActiveMenu('language')}
						className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
						aria-label="Language settings"
					>
						<Globe className="w-4 h-4 text-muted-foreground" />
					</button>
					<button
						onClick={() => setActiveMenu('performance')}
						className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
						aria-label="Performance settings"
					>
						<Zap className="w-4 h-4 text-muted-foreground" />
					</button>
					<button
						onClick={() => setActiveMenu('sync')}
						className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
						aria-label="Sync settings"
					>
						<Upload className="w-4 h-4 text-muted-foreground" />
					</button>
				</div>
			</footer>

			<SidebarMenu
				open={activeMenu === 'theme'}
				onOpenChange={(open) => !open && setActiveMenu(null)}
			/>
			<SidebarMenu
				open={activeMenu === 'offline'}
				onOpenChange={(open) => !open && setActiveMenu(null)}
			/>
			<SidebarMenu
				open={activeMenu === 'language'}
				onOpenChange={(open) => !open && setActiveMenu(null)}
			/>
			<SidebarMenu
				open={activeMenu === 'performance'}
				onOpenChange={(open) => !open && setActiveMenu(null)}
			/>
			<SidebarMenu
				open={activeMenu === 'sync'}
				onOpenChange={(open) => !open && setActiveMenu(null)}
			/>
		</>
	)
}
