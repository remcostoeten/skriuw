'use client'

import { createRoot } from 'react-dom/client'

type NotificationOptions = {
    id?: string
    message: string
    duration: number
    revertText?: string
    onRevert?: () => void
}

let container: HTMLDivElement | null = null
let root: ReturnType<typeof createRoot> | null = null

function getContainer() {
    if (!container) {
        container = document.createElement('div')
        container.id = 'notification-container'
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
        `
        document.body.appendChild(container)
        root = createRoot(container)
    }
    return { container, root: root! }
}

let notifications: NotificationOptions[] = []
let updateTimeout: ReturnType<typeof setTimeout> | null = null

function renderNotifications() {
    const { root } = getContainer()

    const elements = notifications.map((n) => (
        <div
            key={n.id}
            style={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                padding: '12px 16px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                pointerEvents: 'auto',
                color: 'hsl(var(--foreground))',
                fontSize: '14px',
                animation: 'slideIn 0.2s ease-out',
            }}
        >
            <span>{n.message}</span>
            {n.revertText && (
                <button
                    onClick={() => {
                        n.onRevert?.()
                        removeNotification(n.id!)
                    }}
                    style={{
                        background: 'transparent',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        color: 'hsl(var(--foreground))',
                        fontSize: '12px',
                    }}
                >
                    {n.revertText}
                </button>
            )}
        </div>
    ))

    root.render(
        <>
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
            {elements}
        </>
    )
}

function removeNotification(id: string) {
    notifications = notifications.filter(n => n.id !== id)
    renderNotifications()
}

function removeNotificationByIndex(index: number) {
    notifications = notifications.filter((_, i) => i !== index)
    renderNotifications()
}

function generateId(): string {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function showNotification(options: NotificationOptions) {
    const notificationWithId = {
        ...options,
        id: options.id || generateId()
    }
    
    notifications.push(notificationWithId)
    renderNotifications()

    setTimeout(() => {
        const idx = notifications.findIndex(n => n.id === notificationWithId.id)
        if (idx > -1) {
            removeNotification(notificationWithId.id!)
        }
    }, options.duration)
}

class NotificationBuilder {
    private options: NotificationOptions

    constructor(message: string) {
        this.options = {
            message,
            duration: 3000,
        }
        // Auto-show after microtask to allow chaining
        queueMicrotask(() => {
            showNotification(this.options)
        })
    }

    allowRevert(text: string, onRevert?: () => void) {
        this.options.revertText = text
        this.options.onRevert = onRevert
        return this
    }

    duration(ms: number) {
        this.options.duration = ms
        return this
    }
}

export function notify(message: string) {
    return new NotificationBuilder(message)
}
