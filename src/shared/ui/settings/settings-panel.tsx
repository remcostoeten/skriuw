import { Edit, Palette, Settings } from 'lucide-react'
import React, { useState } from 'react'

import { cn } from '@/shared/utilities'
import { EDITOR_SETTINGS_GROUPS } from '@/features/settings/editor-settings'

import { Button } from 'ui'

import { SettingsGroup } from './settings-group'

interface SettingsPanelProps {
    settings: Record<string, any>
    onChange: (key: string, value: any) => void
    onReset?: () => void
    onExport?: () => void
    onImport?: (settings: string) => void
    disabled?: boolean
}

const TAB_ICONS: Record<string, React.ReactNode> = {
    editor: <Edit className="w-4 h-4" />,
    appearance: <Palette className="w-4 h-4" />,
    behavior: <Settings className="w-4 h-4" />
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

    const activeGroup = EDITOR_SETTINGS_GROUPS.find(
        (g) => g.category === activeTab
    )

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

            <div className="flex h-full gap-4">
                <aside className="flex flex-col items-center gap-4 h-full justify-start min-w-[160px]">
                    <div className="flex items-center justify-center h-full w-full gap-10">
                        <section className="flex flex-col items-start gap-2 w-full">
                            <div className="rounded-lg text-muted-foreground flex items-center justify-start flex-col w-full h-fit bg-transparent p-0 gap-1.5">
                                {EDITOR_SETTINGS_GROUPS.map((group) => {
                                    const isActive =
                                        activeTab === group.category
                                    return (
                                        <button
                                            key={group.category}
                                            onClick={() =>
                                                setActiveTab(group.category)
                                            }
                                            className={cn(
                                                'inline-flex whitespace-nowrap py-1 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 w-full h-7 rounded-lg px-3 hover:bg-accent hover:text-accent-foreground transition-transform active:scale-[98%] fill-muted-foreground/80 text-foreground/70 hover:fill-foreground items-center justify-start gap-2 text-sm font-normal',
                                                isActive &&
                                                    'text-foreground bg-accent fill-foreground'
                                            )}
                                            data-state={
                                                isActive ? 'active' : 'inactive'
                                            }
                                        >
                                            {TAB_ICONS[group.category]}
                                            <span>{group.title}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </section>
                    </div>
                </aside>
                <main className="flex flex-col items-start justify-start h-full w-full gap-3 px-1">
                    {activeGroup && (
                        <>
                            <h1 className="text-lg font-medium">
                                {activeGroup.title}
                            </h1>
                            <div className="space-y-5">
                                {renderTabContent(activeTab)}
                            </div>
                        </>
                    )}
                </main>
            </div>

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
