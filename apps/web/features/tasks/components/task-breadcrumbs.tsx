'use client'

import type { TaskBreadcrumb } from "../hooks/use-task-context";
import { cn } from "@skriuw/shared";
import { ChevronRight, Home } from "lucide-react";

type TaskBreadcrumbsProps = {
	items: TaskBreadcrumb[]
	currentTaskTitle?: string
	onNavigate: (taskId: string | null) => void
	className?: string
}

export function TaskBreadcrumbs({
	items,
	currentTaskTitle,
	onNavigate,
	className
}: TaskBreadcrumbsProps) {
	if (items.length === 0 && !currentTaskTitle) return null

	return (
		<nav
			className={cn(
				'flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto',
				'scrollbar-none',
				className
			)}
			aria-label='Task hierarchy'
		>
			<button
				onClick={() => onNavigate(null)}
				className='shrink-0 p-1 rounded hover:bg-muted hover:text-foreground transition-colors'
				title='Back to note'
			>
				<Home className='h-3.5 w-3.5' />
			</button>

			{items.map((item) => (
				<div key={item.id} className='flex items-center gap-1 min-w-0'>
					<ChevronRight className='h-3 w-3 shrink-0 opacity-50' />
					<button
						onClick={() => onNavigate(item.id)}
						className={cn(
							'truncate max-w-[120px] hover:text-foreground transition-colors',
							'hover:underline underline-offset-2'
						)}
						title={item.content}
					>
						{item.content || 'Untitled'}
					</button>
				</div>
			))}

			{currentTaskTitle && (
				<div className='flex items-center gap-1 min-w-0'>
					<ChevronRight className='h-3 w-3 shrink-0 opacity-50' />
					<span className='truncate max-w-[150px] text-foreground font-medium'>
						{currentTaskTitle}
					</span>
				</div>
			)}
		</nav>
	)
}
