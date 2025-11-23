import { useCallback } from 'react'

import { EDITOR_SETTINGS, validateEditorSetting } from './editor-settings'
import { useSettingsContext } from './settings-provider'

import type { SettingsConfig } from '@/shared/data/types'

export function useSettings<T extends Record<string, any> = any>() {
    const { settings, updateSetting, resetSettings, isLoading } =
        useSettingsContext()

    const getSetting = useCallback(
        <K extends keyof T>(key: K): T[K] => {
            return settings[key as string] as T[K]
        },
        [settings]
    )

    const setSetting = useCallback(
        <K extends keyof T>(key: K, value: T[K]) => {
            const validation = validateEditorSetting(key as string, value)
            if (validation !== true && typeof validation === 'string') {
                throw new Error(validation)
            }

            updateSetting(key as string, value)
        },
        [updateSetting]
    )

    const updateMultipleSettings = useCallback(
        (updates: Partial<T>) => {
            Object.entries(updates).forEach(([key, value]) => {
                // Validate each setting
                const validation = validateEditorSetting(key, value)
                if (validation !== true) {
                    console.warn(`Validation failed for ${key}:`, validation)
                    return
                }
                updateSetting(key, value)
            })
        },
        [updateSetting]
    )

    const resetToDefaults = useCallback(() => {
        resetSettings()
    }, [resetSettings])

    const exportSettings = useCallback((): string => {
        return JSON.stringify(settings, null, 2)
    }, [settings])

    const importSettings = useCallback(
        (settingsJson: string) => {
            try {
                const importedSettings = JSON.parse(settingsJson)
                Object.entries(importedSettings).forEach(([key, value]) => {
                    const validation = validateEditorSetting(key, value)
                    if (validation === true || typeof validation === 'string') {
                        updateSetting(key, value)
                    } else {
                        console.warn(
                            `Skipping invalid setting ${key}:`,
                            validation
                        )
                    }
                })
            } catch (error) {
                console.error('Failed to import settings:', error)
                throw new Error('Invalid settings JSON')
            }
        },
        [updateSetting]
    )

    // Type-safe getters for editor settings
    const editorSettings = EDITOR_SETTINGS.reduce((acc, setting) => {
        acc[setting.key as keyof T] = getSetting(setting.key as keyof T)
        return acc
    }, {} as T)

    return {
        // Raw access
        settings: settings as T,
        getSetting,
        setSetting,
        updateMultipleSettings,
        resetToDefaults,
        exportSettings,
        importSettings,

        // Editor-specific settings
        ...editorSettings,

        // State
        isLoading
    }
}

/**
 * Hook for managing individual editor settings with validation
 */
export function useEditorSetting<T = any>(key: string) {
    const { getSetting, setSetting } = useSettings()

    const setting = EDITOR_SETTINGS.find((s) => s.key === key)

    if (!setting) {
        throw new Error(`Unknown editor setting: ${key} as ${typeof key}`)
    }

    const value = getSetting(key as any) ?? setting.defaultValue

    const updateValue = useCallback(
        (newValue: T) => {
            // Validate the new value
            const validation = validateEditorSetting(key, newValue)
            if (validation !== true && typeof validation === 'string') {
                throw new Error(validation)
            }

            setSetting(key as any, newValue)
        },
        [key, setSetting]
    )

    return {
        value,
        setValue: updateValue,
        setting,
        isDefault: value === setting.defaultValue,
        reset: () => updateValue(setting.defaultValue as T)
    }
}

/**
 * Hook for typed settings with schema validation
 */
export function useTypedSettings<T extends Record<string, any>>(
    schema: Record<keyof T, SettingsConfig>
) {
    const { settings, updateSetting } = useSettingsContext()

    const getTypedSetting = useCallback(
        <K extends keyof T>(key: K): T[K] => {
            const config = schema[key]
            let value = settings[key as string]

            // Apply default value if not set
            if (value === undefined) {
                value = config.defaultValue
            }

            // Type validation and coercion
            switch (config.type) {
                case 'boolean':
                    return Boolean(value) as T[K]
                case 'number':
                    return Number(value) as T[K]
                case 'string':
                    return String(value) as T[K]
                case 'enum':
                    if (config.options && !config.options.includes(value)) {
                        return config.defaultValue as T[K]
                    }
                    return value as T[K]
                case 'object':
                    return typeof value === 'object'
                        ? (value as T[K])
                        : (config.defaultValue as T[K])
                default:
                    return value as T[K]
            }
        },
        [settings, schema]
    )

    const setTypedSetting = useCallback(
        <K extends keyof T>(key: K, value: T[K]) => {
            const config = schema[key]

            // Validation
            if (config.type === 'boolean' && typeof value !== 'boolean') {
                throw new Error(`Setting ${key as string} must be a boolean`)
            }
            if (config.type === 'number' && typeof value !== 'number') {
                throw new Error(`Setting ${key as string} must be a number`)
            }
            if (config.type === 'string' && typeof value !== 'string') {
                throw new Error(`Setting ${key as string} must be a string`)
            }
            if (
                config.type === 'enum' &&
                config.options &&
                !config.options.includes(value)
            ) {
                throw new Error(
                    `Setting ${key as string} must be one of: ${config.options.join(', ')}`
                )
            }
            if (config.type === 'object' && typeof value !== 'object') {
                throw new Error(`Setting ${key as string} must be an object`)
            }

            // Custom validation
            if (config.validation) {
                const result = config.validation(value)
                if (result !== true) {
                    throw new Error(
                        typeof result === 'string'
                            ? result
                            : 'Validation failed'
                    )
                }
            }

            updateSetting(key as string, value)
        },
        [schema, updateSetting]
    )

    return {
        getSetting: getTypedSetting,
        setSetting: setTypedSetting,
        schema
    }
}
