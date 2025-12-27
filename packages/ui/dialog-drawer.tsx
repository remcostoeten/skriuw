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
	type CSSProperties,
	forwardRef,
	useImperativeHandle,
	type HTMLAttributes
} from 'react'

import {
	createFocusTrap,
	Portal,
	useMediaQuery,
	MOBILE_BREAKPOINT
} from '@skriuw/shared/client'

type DialogContextValue = {
	open: boolean
	onOpenChange: (open: boolean) => void
	isMobile: boolean
	fullscreen: boolean
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined)

// Centralized z-index tiersdd for app overlays
const Z_INDEX = {
	overlay: 10,
	dialog: 20,
} as const

function useDialogContext(): DialogContextValue {
	const context = useContext(DialogContext)
	if (!context) {
		throw new Error(
			'Dialog components must be used within a Dialog provider'
		)
	}
	return context
}

type props = {
	children: ReactNode
	open: boolean
	onOpenChange: (open: boolean) => void
	mobileBreakpoint?: string
	closeOnEscape?: boolean
	closeOnOutsideClick?: boolean
	fullscreen?: boolean
}

export function DrawerDialog({
	children,
	open,
	onOpenChange,
	mobileBreakpoint = '(max-width: 767px)',
	closeOnEscape = true,
	closeOnOutsideClick = true,
	fullscreen = false
}: props) {
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

	// Apply inert to main content when dialog is open
	useEffect(() => {
		const mainContent = document.getElementById('main-content')
		if (mainContent) {
			if (open) {
				mainContent.setAttribute('inert', '')
			} else {
				mainContent.removeAttribute('inert')
			}
		}
		return () => {
			mainContent?.removeAttribute('inert')
		}
	}, [open])

	return (
		<DialogContext.Provider
			value={{ open, onOpenChange, isMobile, fullscreen }}
		>
			<DrawerDialogOverlay closeOnOutsideClick={closeOnOutsideClick} />
			{children}
		</DialogContext.Provider>
	)
}

type DrawerDialogOverlayProps = {
	closeOnOutsideClick?: boolean
}

function DrawerDialogOverlay({
	closeOnOutsideClick = true
}: DrawerDialogOverlayProps) {
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
				<Portal container={typeof window !== 'undefined' ? document.body : undefined}>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{
							duration: 0.3,
							ease: [0.25, 0.46, 0.45, 0.94]
						}}
						className="fixed inset-0 bg-black/70 backdrop-blur-sm"
						style={{ zIndex: Z_INDEX.overlay }}
						onClick={handleClick}
						aria-hidden="true"
					/>
				</Portal>
			)}
		</AnimatePresence>
	)
}

// Props that conflict between HTMLAttributes and Framer Motion's motion.div
type MotionConflictingProps =
	| 'onAnimationStart'
	| 'onDragStart'
	| 'onDragEnd'
	| 'onDrag'
	| 'transition'

export interface DrawerContentProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode
	className?: string
	enableDragToClose?: boolean
	dragThreshold?: number
}

// Filter out props that conflict with Framer Motion
function filterMotionProps(
	props: Omit<DrawerContentProps, 'children' | 'className' | 'enableDragToClose' | 'dragThreshold'>
): Omit<typeof props, MotionConflictingProps> {
	const {
		onAnimationStart,
		onDragStart,
		onDragEnd,
		onDrag,
		transition,
		...safeProps
	} = props as any
	return safeProps
}

export const DrawerContent = forwardRef<HTMLDivElement, DrawerContentProps>(
	(
		{
			children,
			className = '',
			enableDragToClose = true,
			dragThreshold = 100,
			...props
		},
		ref
	) => {
		const { open, onOpenChange, isMobile, fullscreen } = useDialogContext()
		const contentRef = useRef<HTMLDivElement>(null)
		const [dragOffset, setDragOffset] = useState(0)
		const startYRef = useRef(0)
		const isDraggingRef = useRef(false)

		useImperativeHandle(ref, () => contentRef.current!)

		useEffect(() => {
			if (!open || !contentRef.current) return

			const trap = createFocusTrap(contentRef.current)
			trap.activate()
			return () => trap.deactivate()
		}, [open])

		const handleDragStart = (event: ReactTouchEvent | ReactMouseEvent) => {
			// Call external handler if provided with proper type narrowing
			if ('touches' in event) {
				props.onTouchStart?.(event as React.TouchEvent<HTMLDivElement>)
			} else {
				props.onMouseDown?.(event as React.MouseEvent<HTMLDivElement>)
			}

			if (!isMobile || !enableDragToClose) return

			const clientY =
				'touches' in event ? event.touches[0].clientY : event.clientY
			startYRef.current = clientY
			isDraggingRef.current = true
		}

		const handleDragMove = (event: ReactTouchEvent | ReactMouseEvent) => {
			// Call external handler if provided with proper type narrowing
			if ('touches' in event) {
				props.onTouchMove?.(event as React.TouchEvent<HTMLDivElement>)
			} else {
				props.onMouseMove?.(event as React.MouseEvent<HTMLDivElement>)
			}

			if (!isDraggingRef.current || startYRef.current === 0) return

			const clientY =
				'touches' in event ? event.touches[0].clientY : event.clientY
			const diff = clientY - startYRef.current

			if (diff > 0) {
				setDragOffset(diff)
			}
		}

		const handleDragEnd = (event: ReactTouchEvent | ReactMouseEvent) => {
			// Call external handler if provided with proper type narrowing
			if ('touches' in event) {
				props.onTouchEnd?.(event as React.TouchEvent<HTMLDivElement>)
			} else {
				props.onMouseUp?.(event as React.MouseEvent<HTMLDivElement>)
			}

			if (!isDraggingRef.current) return

			if (dragOffset > dragThreshold) {
				onOpenChange(false)
			}

			setDragOffset(0)
			startYRef.current = 0
			isDraggingRef.current = false
		}

		const handleContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
			props.onClick?.(event)
			event.stopPropagation()
		}

		if (!open) return null

		if (isMobile) {
			return (
				<Portal container={typeof window !== 'undefined' ? document.body : undefined}>
					<div
						className="fixed inset-0 flex flex-col pointer-events-none"
						style={{ zIndex: Z_INDEX.dialog, top: `${dragOffset}px` }}
					>
						<div className="flex-1 pointer-events-auto" />

						<div
							{...props}
							ref={contentRef}
							role="dialog"
							aria-modal="true"
							tabIndex={-1}
							className={`bg-popover text-popover-foreground border-t border-border rounded-t-2xl shadow-2xl flex flex-col pointer-events-auto max-h-[95vh] transition-transform ${className}`}
							style={{
								height: '65vh',
								transform: `translateY(${dragOffset}px)`,
								touchAction: 'none',
								...props.style
							}}
							onClick={handleContentClick}
							onTouchStart={handleDragStart}
							onTouchMove={handleDragMove}
							onTouchEnd={handleDragEnd}
							onMouseDown={handleDragStart}
							onMouseMove={handleDragMove}
							onMouseUp={handleDragEnd}
							onMouseLeave={(e) => {
								handleDragEnd(e as ReactTouchEvent | ReactMouseEvent)
								props.onMouseLeave?.(e)
							}}
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
					<Portal container={typeof window !== 'undefined' ? document.body : undefined}>
						<div
							className="fixed inset-0 flex items-center justify-center p-6"
							style={{ zIndex: Z_INDEX.dialog }}
						>
							<motion.div
								{...filterMotionProps(props)}
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
								className={`${fullscreen
									? 'w-full h-full'
									: 'w-full h-full max-w-[1400px] max-h-[900px]'
									} bg-popover text-popover-foreground rounded-xl shadow-2xl border border-border/40 flex flex-col overflow-hidden ${className}`}
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
)

export function DrawerHeader({
	children,
	className = '',
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={`flex flex-col gap-1.5 pb-4 ${className}`} {...props}>
			{children}
		</div>
	)
}

export function DrawerTitle({
	children,
	className = '',
	...props
}: HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h2
			className={`text-lg font-semibold text-foreground ${className}`}
			{...props}
		>
			{children}
		</h2>
	)
}

export interface DrawerCloseProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	className?: string
}

export const DrawerClose = forwardRef<HTMLButtonElement, DrawerCloseProps>(
	({ className = '', children, onClick, ...props }, ref) => {
		const { onOpenChange } = useDialogContext()

		const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
			onClick?.(e)
			onOpenChange(false)
		}

		return (
			<button
				type="button"
				ref={ref}
				onClick={handleClick}
				className={`absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
				{...props}
			>
				{children || <X className="h-4 w-4 text-muted-foreground" />}
			</button>
		)
	}
)

type DrawerFooterProps = {
	children: ReactNode
	className?: string
}

export function DrawerFooter({ children, className = '' }: DrawerFooterProps) {
	return (
		<div
			className={`flex items-center justify-end gap-2 pt-4 border-t border-border ${className}`}
		>
			{children}
		</div>
	)
}

export type DrawerDialogProps = {
	children: ReactNode
	open: boolean
	onOpenChange: (open: boolean) => void
	mobileBreakpoint?: string
	closeOnEscape?: boolean
	closeOnOutsideClick?: boolean
}

export type DialogAsideProps = {
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

export type DialogSectionProps = {
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

export type DialogSeparatorProps = {
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

export type DialogContentAreaProps = {
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
	disabled?: boolean
	disabledReason?: string
}

export type DialogNavGroupProps = {
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
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
	const [indicatorStyle, setIndicatorStyle] = useState<CSSProperties>({})

	const activeIndex = items.findIndex((item) => item.active)
	const currentIndex =
		hoveredIndex !== null
			? hoveredIndex
			: focusedIndex !== null
				? focusedIndex
				: activeIndex

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

	// Handle arrow key navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

			// Only handle if focus is within this nav group
			const focusedElement = document.activeElement
			const isInGroup = itemRefs.current.some(
				(ref) => ref === focusedElement
			)
			if (!isInGroup) return

			e.preventDefault()

			const currentFocusIndex = itemRefs.current.findIndex(
				(ref) => ref === focusedElement
			)
			if (currentFocusIndex === -1) return

			let newIndex = currentFocusIndex
			if (e.key === 'ArrowDown') {
				newIndex =
					currentFocusIndex < items.length - 1
						? currentFocusIndex + 1
						: 0
			} else {
				newIndex =
					currentFocusIndex > 0
						? currentFocusIndex - 1
						: items.length - 1
			}

			setFocusedIndex(newIndex)
			itemRefs.current[newIndex]?.focus()
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [items.length])

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
					onClick={() => {
						if (item.disabled) return
						item.onClick()
					}}
					onMouseEnter={() => setHoveredIndex(index)}
					onMouseLeave={() => setHoveredIndex(null)}
					onFocus={() => setFocusedIndex(index)}
					onBlur={() => {
						// Only clear focused index if focus is moving outside the group
						setTimeout(() => {
							const activeElement = document.activeElement
							const isStillInGroup = itemRefs.current.some(
								(ref) => ref === activeElement
							)
							if (!isStillInGroup) {
								setFocusedIndex(null)
							}
						}, 0)
					}}
					className={`relative z-10 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 w-full text-left focus:outline-none focus:ring-2 focus:ring-ring ${item.disabled
						? 'text-muted-foreground/60 cursor-not-allowed opacity-70'
						: item.active
							? 'text-accent-foreground bg-accent'
							: 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
						}`}
					title={item.disabled ? item.disabledReason || 'Disabled' : undefined}
					aria-disabled={item.disabled ? true : undefined}
				>
					{item.icon}
					<span>{item.label}</span>
				</button>
			))}
		</div>
	)
}
