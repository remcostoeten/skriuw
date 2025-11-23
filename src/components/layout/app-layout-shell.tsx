import { ReactNode } from 'react'

import { cn } from '@/shared/utilities'

interface AppLayoutShellProps {
	leftToolbar?: ReactNode
	sidebar?: ReactNode
	topToolbar?: ReactNode
	mainContent: ReactNode
	footer?: ReactNode
	rightPanel?: ReactNode
	floatingWidgets?: ReactNode
	isRightPanelOpen?: boolean
	isSidebarOpen?: boolean
	isDesktopSidebarOpen?: boolean
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
	isDesktopSidebarOpen = true
}: AppLayoutShellProps) {
	return (
		<div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
			<div className="flex flex-1 overflow-hidden relative">
				{/* Mobile Overlay */}
				{isSidebarOpen && (
					<div className="fixed inset-0 bg-black/50 z-20 lg:hidden" />
				)}

				{/* Left Toolbar */}
				{leftToolbar && (
					<div
						className={`hidden lg:block transition-all duration-200 ${
							isDesktopSidebarOpen ? 'w-auto' : 'w-0'
						}`}
					>
						{leftToolbar}
					</div>
				)}

				{/* Sidebar */}
				{sidebar && (
					<div
						className={`
							fixed lg:static inset-y-0 left-0 z-30 lg:z-0
							transform transition-transform duration-200 ease-in-out
							${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
						`}
					>
						{sidebar}
					</div>
				)}

				{/* Main Content Area */}
				<div
					className={cn(
						'flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out',
						isRightPanelOpen && 'pr-[420px]'
					)}
				>
					{topToolbar}
					<div className="flex-1 overflow-hidden">{mainContent}</div>
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

