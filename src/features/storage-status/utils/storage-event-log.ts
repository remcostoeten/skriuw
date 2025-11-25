import { AdapterStorageEvent } from '@/api/storage/generic-types'

export type StorageEventType =
    | AdapterStorageEvent['type']
    | 'changed'
    | 'route'
    | 'route-error'

export type StorageEventSource = 'adapter' | 'raw' | 'manual' | 'router'

export interface StorageEventLogEntry {
    id: string
    timestamp: number
    storageKey: string
    eventType: StorageEventType
    entityId?: string
    source: StorageEventSource
    description?: string
}

export type StorageEventLogPayload = Omit<StorageEventLogEntry, 'id' | 'timestamp'> & {
    timestamp?: number
}

const EVENT_LOG_STORAGE_KEY = 'storageStatus.eventLog'
const EVENT_LOG_LIMIT = 1000
const EVENT_LOG_CHANNEL = 'storageStatus:eventLogUpdated'

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function persistEventLog(entries: StorageEventLogEntry[]) {
    if (!isBrowser()) return
    try {
        localStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(entries.slice(0, EVENT_LOG_LIMIT)))
        const event = new CustomEvent<StorageEventLogEntry[]>(EVENT_LOG_CHANNEL, {
            detail: entries
        })
        window.dispatchEvent(event)
    } catch (error) {
        console.warn('Failed to persist storage event log', error)
    }
}

export function readStorageEventLog(): StorageEventLogEntry[] {
    if (!isBrowser()) return []
    try {
        const raw = localStorage.getItem(EVENT_LOG_STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter((entry): entry is StorageEventLogEntry => {
                return (
                    entry &&
                    typeof entry.storageKey === 'string' &&
                    typeof entry.timestamp === 'number' &&
                    typeof entry.eventType === 'string'
                )
            })
            .slice(0, EVENT_LOG_LIMIT)
    } catch (error) {
        console.warn('Failed to read storage event log', error)
        return []
    }
}

export function subscribeToStorageEventLogUpdates(
    callback: (entries: StorageEventLogEntry[]) => void
): () => void {
    if (!isBrowser()) {
        return () => {}
    }

    const handler = (event: Event) => {
        const customEvent = event as CustomEvent<StorageEventLogEntry[]>
        callback(customEvent.detail ?? readStorageEventLog())
    }

    window.addEventListener(EVENT_LOG_CHANNEL, handler as EventListener)
    return () => {
        window.removeEventListener(EVENT_LOG_CHANNEL, handler as EventListener)
    }
}

export function logStorageEvent(payload: StorageEventLogPayload) {
    const timestamp = payload.timestamp ?? Date.now()
    const entry: StorageEventLogEntry = {
        ...payload,
        timestamp,
        id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`
    }

    const current = readStorageEventLog()
    const next = [entry, ...current].slice(0, EVENT_LOG_LIMIT)
    persistEventLog(next)
}

export function clearStorageEventLog() {
    persistEventLog([])
}
