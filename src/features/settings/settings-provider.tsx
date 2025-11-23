import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode
} from 'react'

import { getSettings, saveSettings } from './api'

interface SettingsContextValue {
    settings: Record<string, any>
    updateSetting: (key: string, value: any) => void
    resetSettings: () => void
    isLoading: boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

interface SettingsProviderProps {
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
    showToolbar: true,
    showFormattingToolbar: true,
    placeholder: 'Start typing your note...',
    centeredLayout: false,
    spellCheck: true,
    autoBackup: false,
    backupInterval: 3600000, // 1 hour
    maxBackupFiles: 10
} as const

export function SettingsProvider({
    children,
    defaultSettings = DEFAULT_SETTINGS
}: SettingsProviderProps) {
    const [settings, setSettings] =
        useState<Record<string, any>>(defaultSettings)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        loadSettings()
    }, [])

    useEffect(() => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')

        if (settings.theme === 'system') {
            const systemTheme = window.matchMedia(
                '(prefers-color-scheme: dark)'
            ).matches
                ? 'dark'
                : 'light'
            root.classList.add(systemTheme)
            return
        }

        root.classList.add(settings.theme)
    }, [settings.theme])

    const loadSettings = async () => {
        try {
            const storedSettings = await getSettings()
            if (storedSettings) {
                setSettings({ ...defaultSettings, ...storedSettings })
            }
        } catch (error) {
            console.error('Failed to load settings:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const saveSettingsToStorage = async (newSettings: Record<string, any>) => {
        try {
            await saveSettings(newSettings)
        } catch (error) {
            console.error('Failed to save settings:', error)
        }
    }

    const updateSetting = (key: string, value: any) => {
        const newSettings = { ...settings, [key]: value }
        setSettings(newSettings)
        saveSettingsToStorage(newSettings)
    }

    const resetSettings = () => {
        setSettings(defaultSettings)
        saveSettingsToStorage(defaultSettings)
    }

    const value: SettingsContextValue = {
        settings,
        updateSetting,
        resetSettings,
        isLoading
    }

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettingsContext() {
    const context = useContext(SettingsContext)
    if (!context) {
        throw new Error(
            'useSettingsContext must be used within a SettingsProvider'
        )
    }
    return context
}
