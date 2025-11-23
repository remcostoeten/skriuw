import React, { useState } from 'react'
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from 'ui'
import { SettingsGroup } from './settings-group'
import { EDITOR_SETTINGS_GROUPS } from '@/features/settings/editor-settings'
import type { UserSetting } from '@/shared/data/types'

interface SettingsPanelProps {
    settings: Record<string, any>
    onChange: (key: string, value: any) => void
    onReset?: () => void
    onExport?: () => void
    onImport?: (settings: string) => void
    disabled?: boolean
}

export function SettingsPanel({
    settings,
    onChange,
    onReset,
    onExport,
    onImport,
    disabled = false
}: SettingsPanelProps) {
    const [activeTab, setActiveTab] = useState('editor')

    const handleReset = () => {
        if (
            window.confirm(
                'Are you sure you want to reset all settings to their defaults?'
            )
        ) {
            onReset?.()
        }
    }

    const handleExport = () => {
        const settingsJson = JSON.stringify(settings, null, 2)
        const blob = new Blob([settingsJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'skriuw-settings.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        onExport?.()
    }

    const handleImport = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (file) {
                const reader = new FileReader()
                reader.onload = (e) => {
                    try {
                        const importedSettings = JSON.parse(
                            e.target?.result as string
                        )
                        onImport?.(importedSettings)
                    } catch (error) {
                        alert('Invalid settings file')
                    }
                }
                reader.readAsText(file)
            }
        }
        input.click()
    }

    const renderTabContent = (category: string) => {
        const group = EDITOR_SETTINGS_GROUPS.find(
            (g) => g.category === category
        )
        if (!group) return null

        return (
            <SettingsGroup
                group={group}
                values={settings}
                onChange={onChange}
                disabled={disabled}
            />
        )
    }

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Settings</h2>
                <div className="flex gap-2">
                    {onImport && (
                        <Button variant="outline" onClick={handleImport}>
                            Import
                        </Button>
                    )}
                    {onExport && (
                        <Button variant="outline" onClick={handleExport}>
                            Export
                        </Button>
                    )}
                    {onReset && (
                        <Button variant="outline" onClick={handleReset}>
                            Reset to Defaults
                        </Button>
                    )}
                </div>
            </div>

            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
            >
                <TabsList className="grid w-full grid-cols-3">
                    {EDITOR_SETTINGS_GROUPS.map((group) => (
                        <TabsTrigger
                            key={group.category}
                            value={group.category}
                        >
                            {group.title}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="mt-6">
                    <TabsContent value="editor" className="space-y-6">
                        {renderTabContent('editor')}
                    </TabsContent>

                    <TabsContent value="appearance" className="space-y-6">
                        {renderTabContent('appearance')}
                    </TabsContent>

                    <TabsContent value="behavior" className="space-y-6">
                        {renderTabContent('behavior')}
                    </TabsContent>
                </div>
            </Tabs>

            <div className="mt-8 p-4 bg-muted rounded-lg">
                <h3 className="font-medium mb-2">About Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Settings are automatically saved and apply immediately. Some
                    settings may require a restart to take effect.
                </p>
            </div>
        </div>
    )
}
