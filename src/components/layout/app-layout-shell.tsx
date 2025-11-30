import { ReactNode } from 'react'

import { cn } from '@/shared/utilities'
import { useMediaQuery, MOBILE_BREAKPOINT } from '@/shared/utilities/use-media-query'

type props = {
    leftToolbar?: ReactNode
    sidebar: ReactNode
    topToolbar: ReactNode
    mainContent: ReactNode
    footer: ReactNode
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
}: props) {
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
    return (
        <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
            <div className="flex flex-1 overflow-hidden relative">
                {/* Enhanced backdrop for mobile - better z-index and handling */}
                {isSidebarOpen && isMobile && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => {
                            // Close sidebar when clicking backdrop on mobile
                            // This will be handled by parent component
                        }}
                    />
                )}

                {leftToolbar && (
                    <div className="hidden lg:block">
                        {leftToolbar}
                    </div>
                )}

                {/* Enhanced Sidebar with improved mobile behavior */}
                {sidebar && (
                    <div
                        className={cn(
                            // Base positioning
                            'fixed lg:static inset-y-0 left-0',
                            // Improved z-index handling
                            'z-50 lg:z-0',
                            // Responsive width
                            isMobile ? 'w-[280px] max-w-[80vw]' : 'w-auto',
                            // Smooth transitions
                            'transform transition-all duration-300 ease-in-out',
                            // Mobile slide behavior
                            isMobile && (isSidebarOpen ? 'translate-x-0' : '-translate-x-full'),
                            // Desktop toggle behavior
                            !isMobile && (isDesktopSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'),
                            // Hide on desktop when closed
                            !isMobile && !isDesktopSidebarOpen && 'lg:-translate-x-full'
                        )}
                        style={{
                            // Add shadow for mobile
                            boxShadow: isMobile && isSidebarOpen ? '2px 0 8px rgba(0,0,0,0.15)' : 'none'
                        }}
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
                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
