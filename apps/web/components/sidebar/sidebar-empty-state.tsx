import React from 'react'
import { FilePlus, Search } from 'lucide-react'
import { EmptyState } from '../ui/empty-state'

interface SidebarEmptyStateProps {
	hasSearchQuery?: boolean
	onCreateNote?: () => void
	onCreateFolder?: () => void
	onSearch?: () => void
	className?: string
}

export function SidebarEmptyState({
	hasSearchQuery = false,
	onCreateNote,
	onCreateFolder,
	onSearch,
	className = '',
}: SidebarEmptyStateProps) {
	const actions = hasSearchQuery
		? onSearch
			? [{ label: 'Clear Search', onClick: onSearch }]
			: []
		: [
			...(onCreateNote ? [{ label: 'Create Note', onClick: onCreateNote }] : []),
			...(onCreateFolder ? [{ label: 'New Folder', onClick: onCreateFolder }] : []),
		]

	return (
		<EmptyState
			className={className}
			icon={hasSearchQuery ? <Search className="h-8 w-8" /> : <FilePlus className="h-8 w-8" />}
			title={hasSearchQuery ? 'No results found' : 'No notes yet'}
			description={
				hasSearchQuery
					? "We couldn't find any notes matching your search. Try different keywords or clear the search."
					: 'Start organizing your thoughts by creating your first note or folder.'
			}
			actions={actions}
		/>
	)
}
