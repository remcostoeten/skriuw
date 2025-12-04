import { ReactNode, useRef, useState, type TouchEvent, type MouseEvent } from 'react'

import { cn } from '@quantum-work/core-logic'
import { useMediaQuery, MOBILE_BREAKPOINT } from '@quantum-work/core-logic/use-media-query'

type props = {
	leftToolbar?: ReactNode
	sidebar: ReactNode
	topToolbar: ReactNode
	mainContent: ReactNode
	footer: ReactNode
	rightPanel: ReactNode
	floatingWidgets: ReactNode
	isRightPanelOpen: boolean
	isSidebarOpen: boolean
	isDesktopSidebarOpen: boolean
	onSidebarClose?: () => void
}

/**
 * Pure layout shell component with no data loading
 * Defines the grid structure and positioning only
 */
export function AppLayoutShell({
	leftToolbar,
	sidebar,
	topToolbar,
	mainContent,
	footer,
	rightPanel,
	floatingWidgets,
	isRightPanelOpen = false,
	isSidebarOpen = false,
	isDesktopSidebarOpen = true,
	onSidebarClose,
}: props) {
	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
	const sidebarRef = useRef<HTMLDivElement>(null)
	const [dragOffset, setDragOffset] = useState(0)
	const startXRef = useRef(0)
	const isDraggingRef = useRef(false)
	const dragThreshold = 100

	const handleBackdropClick = () => {
		if (onSidebarClose && isMobile) {
			onSidebarClose()
		}
	}

	const handleDragStart = (event: TouchEvent | MouseEvent) => {
		if (!isMobile || !isSidebarOpen) return

		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
		startXRef.current = clientX
		isDraggingRef.current = true
	}

	const handleDragMove = (event: TouchEvent | MouseEvent) => {
		if (!isDraggingRef.current || startXRef.current === 0 || !isMobile) return

		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
		const diff = startXRef.current - clientX // Negative because we're dragging left

		if (diff > 0) {
			setDragOffset(diff)
		}
	}

	const handleDragEnd = () => {
		if (!isDraggingRef.current || !isMobile) return

		if (dragOffset > dragThreshold && onSidebarClose) {
			onSidebarClose()
		}

		setDragOffset(0)
		startXRef.current = 0
		isDraggingRef.current = false
	}

	return (
		<div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
			<div className="flex flex-1 overflow-hidden relative">
				{/* Enhanced backdrop for mobile - better z-index and handling */}
				{isSidebarOpen && isMobile && (
					<div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={handleBackdropClick} />
				)}

				{leftToolbar && <div className="hidden lg:block">{leftToolbar}</div>}

				{/* Enhanced Sidebar with improved mobile behavior */}
				{sidebar && (
					<div
						ref={sidebarRef}
						className={cn(
							// Base positioning
							'fixed lg:static inset-y-0 left-0',
							// Improved z-index handling
							'z-50 lg:z-0',
							// Responsive width
							isMobile ? 'w-[280px] max-w-[80vw]' : 'w-auto',
							// Smooth transitions (only when not dragging)
							'transform transition-all duration-300 ease-in-out',
							isDraggingRef.current && 'transition-none',
							// Mobile slide behavior
							isMobile && (isSidebarOpen ? 'translate-x-0' : '-translate-x-full'),
							// Desktop toggle behavior
							!isMobile &&
								(isDesktopSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'),
							// Hide on desktop when closed
							!isMobile && !isDesktopSidebarOpen && 'lg:-translate-x-full'
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
						isRightPanelOpen && 'pr-[420px]'
					)}
				>
					{topToolbar}
					<div className="flex-1 overflow-y-auto overflow-x-hidden bg-background-secondary">
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
