'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus, FolderOpen, Trash2, Archive, FileText, Sparkles } from 'lucide-react'
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
            label: isCreating ? '...' : 'New',
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
                'fixed bottom-0 left-0 right-0 z-[70]',
                'pb-[env(safe-area-inset-bottom)]',
                'bg-[#0a0a0a]/95 backdrop-blur-2xl',
                'border-t border-white/[0.06]',
                'lg:hidden'
            )}
        >
            <div className="flex items-stretch justify-around h-[56px] px-1 max-w-lg mx-auto">
                {navItems.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        disabled={item.disabled}
                        className={cn(
                            'relative flex flex-col items-center justify-center flex-1 gap-0.5',
                            'transition-all duration-150 ease-out',
                            'touch-manipulation select-none',
                            item.disabled && 'opacity-40 pointer-events-none',
                            item.primary && [
                                'mx-1',
                            ],
                            !item.primary && !item.disabled && [
                                'text-white/40',
                                'active:scale-95 active:opacity-70',
                            ],
                            !item.primary && !item.disabled && item.active && [
                                'text-white',
                            ]
                        )}
                    >
                        {item.primary ? (
                            <div className={cn(
                                'relative flex items-center justify-center',
                                'w-12 h-12 -mt-4 rounded-2xl',
                                'bg-gradient-to-b from-emerald-500 to-emerald-600',
                                'shadow-[0_4px_20px_rgba(16,185,129,0.4)]',
                                'transition-transform duration-150',
                                'active:scale-90',
                                item.disabled && 'from-gray-500 to-gray-600 shadow-none'
                            )}>
                                <item.icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/10 to-white/10" />
                            </div>
                        ) : (
                            <>
                                <div className={cn(
                                    'relative flex items-center justify-center w-7 h-7 rounded-lg',
                                    'transition-colors duration-150',
                                    item.active && 'bg-white/10'
                                )}>
                                    <item.icon
                                        className={cn(
                                            'w-[22px] h-[22px] transition-all duration-150',
                                            item.active && 'scale-105'
                                        )}
                                        strokeWidth={item.active ? 2.25 : 1.75}
                                    />
                                </div>
                                <span className={cn(
                                    'text-[10px] font-medium tracking-tight',
                                    'transition-colors duration-150'
                                )}>
                                    {item.label}
                                </span>
                            </>
                        )}
                    </button>
                ))}
            </div>
        </nav>
    )
}
