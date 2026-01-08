'use client'

import { useState } from 'react'
import {
    Activity,
    Upload,
    RotateCcw,
    Sprout,
    Trash2,
    Download,
    RefreshCw,
    Cookie,
    CheckCircle,
    AlertTriangle
} from 'lucide-react'
import { cn } from '@skriuw/shared'
import {
    downloadJsonExport,
    downloadMarkdownExport,
    importFromJson,
    importFromMarkdown
} from '@/features/backup'
import { notify } from '@/lib/notify'
import { useCookie } from '@/hooks/use-cookie'
import { useNotesContext } from '@/features/notes'
import { SectionLabel, ActionButton, StatCard } from './common'

type DbStats = {
    notes: number
    folders: number
    tasks: number
    settings: number
    shortcuts: number
    total: number
}

// Helper types for API
type DevApiResponse = {
    success?: boolean
    action?: string
    message?: string
    error?: string
    stats?: DbStats
    inSync?: boolean
    restartRequired?: boolean
}

export function DatabaseTab({
    stats,
    loading,
    fetchStats,
    resetPosition
}: {
    stats: DbStats | null | undefined
    loading: boolean
    fetchStats: () => Promise<void>
    resetPosition: () => void
}) {
    const { items, refreshItems } = useNotesContext()
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [schemaStatus, setSchemaStatus] = useState<{
        checked: boolean
        inSync: boolean
        message?: string
    } | null>(null)
    const {
        value: hideBadgeCookie,
        updateCookie,
        deleteCookie
    } = useCookie('hide-alpha-badge')
    const hasHeroCookie = hideBadgeCookie === 'true'

    const executeAction = async (action: string, confirmMsg?: string) => {
        if (confirmMsg && !confirm(confirmMsg)) return
        setActionLoading(action)

        if (action === 'reset-database') {
            if (
                !confirm(
                    'EXTREMELY DANGEROUS: This will drop ALL tables and lose ALL data. Type "DELETE" to confirm.'
                )
            ) {
                setActionLoading(null)
                return
            }
        }

        try {
            const res = await fetch('/api/dev', {
                method: 'POST',
                body: JSON.stringify({ action }),
                headers: { 'Content-Type': 'application/json' }
            })
            const data: DevApiResponse = await res.json()

            if (!res.ok) throw new Error(data.error || 'Action failed')

            if (action === 'check-schema') {
                setSchemaStatus({
                    checked: true,
                    inSync: !!data.inSync,
                    message: data.message
                })
            }

            notify(data.message || 'Action completed')

            if (data.restartRequired) {
                notify('Restart required. Reloading page...')
                setTimeout(() => window.location.reload(), 2000)
            } else {
                await fetchStats() // Refresh stats
                await refreshItems() // Refresh app content
            }
        } catch (err) {
            notify(err instanceof Error ? err.message : 'Action failed')
            if (action === 'check-schema') {
                setSchemaStatus({
                    checked: true,
                    inSync: false,
                    message: err instanceof Error ? err.message : 'Check failed'
                })
            }
        } finally {
            setActionLoading(null)
        }
    }

    const handleImport = (type: 'json' | 'md') => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = type === 'json' ? '.json' : '.md'
        input.multiple = type === 'md'

        input.onchange = async (e) => {
            const files = (e.target as HTMLInputElement).files
            if (!files?.length) return

            notify('Importing...')
            try {
                let importResult
                if (type === 'json') {
                    importResult = await importFromJson(await files[0].text())
                } else {
                    const contents = await Promise.all(
                        Array.from(files).map(async (f) => ({
                            name: f.name,
                            content: await f.text()
                        }))
                    )
                    importResult = await importFromMarkdown(contents)
                }

                if (!importResult.success) {
                    throw new Error(importResult.errors.join(', '))
                }

                const res = await fetch('/api/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: importResult.items })
                })

                if (!res.ok) {
                    const data = await res.json()
                    throw new Error(data.error || 'Import failed on server')
                }

                notify('Import successful')
                await refreshItems()
                fetchStats()
            } catch (err) {
                notify(err instanceof Error ? err.message : 'Import failed')
            }
        }
        input.click()
    }

    return (
        <>
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
                <StatCard
                    label="Notes"
                    value={stats?.notes ?? '-'}
                    loading={loading}
                />
                <StatCard
                    label="Folders"
                    value={stats?.folders ?? '-'}
                    loading={loading}
                />
                <StatCard
                    label="Tasks"
                    value={stats?.tasks ?? '-'}
                    loading={loading}
                />
            </div>

            <div className="space-y-2">
                <SectionLabel>Schema Manager</SectionLabel>
                <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            Sync Status
                        </span>
                        {schemaStatus?.checked ? (
                            <div
                                className={cn(
                                    'flex items-center gap-1.5 text-xs font-medium',
                                    schemaStatus.inSync
                                        ? 'text-emerald-600'
                                        : 'text-amber-600'
                                )}
                            >
                                {schemaStatus.inSync ? (
                                    <CheckCircle className="h-3 w-3" />
                                ) : (
                                    <AlertTriangle className="h-3 w-3" />
                                )}
                                {schemaStatus.inSync
                                    ? 'Synced'
                                    : 'Out of sync'}
                            </div>
                        ) : (
                            <span className="text-xs text-muted-foreground italic">
                                Not checked
                            </span>
                        )}
                    </div>

                    {!schemaStatus?.inSync && schemaStatus?.checked && (
                        <div className="text-xs text-amber-600 bg-amber-500/10 p-2 rounded">
                            {schemaStatus.message ||
                                'Database schema schema does not match code schema.'}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <ActionButton
                            icon={Activity}
                            label="Check Sync"
                            onClick={() => executeAction('check-schema')}
                            loading={actionLoading === 'check-schema'}
                        />
                        {schemaStatus?.checked && !schemaStatus.inSync && (
                            <ActionButton
                                icon={Upload}
                                label="Push Schema"
                                onClick={() => executeAction('push-schema')}
                                loading={actionLoading === 'push-schema'}
                            />
                        )}
                        <ActionButton
                            icon={RotateCcw}
                            label="Reset DB"
                            variant="destructive"
                            onClick={() => executeAction('reset-database')}
                            loading={actionLoading === 'reset-database'}
                        />
                    </div>
                </div>
            </div>

            {/* Actions Section */}
            <div className="space-y-2">
                <SectionLabel>Data Management</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                        icon={Sprout}
                        label="Seed Data"
                        onClick={() => executeAction('seed')}
                        loading={actionLoading === 'seed'}
                    />
                    <ActionButton
                        icon={Trash2}
                        label="Clear Data"
                        variant="destructive"
                        onClick={() => executeAction('clear-all')}
                        loading={actionLoading === 'clear-all'}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <SectionLabel>Transfer</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                        <ActionButton
                            icon={Download}
                            label="Export JSON"
                            onClick={() => downloadJsonExport(items)}
                        />
                        <ActionButton
                            icon={Download}
                            label="Export MD"
                            onClick={() => downloadMarkdownExport(items)}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <ActionButton
                            icon={Upload}
                            label="Import JSON"
                            onClick={() => handleImport('json')}
                        />
                        <ActionButton
                            icon={Upload}
                            label="Import MD"
                            onClick={() => handleImport('md')}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <SectionLabel>Cookies</SectionLabel>
                <ActionButton
                    icon={Cookie}
                    label={
                        hasHeroCookie
                            ? 'Show Hero Badge'
                            : 'Hide Hero Badge'
                    }
                    fullWidth
                    onClick={() => {
                        if (hasHeroCookie) {
                            deleteCookie()
                            notify(
                                'Hero badge is now visible'
                            )
                        } else {
                            updateCookie('true')
                            notify(
                                'Hero badge is now hidden'
                            )
                        }
                    }}
                />
            </div>

            <div className="space-y-2">
                <SectionLabel>System</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                        icon={RefreshCw}
                        label="Clear Cache"
                        onClick={() =>
                            executeAction('clear-cache')
                        }
                        loading={
                            actionLoading === 'clear-cache'
                        }
                    />
                    <ActionButton
                        icon={Download}
                        label="Reset Position"
                        onClick={resetPosition}
                        variant="default"
                    />
                </div>
            </div>

        </>
    )
}
