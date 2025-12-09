import React from 'react'
import { FilePlus, FolderOpen, Search } from 'lucide-react'
import { cn } from '@skriuw/core-logic'

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
	return (
		<div className={cn('flex flex-col items-center justify-center py-8 px-4', className)}>
			{/* Icon with subtle animation */}
			<div className="mb-6 relative">
				<div className="absolute inset-0 bg-muted-foreground/10 rounded-full blur-md animate-pulse" />
				<div className="relative bg-background border border-border rounded-full p-4">
					{hasSearchQuery ? (
						<Search className="h-8 w-8 text-muted-foreground" />
					) : (
						<FilePlus className="h-8 w-8 text-muted-foreground" />
					)}
				</div>
			</div>

			{/* Title */}
			<h3 className="text-sm font-semibold text-foreground mb-2">
				{hasSearchQuery ? 'No results found' : 'No notes yet'}
			</h3>

			{/* Description */}
			<p className="text-xs text-muted-foreground text-center mb-6 max-w-[180px] leading-relaxed">
				{hasSearchQuery
					? "We couldn't find any notes matching your search. Try different keywords or clear the search."
					: 'Start organizing your thoughts by creating your first note or folder.'}
			</p>

			{/* Actions */}
			<div className="flex flex-col gap-2 w-full max-w-[160px]">
				{!hasSearchQuery && onCreateNote && (
					<button
						onClick={onCreateNote}
						className="w-full px-3 py-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors flex items-center justify-center gap-2 font-medium"
					>
						<FilePlus className="h-3 w-3" />
						Create Note
					</button>
				)}

				{!hasSearchQuery && onCreateFolder && (
					<button
						onClick={onCreateFolder}
						className="w-full px-3 py-2 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-md transition-colors flex items-center justify-center gap-2 font-medium"
					>
						<FolderOpen className="h-3 w-3" />
						New Folder
					</button>
				)}

				{hasSearchQuery && onSearch && (
					<button
						onClick={onSearch}
						className="w-full px-3 py-2 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-md transition-colors flex items-center justify-center gap-2 font-medium"
					>
						<Search className="h-3 w-3" />
						Clear Search
					</button>
				)}
			</div>

			{/* Decorative elements */}
			<div className="absolute bottom-4 left-4 right-4 flex justify-center">
				<div className="flex gap-1">
					<div className="w-1 h-1 bg-muted-foreground/20 rounded-full" />
					<div className="w-1 h-1 bg-muted-foreground/20 rounded-full" />
					<div className="w-1 h-1 bg-muted-foreground/20 rounded-full" />
				</div>
			</div>
		</div>
	)
}
