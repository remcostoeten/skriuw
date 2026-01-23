import React from "react";

type SidebarEmptyStateProps = {
	hasSearchQuery?: boolean
	className?: string
}

export function SidebarEmptyState({
	hasSearchQuery = false,
	className = ''
}: SidebarEmptyStateProps) {
	return (
		<div className={`flex items-center justify-center p-8 ${className}`}>
			<p className='text-sm text-muted-foreground text-center'>
				{hasSearchQuery ? 'No results found' : 'No notes yet'}
			</p>
		</div>
	)
}
