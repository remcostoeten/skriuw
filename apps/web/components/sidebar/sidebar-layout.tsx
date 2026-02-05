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
			className={`w-full max-w-[320px] lg:w-[210px] h-full bg-sidebar-background flex flex-col border-r border-sidebar-border pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-sm lg:shadow-none ${className}`}
		>
			{actionBar}
			<div className='flex-1 overflow-y-auto px-2 pb-6 lg:px-1 lg:pb-4 overscroll-contain space-y-2'>
				{content}
			</div>
		</div>
	)
}
