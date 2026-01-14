'use client'

import { createRoot } from 'react-dom/client'
import { cn } from '@skriuw/shared'

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
        document.body.appendChild(container)
        root = createRoot(container)
    }
    return { container, root: root! }
}

let notifications: NotificationOptions[] = []

function renderNotifications() {
    const { root, container } = getContainer()

    const isMobile = window.innerWidth < 1024

    container.style.cssText = `
        position: fixed;
        ${isMobile ? `
            bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 12px);
            left: 12px;
            right: 12px;
        ` : `
            bottom: 20px;
            right: 20px;
        `}
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
    `

    const elements = notifications.map((n) => (
        <div
            key={n.id}
            className={cn(
                "pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200",
                "flex items-center gap-3",
                "bg-[#1a1a1a] border border-white/[0.08]",
                "p-3 rounded-xl",
                "shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
                "text-[13px] text-white"
            )}
        >
            <span className="flex-1">{n.message}</span>
            {n.revertText && (
                <button
                    onClick={() => {
                        n.onRevert?.()
                        removeNotification(n.id!)
                    }}
                    className={cn(
                        "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium",
                        "bg-white/10 hover:bg-white/20",
                        "text-white/80 hover:text-white",
                        "transition-colors duration-150"
                    )}
                >
                    {n.revertText}
                </button>
            )}
        </div>
    ))

    root.render(<>{elements}</>)
}

function removeNotification(id: string) {
    notifications = notifications.filter(n => n.id !== id)
    renderNotifications()
}

function generateId(): string {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

import { haptic } from '@skriuw/shared'

function showNotification(options: NotificationOptions) {
    haptic.success()
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
