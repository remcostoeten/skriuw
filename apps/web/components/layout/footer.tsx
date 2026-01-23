'use client'

import { CloudOff, Globe, Zap, Upload, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useState, useMemo, useCallback, useEffect } from 'react'

import { useSettingsContext } from '../../features/settings/settings-provider'
import { createShortcut } from '../../features/shortcuts/builder'
import { useShortcut } from '../../features/shortcuts/use-shortcut'

import { SidebarMenu } from '../sidebar-menu'
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@skriuw/ui'
import { cn } from '@skriuw/shared'
import { useIsTouchDevice } from '@skriuw/shared/client'

const MENU_KEYS = {
	THEME: 'theme',
	OFFLINE: 'offline',
	LANGUAGE: 'language',
	PERFORMANCE: 'performance',
	SYNC: 'sync',
} as const

type MenuKey = typeof MENU_KEYS[keyof typeof MENU_KEYS]

export function Footer() {
	const [activeMenu, setActiveMenu] = useState<MenuKey | null>(null)
	const [isMounted, setIsMounted] = useState(false)
	const { settings, updateSetting } = useSettingsContext()
	const currentTheme = settings.theme || 'dark'
	const isTouchDevice = useIsTouchDevice()

	// Handle hydration safety for window based checks
	useEffect(() => {
		setIsMounted(true)
	}, [])

	const isDark = useMemo(() => {
		if (currentTheme === 'dark') return true
		if (currentTheme === 'light') return false
		if (currentTheme === 'system' && isMounted) {
			return window.matchMedia('(prefers-color-scheme: dark)').matches
		}
		return true // default to dark
	}, [currentTheme, isMounted])

	const handleThemeToggle = useCallback((isDarkMode: boolean) => {
		updateSetting('theme', isDarkMode ? 'dark' : 'light')
	}, [updateSetting])

	const handleOpenChange = useCallback((open: boolean) => {
		if (!open) setActiveMenu(null)
	}, [])

	useShortcut('toggle-theme', (e) => {
		e.preventDefault()
		handleThemeToggle(!isDark)
	})

	return (
		<>
			<footer className="hidden lg:flex fixed bottom-0 left-0 right-0 bg-sidebar-background border-t border-border flex flex-row items-center justify-between px-1.5 min-h-[2.25rem] pb-[env(safe-area-inset-bottom)]">
				<div className="flex items-center gap-1.5">
					<ThemeButton
						isTouchDevice={isTouchDevice}
						isDark={isDark}
						onToggle={handleThemeToggle}
					/>

					<FooterButton
						icon={CloudOff}
						onClick={() => setActiveMenu(MENU_KEYS.OFFLINE)}
						ariaLabel="Offline mode"
					/>
				</div>

				<div className="flex items-center gap-1.5">
					<FooterButton
						icon={Globe}
						onClick={() => setActiveMenu(MENU_KEYS.LANGUAGE)}
						ariaLabel="Language settings"
					/>
					<FooterButton
						icon={Zap}
						onClick={() => setActiveMenu(MENU_KEYS.PERFORMANCE)}
						ariaLabel="Performance settings"
					/>
					<FooterButton
						icon={Upload}
						onClick={() => setActiveMenu(MENU_KEYS.SYNC)}
						ariaLabel="Sync settings"
					/>
				</div>
			</footer>

			{/* Only need one instance of the menu - it internally handles state Based on whatever triggers it */}
			<SidebarMenu
				open={activeMenu !== null}
				onOpenChange={handleOpenChange}
			/>
		</>
	)
}

/**
 * Shared icon button component for the footer to reduce repetition
 */
function FooterButton({
	icon: Icon,
	onClick,
	ariaLabel,
	className
}: {
	icon: LucideIcon,
	onClick: () => void,
	ariaLabel: string,
	className?: string
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				className
			)}
			aria-label={ariaLabel}
		>
			<Icon className="w-4 h-4 text-muted-foreground" />
		</button>
	)
}

/**
 * Specialized theme toggle button with optional tooltip
 */
function ThemeButton({
	isTouchDevice,
	isDark,
	onToggle
}: {
	isTouchDevice: boolean,
	isDark: boolean,
	onToggle: (v: boolean) => void
}) {
	const content = (
		<FooterButton
			icon={isDark ? Moon : Sun}
			onClick={() => onToggle(!isDark)}
			ariaLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
		/>
	)

	if (isTouchDevice) return content

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="cursor-pointer">{content}</span>
			</TooltipTrigger>
			<TooltipContent side="top" align="center">
				<div className="flex items-center gap-2">
					<span>Theme settings</span>
					<Kbd shortcut={createShortcut('Alt', 't')} />
				</div>
			</TooltipContent>
		</Tooltip>
	)
}

