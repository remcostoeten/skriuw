'use client'

import { useState, useCallback } from 'react'
import { CheckCircle, XCircle, Clock, Play } from 'lucide-react'
import { notify } from '@/lib/notify'
import { cn } from '@skriuw/shared'
import { SectionLabel, ActionButton } from './common'

type CronStatus = {
    lastRun?: string
    status: 'success' | 'failed' | 'never'
    totalDeleted: number
    runHistory: Array<{
        timestamp: string
        status: 'success' | 'failed'
        usersDeleted: number
        error?: string
    }>
}

export function CronTab() {
    const [cronStatus, setCronStatus] = useState<CronStatus>({
        status: 'never',
        totalDeleted: 0,
        runHistory: []
    })
    const [cleanupLoading, setCleanupLoading] = useState(false)

    const runCleanup = useCallback(async (dryRun = false) => {
        setCleanupLoading(true)
        try {
            const res = await fetch('/api/cron/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer dev-cleanup-secret`
                },
                body: JSON.stringify({ dryRun })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Cleanup failed')
            }

            notify(data.message || (dryRun ? 'Dry run completed' : 'Cleanup completed'))

            setCronStatus((prev) => ({
                ...prev,
                lastRun: new Date().toISOString(),
                status: 'success',
                totalDeleted: prev.totalDeleted + (data.deletedCount || 0),
                runHistory: [
                    {
                        timestamp: new Date().toISOString(),
                        status: 'success',
                        usersDeleted: data.deletedCount || 0
                    },
                    ...prev.runHistory.slice(0, 9)
                ]
            }))
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Cleanup failed'
            notify(errorMsg)

            setCronStatus((prev) => ({
                ...prev,
                lastRun: new Date().toISOString(),
                status: 'failed',
                runHistory: [
                    {
                        timestamp: new Date().toISOString(),
                        status: 'failed',
                        usersDeleted: 0,
                        error: errorMsg
                    },
                    ...prev.runHistory.slice(0, 9)
                ]
            }))
        } finally {
            setCleanupLoading(false)
        }
    }, [])

    return (
        <>
            <div className="space-y-2">
                <SectionLabel>Cleanup Status</SectionLabel>
                <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Status</span>
                        <div
                            className={cn(
                                'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium',
                                cronStatus.status === 'success'
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : cronStatus.status === 'failed'
                                        ? 'bg-red-500/10 text-red-600'
                                        : 'bg-gray-500/10 text-gray-600'
                            )}
                        >
                            {cronStatus.status === 'success' && <CheckCircle className="h-3 w-3" />}
                            {cronStatus.status === 'failed' && <XCircle className="h-3 w-3" />}
                            {cronStatus.status === 'never' && <Clock className="h-3 w-3" />}
                            {cronStatus.status.toUpperCase()}
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Total Deleted</span>
                        <span className="text-xs font-bold">{cronStatus.totalDeleted}</span>
                    </div>

                    {cronStatus.lastRun && (
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Last Run</span>
                            <span className="text-xs">{new Date(cronStatus.lastRun).toLocaleString()}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <SectionLabel>Manual Cleanup</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                        icon={Play}
                        label="Run Cleanup"
                        onClick={() => runCleanup(false)}
                        loading={cleanupLoading}
                        variant="default"
                    />
                    <ActionButton
                        icon={Clock}
                        label="Dry Run"
                        onClick={() => runCleanup(true)}
                        loading={cleanupLoading}
                        variant="default"
                    />
                </div>
            </div>

            {cronStatus.runHistory.length > 0 && (
                <div className="space-y-2">
                    <SectionLabel>Run History</SectionLabel>
                    <div className="bg-muted/30 border rounded-lg p-2 space-y-1 text-xs max-h-40 overflow-y-auto custom-scrollbar">
                        {cronStatus.runHistory.map((run, index) => (
                            <div key={index} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50">
                                <div className="flex items-center gap-2">
                                    {run.status === 'success' ? (
                                        <CheckCircle className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                        <XCircle className="h-3 w-3 text-red-500" />
                                    )}
                                    <span>{new Date(run.timestamp).toLocaleString()}</span>
                                </div>
                                <span className="font-medium">{run.usersDeleted} deleted</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}
