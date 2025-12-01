/**
 * Simple dev event tracker for debugging queries and mutations
 * Only active in development mode
 */

type DevEvent = {
    type: 'query' | 'mutation'
    operation: 'create' | 'read' | 'update' | 'delete'
    storageKey: string
    timestamp: Date
    data?: unknown
    error?: string
}

type DevEventListener = (event: DevEvent) => void

class DevEventTracker {
    private listeners: Set<DevEventListener> = new Set()
    private events: DevEvent[] = []
    private maxEvents = 100

    subscribe(listener: DevEventListener): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    log(event: Omit<DevEvent, 'timestamp'>): void {
        if (!import.meta.env.DEV) return

        const fullEvent: DevEvent = {
            ...event,
            timestamp: new Date()
        }

        this.events.push(fullEvent)
        if (this.events.length > this.maxEvents) {
            this.events.shift()
        }

        this.listeners.forEach(listener => {
            try {
                listener(fullEvent)
            } catch (error) {
                console.error('Dev event listener error:', error)
            }
        })
    }

    getEvents(): DevEvent[] {
        return [...this.events]
    }

    clear(): void {
        this.events = []
    }
}

export const devEventTracker = new DevEventTracker()

