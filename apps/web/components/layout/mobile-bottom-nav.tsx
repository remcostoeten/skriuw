'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus, FolderOpen, Trash2, Archive, Settings, FileText } from 'lucide-react'
import { cn } from '@skriuw/shared'
import { useUIStore } from '../../stores/ui-store'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { notify } from '@/lib/notify'
import { haptic } from '@skriuw/shared'

type MobileBottomNavProps = {
    onSettingsClick?: () => void
}

export function MobileBottomNav({ onSettingsClick }: MobileBottomNavProps) {
    const router = useRouter()
    const pathname = usePathname()
    const { toggleMobileSidebar, setSettingsOpen, isMobileSidebarOpen } = useUIStore()
    const { items, createNote } = useNotesContext()
    const { getNoteUrl } = useNoteSlug(items)
    const [isCreating, setIsCreating] = useState(false)

    const isOnNotes = pathname === '/' || pathname.startsWith('/note/')
    const isOnArchive = pathname === '/archive'
    const isOnTrash = pathname === '/trash'

    async function handleCreateNote() {
        if (isCreating) return

        setIsCreating(true)
        try {
            const newNote = await createNote('Untitled')
            if (newNote) {
                const url = getNoteUrl(newNote.id)
                haptic.success()
                notify('Note created successfully').duration(2000)
                router.push(`${url}?focus=true`)
            } else {
                notify('Failed to create note').duration(3000)
            }
        } catch (error) {
            console.error('Failed to create note:', error)
            notify(`Failed to create note: ${error instanceof Error ? error.message : 'Unknown error'}`).duration(3000)
        } finally {
            setIsCreating(false)
        }
    }

    function handleSettingsClick() {
        if (onSettingsClick) {
            onSettingsClick()
        } else {
            setSettingsOpen(true)
        }
    }

    const navItems = [
        {
            icon: FileText,
            label: 'Notes',
            active: isOnNotes,
            onClick: () => {
                haptic.light()
                router.push('/')
            },
        },
        {
            icon: FolderOpen,
            label: 'Files',
            active: isMobileSidebarOpen,
            onClick: () => {
                haptic.light()
                toggleMobileSidebar()
            },
        },
        {
            icon: Plus,
            label: isCreating ? 'Creating...' : 'New',
            active: false,
            onClick: () => {
                haptic.medium()
                handleCreateNote()
            },
            primary: true,
            disabled: isCreating,
        },
        {
            icon: Archive,
            label: 'Archive',
            active: isOnArchive,
            onClick: () => {
                haptic.light()
                router.push('/archive')
            },
        },
        {
            icon: Trash2,
            label: 'Trash',
            active: isOnTrash,
            onClick: () => {
                haptic.light()
                router.push('/trash')
            },
        },
    ]

    return (
        <nav
            className={cn(
                // Positioning & sizing
                'fixed bottom-0 left-0 right-0 z-[70]',
                'h-16 pb-[env(safe-area-inset-bottom)]',
                // Glassmorphism effect
                'bg-background/80 backdrop-blur-xl',
                'border-t border-border/50',
                // Shadow for depth
                'shadow-[0_-4px_20px_rgba(0,0,0,0.1)]',
                // Only show on mobile
                'lg:hidden'
            )}
        >
            <div className="flex items-center justify-around h-full px-2 max-w-md mx-auto">
                {navItems.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        disabled={item.disabled}
                        className={cn(
                            // Base styles
                            'flex flex-col items-center justify-center',
                            'transition-all duration-200 ease-out',
                            'rounded-xl px-3 py-1.5',
                            'touch-manipulation',
                            // Disabled state styling
                            item.disabled && [
                                'opacity-50 cursor-not-allowed',
                                'scale-100 hover:scale-100 active:scale-100'
                            ],
                            // Primary action (Create Note) styling
                            item.primary && !item.disabled && [
                                'bg-gradient-to-br from-brand-500 to-brand-600',
                                'text-white shadow-lg shadow-brand-500/30',
                                'scale-100 hover:scale-105 active:scale-95',
                                '-mt-4 px-4 py-2.5 rounded-2xl',
                            ],
                            // Regular item styling
                            !item.primary && !item.disabled && [
                                'text-muted-foreground',
                                'hover:text-foreground hover:bg-muted/50',
                                'active:scale-95',
                            ],
                            // Active state for non-primary items
                            !item.primary && !item.disabled && item.active && [
                                'text-brand-500',
                                'bg-brand-500/10',
                            ]
                        )}
                    >
                        <item.icon
                            className={cn(
                                'transition-transform duration-200',
                                item.primary ? 'w-6 h-6' : 'w-5 h-5',
                                item.active && !item.primary && !item.disabled && 'scale-110'
                            )}
                        />
                        <span
                            className={cn(
                                'text-[10px] font-medium mt-0.5',
                                item.primary && 'text-xs'
                            )}
                        >
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
        </nav>
    )
}
