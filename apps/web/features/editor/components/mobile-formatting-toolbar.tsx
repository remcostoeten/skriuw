'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
    Bold,
    Italic,
    Code,
    Link2,
    Heading1,
    Heading2,
    List,
    ListOrdered,
    CheckSquare,
    Quote,
    Minus,
    MoreHorizontal,
    ChevronLeft,
    Image,
    Table,
    type LucideIcon,
} from 'lucide-react'
import { cn, haptic } from '@skriuw/shared'
import { useMediaQuery, MOBILE_BREAKPOINT } from '@skriuw/shared/client'

type ToolbarAction = {
    id: string
    icon: LucideIcon
    label: string
    shortcut?: string
    action: () => void
}

type MobileFormattingToolbarProps = {
    editor: any // BlockNoteEditor
    className?: string
}

const PRIMARY_ACTIONS: Omit<ToolbarAction, 'action'>[] = [
    { id: 'bold', icon: Bold, label: 'Bold', shortcut: 'B' },
    { id: 'italic', icon: Italic, label: 'Italic', shortcut: 'I' },
    { id: 'link', icon: Link2, label: 'Link', shortcut: '[[' },
    { id: 'heading1', icon: Heading1, label: 'Heading 1', shortcut: '#' },
    { id: 'heading2', icon: Heading2, label: 'Heading 2', shortcut: '##' },
    { id: 'task', icon: CheckSquare, label: 'Task', shortcut: '[]' },
    { id: 'code', icon: Code, label: 'Code', shortcut: '`' },
]

const SECONDARY_ACTIONS: Omit<ToolbarAction, 'action'>[] = [
    { id: 'bulletList', icon: List, label: 'Bullet List', shortcut: '-' },
    { id: 'numberedList', icon: ListOrdered, label: 'Numbered List', shortcut: '1.' },
    { id: 'quote', icon: Quote, label: 'Quote', shortcut: '>' },
    { id: 'divider', icon: Minus, label: 'Divider', shortcut: '---' },
    { id: 'image', icon: Image, label: 'Image' },
    { id: 'table', icon: Table, label: 'Table' },
]

export function MobileFormattingToolbar({ editor, className }: MobileFormattingToolbarProps) {
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
    const [showSecondary, setShowSecondary] = useState(false)
    const [isVisible, setIsVisible] = useState(true)
    const toolbarRef = useRef<HTMLDivElement>(null)
    const lastScrollY = useRef(0)

    // Hide toolbar when scrolling down, show when scrolling up
    useEffect(() => {
        if (!isMobile) return

        const handleScroll = () => {
            const currentScrollY = window.scrollY
            const isScrollingDown = currentScrollY > lastScrollY.current && currentScrollY > 100

            setIsVisible(!isScrollingDown)
            lastScrollY.current = currentScrollY
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [isMobile])

    const executeAction = useCallback((actionId: string) => {
        if (!editor) return

        haptic.light()

        switch (actionId) {
            case 'bold':
                editor.toggleStyles({ bold: true })
                break
            case 'italic':
                editor.toggleStyles({ italic: true })
                break
            case 'code':
                editor.toggleStyles({ code: true })
                break
            case 'link':
                // Insert [[ to trigger the mention menu
                editor.insertInlineContent('[[')
                break
            case 'heading1':
                editor.updateBlock(editor.getTextCursorPosition().block, {
                    type: 'heading',
                    props: { level: 1 },
                })
                break
            case 'heading2':
                editor.updateBlock(editor.getTextCursorPosition().block, {
                    type: 'heading',
                    props: { level: 2 },
                })
                break
            case 'task':
                editor.updateBlock(editor.getTextCursorPosition().block, {
                    type: 'checkListItem',
                    props: { checked: false },
                })
                break
            case 'bulletList':
                editor.updateBlock(editor.getTextCursorPosition().block, {
                    type: 'bulletListItem',
                })
                break
            case 'numberedList':
                editor.updateBlock(editor.getTextCursorPosition().block, {
                    type: 'numberedListItem',
                })
                break
            case 'quote':
                editor.updateBlock(editor.getTextCursorPosition().block, {
                    type: 'blockquote',
                })
                break
            case 'divider':
                editor.insertBlocks(
                    [{ type: 'horizontalRule' }],
                    editor.getTextCursorPosition().block,
                    'after'
                )
                break
            case 'image':
                // Open image insertion UI
                editor.openSelectionMenu('/')
                break
            case 'table':
                editor.insertBlocks(
                    [{ type: 'table', content: { type: 'tableContent', rows: 2, columns: 3 } }],
                    editor.getTextCursorPosition().block,
                    'after'
                )
                break
            default:
                console.log('Unknown action:', actionId)
        }
    }, [editor])

    const toggleSecondary = useCallback(() => {
        haptic.light()
        setShowSecondary(prev => !prev)
    }, [])

    // Don't render on desktop
    if (!isMobile) return null

    const currentActions = showSecondary ? SECONDARY_ACTIONS : PRIMARY_ACTIONS

    return (
        <div
            ref={toolbarRef}
            className={cn(
                'fixed left-0 right-0 z-[65]',
                // Position above the bottom nav (56px) with safe area
                'bottom-[calc(56px+env(safe-area-inset-bottom,0px))]',
                // Styling
                'bg-[#0f0f0f]/95 backdrop-blur-xl',
                'border-t border-white/[0.08]',
                // Animation
                'transition-transform duration-200 ease-out',
                isVisible ? 'translate-y-0' : 'translate-y-full',
                className
            )}
            role="toolbar"
            aria-label="Text formatting"
        >
            <div className="flex items-center h-11 px-2 gap-0.5 overflow-x-auto scrollbar-hide">
                {/* Back button when showing secondary */}
                {showSecondary && (
                    <button
                        type="button"
                        onClick={toggleSecondary}
                        className={cn(
                            'flex items-center justify-center',
                            'w-10 h-9 rounded-lg',
                            'text-white/60 hover:text-white hover:bg-white/10',
                            'transition-colors duration-150',
                            'touch-manipulation'
                        )}
                        aria-label="Back to primary actions"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                )}

                {/* Action buttons */}
                {currentActions.map((action) => (
                    <button
                        key={action.id}
                        type="button"
                        onClick={() => executeAction(action.id)}
                        className={cn(
                            'flex flex-col items-center justify-center',
                            'min-w-[44px] h-9 px-2 rounded-lg', // 44px min for touch targets
                            'text-white/70 hover:text-white hover:bg-white/10',
                            'active:scale-95 active:bg-white/15',
                            'transition-all duration-150',
                            'touch-manipulation select-none'
                        )}
                        title={action.label}
                        aria-label={action.label}
                    >
                        <action.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        {action.shortcut && (
                            <span className="text-[9px] text-white/40 mt-0.5 font-mono">
                                {action.shortcut}
                            </span>
                        )}
                    </button>
                ))}

                {/* More actions button (only on primary) */}
                {!showSecondary && (
                    <button
                        type="button"
                        onClick={toggleSecondary}
                        className={cn(
                            'flex items-center justify-center ml-auto',
                            'min-w-[44px] h-9 px-3 rounded-lg',
                            'text-white/60 hover:text-white hover:bg-white/10',
                            'transition-colors duration-150',
                            'touch-manipulation'
                        )}
                        aria-label="More formatting options"
                    >
                        <MoreHorizontal className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
    )
}
