import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import {
    type ReactNode,
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type TouchEvent as ReactTouchEvent,
    type CSSProperties
} from 'react'

import { createFocusTrap } from '../utilities/focus-trap'
import { Portal } from '../utilities/portal'
import { useMediaQuery, MOBILE_BREAKPOINT } from '../utilities/use-media-query'

type DialogContextValue = {
    open: boolean
    onOpenChange: (open: boolean) => void
    isMobile: boolean
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined)

function useDialogContext(): DialogContextValue {
    const context = useContext(DialogContext)
    if (!context) {
        throw new Error(
            'Dialog components must be used within a Dialog provider'
        )
    }
    return context
}

type DialogProps = {
    children: ReactNode
    open: boolean
    onOpenChange: (open: boolean) => void
    mobileBreakpoint?: string
    closeOnEscape?: boolean
    closeOnOutsideClick?: boolean
}

export function Dialog({
    children,
    open,
    onOpenChange,
    mobileBreakpoint = MOBILE_BREAKPOINT,
    closeOnEscape = true,
    closeOnOutsideClick = true
}: DialogProps) {
    const isMobile = useMediaQuery(mobileBreakpoint)

    useEffect(() => {
        if (!open) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && closeOnEscape) {
                onOpenChange(false)
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [open, closeOnEscape, onOpenChange])

    useEffect(() => {
        if (!open) return
        const originalStyle = window.getComputedStyle(document.body).overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalStyle
        }
    }, [open])

    return (
        <DialogContext.Provider value={{ open, onOpenChange, isMobile }}>
            <DialogOverlay closeOnOutsideClick={closeOnOutsideClick} />
            {children}
        </DialogContext.Provider>
    )
}

type DialogOverlayProps = {
    closeOnOutsideClick?: boolean
}

function DialogOverlay({ closeOnOutsideClick = true }: DialogOverlayProps) {
    const { open, onOpenChange } = useDialogContext()

    if (!open) return null

    const handleClick = () => {
        if (closeOnOutsideClick) {
            onOpenChange(false)
        }
    }

    return (
        <AnimatePresence>
            {open && (
                <Portal>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                            duration: 0.3,
                            ease: [0.25, 0.46, 0.45, 0.94]
                        }}
                        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-md"
                        onClick={handleClick}
                        aria-hidden="true"
                    />
                </Portal>
            )}
        </AnimatePresence>
    )
}

type DialogContentProps = {
    children: ReactNode
    className?: string
    enableDragToClose?: boolean
    dragThreshold?: number
}

export function DialogContent({
    children,
    className = '',
    enableDragToClose = true,
    dragThreshold = 100
}: DialogContentProps) {
    const { open, onOpenChange, isMobile } = useDialogContext()
    const contentRef = useRef<HTMLDivElement>(null)
    const [dragOffset, setDragOffset] = useState(0)
    const startYRef = useRef(0)
    const isDraggingRef = useRef(false)

    useEffect(() => {
        if (!open || !contentRef.current) return

        const trap = createFocusTrap(contentRef.current)
        trap.activate()
        return () => trap.deactivate()
    }, [open])

    const handleDragStart = (event: ReactTouchEvent | ReactMouseEvent) => {
        if (!isMobile || !enableDragToClose) return

        const clientY =
            'touches' in event ? event.touches[0].clientY : event.clientY
        startYRef.current = clientY
        isDraggingRef.current = true
    }

    const handleDragMove = (event: ReactTouchEvent | ReactMouseEvent) => {
        if (!isDraggingRef.current || startYRef.current === 0) return

        const clientY =
            'touches' in event ? event.touches[0].clientY : event.clientY
        const diff = clientY - startYRef.current

        if (diff > 0) {
            setDragOffset(diff)
        }
    }

    const handleDragEnd = () => {
        if (!isDraggingRef.current) return

        if (dragOffset > dragThreshold) {
            onOpenChange(false)
        }

        setDragOffset(0)
        startYRef.current = 0
        isDraggingRef.current = false
    }

    const handleContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        event.stopPropagation()
    }

    if (!open) return null

    if (isMobile) {
        return (
            <Portal>
                <div
                    className="fixed inset-0 z-[9999] flex flex-col pointer-events-none"
                    style={{ top: `${dragOffset}px` }}
                >
                    <div className="flex-1 pointer-events-auto" />

                    <div
                        ref={contentRef}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        className={`bg-popover text-popover-foreground border-t border-border rounded-t-2xl shadow-2xl flex flex-col pointer-events-auto max-h-[95vh] transition-transform ${className}`}
                        style={{
                            height: '65vh',
                            transform: `translateY(${dragOffset}px)`,
                            touchAction: 'none'
                        }}
                        onClick={handleContentClick}
                        onTouchStart={handleDragStart}
                        onTouchMove={handleDragMove}
                        onTouchEnd={handleDragEnd}
                        onMouseDown={handleDragStart}
                        onMouseMove={handleDragMove}
                        onMouseUp={handleDragEnd}
                        onMouseLeave={handleDragEnd}
                    >
                        {enableDragToClose && (
                            <div className="flex items-center justify-center pt-2 pb-2">
                                <div className="h-1 w-12 bg-border rounded-full" />
                            </div>
                        )}
                        {children}
                    </div>
                </div>
            </Portal>
        )
    }

    return (
        <AnimatePresence>
            {open && (
                <Portal>
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                        <motion.div
                            ref={contentRef}
                            role="dialog"
                            aria-modal="true"
                            tabIndex={-1}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{
                                duration: 0.2,
                                ease: [0.4, 0, 0.2, 1]
                            }}
                            className={`w-[90%] h-[90%] top-[5%] right-[5%] bottom-[5%] left-[5%] fixed bg-popover text-popover-foreground rounded-lg shadow-lg p-6 gap-4 flex flex-col overflow-hidden ${className}`}
                            onClick={handleContentClick}
                        >
                            {children}
                        </motion.div>
                    </div>
                </Portal>
            )}
        </AnimatePresence>
    )
}

type DialogHeaderProps = {
    children: ReactNode
    className?: string
}

export function DialogHeader({ children, className = '' }: DialogHeaderProps) {
    return (
        <div className={`flex flex-col gap-1.5 pb-4 ${className}`}>
            {children}
        </div>
    )
}

type DialogTitleProps = {
    children: ReactNode
    className?: string
}

export function DialogTitle({ children, className = '' }: DialogTitleProps) {
    return (
        <h2 className={`text-lg font-semibold text-foreground ${className}`}>
            {children}
        </h2>
    )
}

type DialogCloseProps = {
    className?: string
    'aria-label'?: string
}

export function DialogClose({
    className = '',
    'aria-label': ariaLabel = 'Close dialog'
}: DialogCloseProps) {
    const { onOpenChange } = useDialogContext()

    return (
        <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={ariaLabel}
            className={`absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
        >
            <X className="h-4 w-4 text-muted-foreground" />
        </button>
    )
}

type DialogFooterProps = {
    children: ReactNode
    className?: string
}

export function DialogFooter({ children, className = '' }: DialogFooterProps) {
    return (
        <div
            className={`flex items-center justify-end gap-2 pt-4 border-t border-border ${className}`}
        >
            {children}
        </div>
    )
}

type DialogAsideProps = {
    children: ReactNode
    className?: string
}

export function DialogAside({ children, className }: DialogAsideProps) {
    return (
        <aside
            className={
                className ||
                'flex flex-col items-start gap-4 h-full justify-start min-w-[160px] text-foreground'
            }
        >
            {children}
        </aside>
    )
}

type DialogSectionProps = {
    label?: string
    children: ReactNode
    className?: string
    labelClassName?: string
}

export function DialogSection({
    label,
    children,
    className,
    labelClassName
}: DialogSectionProps) {
    return (
        <div className={className || 'flex flex-col items-start gap-2 w-full'}>
            {label && (
                <label
                    className={
                        labelClassName ||
                        'font-medium text-muted-foreground text-xs pl-2'
                    }
                >
                    {label}
                </label>
            )}
            {children}
        </div>
    )
}

type DialogSeparatorProps = {
    className?: string
}

export function DialogSeparator({ className }: DialogSeparatorProps) {
    return (
        <div
            role="none"
            aria-hidden="true"
            className={className || 'shrink-0 bg-border h-px w-full'}
        />
    )
}

type DialogContentAreaProps = {
    children: ReactNode
    className?: string
}

export function DialogContentArea({
    children,
    className
}: DialogContentAreaProps) {
    return (
        <div
            className={
                className ||
                'flex flex-col items-start justify-start gap-2 h-full flex-1 text-foreground overflow-y-auto'
            }
        >
            {children}
        </div>
    )
}

type NavItem = {
    id: string
    label: string
    icon: ReactNode
    active?: boolean
    onClick: () => void
}

type DialogNavGroupProps = {
    label?: string
    items: Array<NavItem>
    className?: string
}

export function DialogNavGroup({
    label,
    items,
    className
}: DialogNavGroupProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
    const [indicatorStyle, setIndicatorStyle] = useState<CSSProperties>({})

    const activeIndex = items.findIndex((item) => item.active)
    const currentIndex = hoveredIndex !== null ? hoveredIndex : activeIndex

    useEffect(() => {
        if (currentIndex === -1 || !containerRef.current) return

        const item = itemRefs.current[currentIndex]
        if (!item) return

        const containerRect = containerRef.current.getBoundingClientRect()
        const itemRect = item.getBoundingClientRect()
        const top = itemRect.top - containerRect.top
        const height = itemRect.height

        setIndicatorStyle({
            top: `${top}px`,
            height: `${height}px`
        })
    }, [currentIndex, items])

    return (
        <div
            ref={containerRef}
            className={className || 'relative flex flex-col gap-1 w-full'}
        >
            {label && (
                <span className="text-xs font-medium text-muted-foreground/50 px-2 py-1">
                    {label}
                </span>
            )}
            {/* Sliding indicator */}
            {activeIndex !== -1 && (
                <div
                    className="absolute left-0 right-0 bg-accent rounded-md transition-all duration-300 ease-out pointer-events-none"
                    style={indicatorStyle}
                />
            )}
            {items.map((item, index) => (
                <button
                    key={item.id}
                    ref={(el) => {
                        itemRefs.current[index] = el
                    }}
                    onClick={item.onClick}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className={`relative z-10 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 w-full ${
                        item.active
                            ? 'text-accent-foreground bg-accent'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
                    }`}
                >
                    {item.icon}
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    )
}
