'use client'

import { ReactNode } from 'react'

type props = {
	actionBar: ReactNode
	content: ReactNode
	className?: string
}

/**
 * Pure layout component for sidebar structure
 * Contains no data loading logic - only visual layout
 */
export function SidebarLayout({ actionBar, content, className = '' }: props) {
	return (
		<div
			className={`w-[210px] h-full bg-sidebar-background flex flex-col border-r border-sidebar-border ${className}`}
		>
			{actionBar}
			<div className="flex-1 overflow-y-auto px-1 pb-4">{content}</div>
		</div>
	)
}
