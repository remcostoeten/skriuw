import { ReactNode } from 'react'

import { AppLayoutContainer } from './app-layout-container'

import type { SidebarContentType } from '@/components/sidebar/types'

type props = {
	children: ReactNode
	showSidebar?: boolean
	sidebarActiveNoteId?: string
	sidebarContentType?: SidebarContentType
	sidebarCustomContent?: ReactNode
}

/**
 * Legacy AppLayout component - now a wrapper around AppLayoutContainer
 * @deprecated Use AppLayoutContainer directly for new code
 */
export function AppLayout({
	children,
	showSidebar = true,
	sidebarActiveNoteId,
	sidebarContentType,
	sidebarCustomContent
}: props) {
	return (
		<AppLayoutContainer
			showSidebar={showSidebar}
			sidebarActiveNoteId={sidebarActiveNoteId}
			sidebarContentType={sidebarContentType}
			sidebarCustomContent={sidebarCustomContent}
		>
			{children}
		</AppLayoutContainer>
	)
}
