import { ReactNode, useRef, useState, type TouchEvent, type MouseEvent } from 'react'

import { cn } from '@skriuw/shared'
import { MOBILE_BREAKPOINT } from '@skriuw/shared/client'
import { useMediaQuery } from '@skriuw/shared/client'
import { Icons } from '@skriuw/ui'


type props = {
	leftToolbar?: ReactNode
	sidebar: ReactNode
	sidebarVisible?: boolean // Control sidebar visibility without unmounting
	topToolbar: ReactNode
	mainContent: ReactNode
	footer: ReactNode
	rightPanel: ReactNode
	floatingWidgets: ReactNode
	isRightPanelOpen: boolean
	isTaskPanelOpen?: boolean
	isSidebarOpen: boolean
	isDesktopSidebarOpen: boolean
	onSidebarClose?: () => void
	onSidebarOpen?: () => void
}

/**
 * Pure layout shell component with no data loading
 * Defines the grid structure and positioning only
 */
export function AppLayoutShell({
	leftToolbar,
	sidebar,
	sidebarVisible = true,
	topToolbar,
	mainContent,
	footer,
	rightPanel,
	floatingWidgets,
	isRightPanelOpen = false,
	isTaskPanelOpen = false,
	isSidebarOpen = false,
	isDesktopSidebarOpen = true,
	onSidebarClose,
	onSidebarOpen,
}: props) {
	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
	const sidebarRef = useRef<HTMLDivElement>(null)
	const [dragOffset, setDragOffset] = useState(0)
	const startXRef = useRef(0)
	const isDraggingRef = useRef(false)
	const dragThreshold = 100

	// Edge swipe state
	const edgeStartXRef = useRef(0)
	const isEdgeDraggingRef = useRef(false)


	function handleBackdropClick() {
		if (onSidebarClose && isMobile) {
			onSidebarClose()
		}
	}

	function handleDragStart(event: TouchEvent | MouseEvent) {
		if (!isMobile || !isSidebarOpen) return

		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
		startXRef.current = clientX
		isDraggingRef.current = true
	}

	function handleDragMove(event: TouchEvent | MouseEvent) {
		if (!isDraggingRef.current || startXRef.current === 0 || !isMobile) return

		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
		const diff = startXRef.current - clientX // Negative because we're dragging left

		if (diff > 0) {
			setDragOffset(diff)
		}
	}

	function handleDragEnd() {
		if (!isDraggingRef.current || !isMobile) return

		if (dragOffset > dragThreshold && onSidebarClose) {
			onSidebarClose()
		}

		setDragOffset(0)
		startXRef.current = 0
		isDraggingRef.current = false
	}

	// Edge swipe handlers for opening sidebar
	function handleEdgeTouchStart(event: TouchEvent) {
		if (!isMobile || isSidebarOpen) return
		edgeStartXRef.current = event.touches[0].clientX
		isEdgeDraggingRef.current = true
	}

	function handleEdgeTouchMove(event: TouchEvent) {
		if (!isEdgeDraggingRef.current || !isMobile || isSidebarOpen) return

		const currentX = event.touches[0].clientX
		const diff = currentX - edgeStartXRef.current

		// If dragged right more than threshold, open
		if (diff > 50 && onSidebarOpen) { // Lower threshold for opening feels snappier
			onSidebarOpen()
			isEdgeDraggingRef.current = false
			edgeStartXRef.current = 0
		}
	}

	function handleEdgeTouchEnd() {
		isEdgeDraggingRef.current = false
		edgeStartXRef.current = 0
	}

	return (
		<div className="h-screen w-screen flex flex-col bg-background overflow-hidden touch-pan-y pt-[env(safe-area-inset-top)]">
			<div className="flex flex-1 overflow-hidden relative">

				{/* Enhanced backdrop for mobile - better z-index and handling */}
				{isSidebarOpen && isMobile && (
					<div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={handleBackdropClick} />
				)}

				{/* Edge Swipe Hit Area - Only active when mobile and sidebar closed */}
				{isMobile && !isSidebarOpen && (
					<div
						className="fixed inset-y-0 left-0 w-5 z-50 md:hidden"
						onTouchStart={handleEdgeTouchStart}
						onTouchMove={handleEdgeTouchMove}
						onTouchEnd={handleEdgeTouchEnd}
					/>
				)}

				{leftToolbar && <div className="hidden md:block">{leftToolbar}</div>}

				{/* Enhanced Sidebar with improved mobile behavior */}
				{sidebar && (
					<div
						ref={sidebarRef}
						className={cn(
							// Base positioning
							'fixed md:static inset-y-0 left-0',
							// Improved z-index handling
							'z-50 md:z-0',
							// Responsive width
							isMobile ? 'w-[280px] max-w-[80vw]' : 'w-auto',
							// Smooth transitions (only when not dragging)
							'transform transition-all duration-300 ease-in-out',
							isDraggingRef.current && 'transition-none',
							// Mobile slide behavior
							isMobile && (isSidebarOpen ? 'translate-x-0' : '-translate-x-full'),
							// Desktop toggle behavior
							!isMobile &&
							(isDesktopSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'),
							// Hide on desktop when closed
							!isMobile && !isDesktopSidebarOpen && 'md:hidden',
							// Hide via CSS when sidebarVisible is false (SPA-like, stays mounted)
							!sidebarVisible && 'hidden'
						)}
						style={{
							// Add shadow for mobile
							boxShadow: isMobile && isSidebarOpen ? '2px 0 8px rgba(0,0,0,0.15)' : 'none',
							// Apply drag offset on mobile
							transform:
								isMobile && isSidebarOpen && dragOffset > 0
									? `translateX(calc(-100% + ${dragOffset}px))`
									: undefined,
						}}
						onTouchStart={handleDragStart}
						onTouchMove={handleDragMove}
						onTouchEnd={handleDragEnd}
						onMouseDown={handleDragStart}
						onMouseMove={handleDragMove}
						onMouseUp={handleDragEnd}
						onMouseLeave={handleDragEnd}
					>
						{sidebar}
					</div>
				)}

				<div
					className={cn(
						'flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out',
						// Task panel adjustments
						isTaskPanelOpen && 'pr-[480px] lg:pr-[560px]',
						isRightPanelOpen && !isTaskPanelOpen && 'pr-[500px]'
					)}
				>
					<div className="sticky z-[60] top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
						{topToolbar}
					</div>
					<div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-background-secondary pb-[calc(2.25rem+env(safe-area-inset-bottom))] max-lg:pb-[calc(5rem+env(safe-area-inset-bottom))]">
						{mainContent}
					</div>
					{footer}
				</div>

				{/* Right Panel (e.g., shortcuts sidebar) */}
				{rightPanel}
			</div>

			{/* Floating Widgets (e.g., storage status toggle) */}
			{floatingWidgets}
		</div>
	)
}
