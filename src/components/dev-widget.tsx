import { Database, Route as RouteIcon, Activity, X } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

import { getDatabase } from '@/shared/database/client'
import { notes, folders, settings } from '@/shared/database/schema'
import { devEventTracker } from '@/shared/dev/dev-event-tracker'
import { cn } from '@/shared/utilities'

interface DatabaseTableInfo {
    tableName: string
    rowCount: number
    sampleData?: unknown[]
}

export function DevWidget() {
    const [isOpen, setIsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'route' | 'storage' | 'queries'>('route')
    const [databaseInfo, setDatabaseInfo] = useState<{
        dialect: string
        connected: boolean
        tables?: DatabaseTableInfo[]
    } | null>(null)
    const [isLoadingSchema, setIsLoadingSchema] = useState(false)
    const [queryLog, setQueryLog] = useState<Array<{ 
        type: 'query' | 'mutation' | 'route'
        table?: string
        timestamp: Date
        operation: string
        error?: string
    }>>([])
    
    const location = useLocation()

    // Subscribe to dev events
    useEffect(() => {
        const unsubscribe = devEventTracker.subscribe((event) => {
            setQueryLog(prev => [
                ...prev.slice(-99), // Keep last 100 entries
                {
                    type: event.type,
                    table: event.storageKey, // Treat storageKey as table name for Drizzle
                    timestamp: event.timestamp,
                    operation: `${event.operation} ${event.storageKey}`,
                    error: event.error
                }
            ])
        })

        return unsubscribe
    }, [])

    // Get database info and schema
    const refreshDatabaseInfo = useCallback(async () => {
        setIsLoadingSchema(true)
        try {
            let connected = false

            try {
                const db = await getDatabase()
                // Test connection by trying to query
                await db.select().from(notes).limit(1)
                connected = true
            } catch {
                connected = false
            }

            setDatabaseInfo({
                dialect: 'neon/postgresql',
                connected,
                tables: [] // Will be populated in loadDatabaseSchema
            })
        } catch (error) {
            console.error('Failed to get database info:', error)
            setDatabaseInfo({
                dialect: 'neon/postgresql',
                connected: false
            })
        } finally {
            setIsLoadingSchema(false)
        }
    }, [])

    // Load database schema and data
    const loadDatabaseSchema = useCallback(async () => {
        setIsLoadingSchema(true)
        try {
            const db = await getDatabase()
            const tables: DatabaseTableInfo[] = []

            // Fetch notes
            try {
                const allNotes = await db.select().from(notes)
                tables.push({
                    tableName: 'notes',
                    rowCount: allNotes.length,
                    sampleData: allNotes.slice(0, 10)
                })
            } catch (err) {
                console.error('Failed to load notes:', err)
            }

            // Fetch folders
            try {
                const allFolders = await db.select().from(folders)
                tables.push({
                    tableName: 'folders',
                    rowCount: allFolders.length,
                    sampleData: allFolders.slice(0, 10)
                })
            } catch (err) {
                console.error('Failed to load folders:', err)
            }

            // Fetch settings
            try {
                const allSettings = await db.select().from(settings)
                tables.push({
                    tableName: 'settings',
                    rowCount: allSettings.length,
                    sampleData: allSettings.slice(0, 10)
                })
            } catch (err) {
                console.error('Failed to load settings:', err)
            }

            setDatabaseInfo(prev => prev ? {
                ...prev,
                tables
            } : null)
        } catch (err) {
            console.error('Failed to load database schema:', err)
            // If database isn't available, keep previous state
        } finally {
            setIsLoadingSchema(false)
        }
    }, [])

    // Refresh on mount and when opening
    useEffect(() => {
        if (isOpen && activeTab === 'storage') {
            refreshDatabaseInfo()
        }
    }, [isOpen, activeTab, refreshDatabaseInfo])

    // Track route changes for query log
    useEffect(() => {
        setQueryLog(prev => [
            ...prev.slice(-99), // Keep last 100 entries
            {
                type: 'route',
                storageKey: 'N/A',
                timestamp: new Date(),
                operation: `Route: ${location.pathname}${location.search || ''}`
            }
        ])
    }, [location.pathname, location.search])

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={cn(
                    'fixed bottom-4 right-4 z-50',
                    'w-12 h-12 rounded-full',
                    'bg-primary text-primary-foreground',
                    'flex items-center justify-center',
                    'shadow-lg hover:shadow-xl',
                    'transition-all duration-200',
                    'border-2 border-border'
                )}
                title="Open Dev Widget"
            >
                <Activity className="w-5 h-5" />
            </button>
        )
    }

    return (
        <div
            className={cn(
                'fixed bottom-4 right-4 z-50',
                'w-[600px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)]',
                'bg-background border-2 border-border rounded-lg shadow-2xl',
                'flex flex-col overflow-hidden',
                'backdrop-blur-sm'
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
                <h3 className="font-semibold text-sm">Dev Widget</h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            setIsOpen(false)
                            setActiveTab('route')
                        }}
                        className="p-1 hover:bg-muted rounded"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border bg-muted/20">
                <button
                    onClick={() => setActiveTab('route')}
                    className={cn(
                        'px-4 py-2 text-xs font-medium transition-colors',
                        activeTab === 'route'
                            ? 'bg-background border-b-2 border-primary text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <RouteIcon className="w-3 h-3 inline mr-1" />
                    Route
                </button>
                <button
                    onClick={() => {
                        setActiveTab('storage')
                        refreshDatabaseInfo()
                    }}
                    className={cn(
                        'px-4 py-2 text-xs font-medium transition-colors',
                        activeTab === 'storage'
                            ? 'bg-background border-b-2 border-primary text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <Database className="w-3 h-3 inline mr-1" />
                    Database
                </button>
                <button
                    onClick={() => setActiveTab('queries')}
                    className={cn(
                        'px-4 py-2 text-xs font-medium transition-colors',
                        activeTab === 'queries'
                            ? 'bg-background border-b-2 border-primary text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <Activity className="w-3 h-3 inline mr-1" />
                    Activity
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 text-xs">
                {activeTab === 'route' && (
                    <div className="space-y-3">
                        <div>
                            <div className="font-semibold mb-2">Current Route</div>
                            <div className="bg-muted p-2 rounded font-mono break-all">
                                {location.pathname}
                                {location.search && <span className="text-muted-foreground">{location.search}</span>}
                                {location.hash && <span className="text-muted-foreground">{location.hash}</span>}
                            </div>
                        </div>
                        <div>
                            <div className="font-semibold mb-2">Route State</div>
                            <pre className="bg-muted p-2 rounded overflow-x-auto text-[10px]">
                                {JSON.stringify(location.state || {}, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}

                {activeTab === 'storage' && (
                    <div className="space-y-4">
                        {/* Database Info */}
                        {databaseInfo && (
                            <div>
                                <div className="font-semibold mb-2">Database Status</div>
                                <div className="bg-muted p-3 rounded space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span>Dialect:</span>
                                        <span className="font-mono">{databaseInfo.dialect}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Connected:</span>
                                        <span className={cn(
                                            'font-mono',
                                            databaseInfo.connected ? 'text-green-500' : 'text-red-500'
                                        )}>
                                            {databaseInfo.connected ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={refreshDatabaseInfo}
                                        className="mt-2 px-2 py-1 bg-primary text-primary-foreground rounded text-xs hover:opacity-80"
                                    >
                                        Refresh
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Database Schema & Data */}
                        <div>
                            <div className="font-semibold mb-2 flex items-center justify-between">
                                <span>Schema & Data</span>
                                <button
                                    onClick={() => {
                                        loadDatabaseSchema()
                                        refreshDatabaseInfo()
                                    }}
                                    disabled={isLoadingSchema}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    {isLoadingSchema ? 'Loading...' : 'Reload'}
                                </button>
                            </div>
                            {databaseInfo?.tables && databaseInfo.tables.length > 0 ? (
                                <div className="space-y-3">
                                    {databaseInfo.tables.map((table) => (
                                        <div key={table.tableName} className="bg-muted p-3 rounded">
                                            <div className="font-mono font-semibold mb-2 text-xs">
                                                {table.tableName} ({table.rowCount} rows)
                                            </div>
                                            {table.sampleData && table.sampleData.length > 0 && (
                                                <div className="max-h-40 overflow-y-auto">
                                                    <pre className="text-[10px] bg-background p-2 rounded overflow-x-auto">
                                                        {JSON.stringify(table.sampleData.slice(0, 10), null, 2)}
                                                        {table.rowCount > 10 && `\n... and ${table.rowCount - 10} more rows`}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-muted p-4 rounded text-center text-muted-foreground text-xs">
                                    Database schema will appear here when Drizzle client is configured
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'queries' && (
                    <div className="space-y-2">
                        <div className="font-semibold mb-2">Recent Activity</div>
                        <div className="space-y-1 max-h-96 overflow-y-auto">
                            {queryLog.length === 0 ? (
                                <div className="text-muted-foreground text-center py-4">
                                    No activity logged yet
                                </div>
                            ) : (
                                queryLog.slice().reverse().map((log, index) => (
                                    <div
                                        key={index}
                                        className={cn(
                                            "bg-muted p-2 rounded text-[10px] font-mono",
                                            log.error && "border-l-2 border-destructive"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-muted-foreground">
                                                {log.timestamp.toLocaleTimeString()}
                                            </span>
                                            <span className={cn(
                                                "px-1 rounded text-[9px]",
                                                log.type === 'mutation' && "bg-orange-500/20",
                                                log.type === 'query' && "bg-blue-500/20",
                                                log.type === 'route' && "bg-green-500/20"
                                            )}>
                                                {log.type}
                                            </span>
                                        </div>
                                        <div className="break-all">{log.operation}</div>
                                        {log.error && (
                                            <div className="mt-1 text-red-500 text-[9px]">
                                                Error: {log.error}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

