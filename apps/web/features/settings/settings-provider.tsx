import { useSettingsQuery, useSaveSettingsMutation } from './hooks/use-settings-query'
import React, { createContext, useContext, useEffect, type ReactNode } from 'react'

type SettingsContextValue = {
	settings: Record<string, any>
	updateSetting: (key: string, value: any) => void
	resetSettings: () => void
	isLoading: boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

type SettingsProviderProps = {
	children: ReactNode
	defaultSettings?: Record<string, any>
}

const DEFAULT_SETTINGS = {
	theme: 'dark',
	fontSize: 'medium',
	autoSave: true,
	autoSaveInterval: 30000, // 30 seconds
	sidebarWidth: 280,
	showLineNumbers: false,
	wordWrap: true,
	blockIndicator: true,
	showFormattingToolbar: true,

	centeredLayout: true,
	spellCheck: true,
	autoBackup: false,
	backupInterval: 3600000, // 1 hour
	maxBackupFiles: 10,
	multiNoteTabs: false,
	defaultNoteTemplate: 'empty', // 'empty' | 'h1' | 'h2'
	editorTheme: 'skriuw-dark', // Monaco editor theme

	// Appearance
	fontFamily: 'inter',
	lineHeight: 1.4,
	maxWidth: 'full',

	// Storage connectors
	storageConnectors: [],

	// Templates & Placeholder
	disableTemplates: false,
	disableTemplates: false,
	bodyPlaceholder: '',

	// UI preferences
	'ui.animations': true,
	sidebarHierarchyGuides: false,
	showEditorMetadata: true
} as const

export function SettingsProvider({
	children,
	defaultSettings = DEFAULT_SETTINGS
}: SettingsProviderProps) {
	const { data: settingsEntity, isLoading: isQueryLoading } = useSettingsQuery()
	const { mutate: saveSettings } = useSaveSettingsMutation()

	// Derive settings from query data or defaults
	const settings = React.useMemo(() => {
		return {
			...defaultSettings,
			...settingsEntity?.settings
		}
	}, [defaultSettings, settingsEntity])

	// Initial loading state effectively handled by RQ,
	// but we can expose it if needed.
	// The original provider initialized isLoading=false and then set to true?
	// No, initialized false, then loadSettings set it?
	// "const [isLoading, setIsLoading] = useState(false)"
	// It seems it didn't block UI.
	const isLoading = isQueryLoading

	useEffect(() => {
		const root = window.document.documentElement

		// Remove inline style set by initialization script
		root.style.backgroundColor = ''

		// Determine the actual theme to apply
		let themeToApply: string
		if (settings.theme === 'system') {
			themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light'
		} else {
			themeToApply = settings.theme
		}

		// Only update if the theme class is not already applied
		if (!root.classList.contains(themeToApply)) {
			root.classList.remove('light', 'dark')
			root.classList.add(themeToApply)
		}
	}, [settings.theme])

	function updateSetting(key: string, value: any) {
		// Optimistically update via mutation
		const newSettings = { ...settings, [key]: value }
		// We pass the entire new settings object to the mutation
		// The mutation expects the map.
		saveSettings(newSettings)
	}

	function resetSettings() {
		saveSettings(defaultSettings)
	}

	const value: SettingsContextValue = {
		settings,
		updateSetting,
		resetSettings,
		isLoading
	}

	return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettingsContext() {
	const context = useContext(SettingsContext)
	if (!context) {
		throw new Error('useSettingsContext must be used within a SettingsProvider')
	}
	return context
}
