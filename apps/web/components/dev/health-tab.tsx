'use client'

import { Activity } from 'lucide-react'
import { cn } from '@skriuw/shared'
import { SectionLabel, ActionButton } from './common'

export function HealthTab({
    isConnected,
    provider,
    loading,
    fetchStats
}: {
    isConnected: boolean | null
    provider: 'neon' | 'postgres' | null
    loading: boolean
    fetchStats: () => void
}) {
    return (
        <>
            <div className="space-y-2">
                <SectionLabel>System Health</SectionLabel>
                <div className="space-y-3">
                    <div className="bg-muted/30 border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Database</span>
                            <div
                                className={cn(
                                    'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium',
                                    isConnected
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : 'bg-red-500/10 text-red-600'
                                )}
                            >
                                <div
                                    className={cn(
                                        'h-1.5 w-1.5 rounded-full animate-pulse',
                                        isConnected ? 'bg-emerald-500' : 'bg-red-500'
                                    )}
                                />
                                {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                            </div>
                        </div>
                    </div>

                    {provider && (
                        <div className="bg-muted/30 border rounded-lg p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">Provider</span>
                                <div
                                    className={cn(
                                        'px-2 py-1 rounded-full text-[10px] font-medium',
                                        provider === 'neon'
                                            ? 'bg-orange-500/10 text-orange-600'
                                            : 'bg-blue-500/10 text-blue-600'
                                    )}
                                >
                                    {provider === 'neon' ? 'NEON' : 'POSTGRES'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <ActionButton
                    icon={Activity}
                    label="Refresh Health"
                    onClick={fetchStats}
                    loading={loading}
                />
            </div>
        </>
    )
}
