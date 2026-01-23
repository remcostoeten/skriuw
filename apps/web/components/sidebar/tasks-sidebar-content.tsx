'use client'

import { useAllTasksQuery, useUpdateTaskMutation } from "@/features/tasks/hooks/use-tasks-query";
import type { TaskWithNote } from "@/features/tasks/types";
import { cn } from "@skriuw/shared";
import { Checkbox } from "@skriuw/ui/primitives/checkbox";
import { CheckSquare, FileText, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

type TProps = {
	className?: string
	activeNoteId?: string
}

export function TasksSidebarContent({ className, activeNoteId }: TProps) {
	const router = useRouter()
	const { data: tasks = [], isLoading, error, refetch } = useAllTasksQuery()
	const updateTask = useUpdateTaskMutation()

	function handleTaskClick(task: TaskWithNote) {
		router.push(`/tasks/${task.id}`)
	}

	function handleToggleCheck(task: TaskWithNote, e: React.MouseEvent) {
		e.stopPropagation()
		const newChecked = task.checked ? 0 : 1
		updateTask.mutate({ taskId: task.id, updates: { checked: newChecked } })
	}

	const tasksByNote = tasks.reduce<Record<string, TaskWithNote[]>>((acc, task) => {
		const noteKey = task.noteId
		if (!acc[noteKey]) {
			acc[noteKey] = []
		}
		acc[noteKey].push(task)
		return acc
	}, {})

	if (isLoading) {
		return (
			<div
				className={cn(
					'w-[210px] h-full bg-sidebar-background flex flex-col border-r border-sidebar-border',
					className
				)}
			>
				<div className='px-4 py-3 border-b border-sidebar-border'>
					<h2 className='text-sm font-semibold text-sidebar-foreground'>Tasks</h2>
				</div>
				<div className='flex-1 flex items-center justify-center'>
					<RefreshCw className='w-4 h-4 animate-spin text-sidebar-foreground/50' />
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div
				className={cn(
					'w-[210px] h-full bg-sidebar-background flex flex-col border-r border-sidebar-border',
					className
				)}
			>
				<div className='px-4 py-3 border-b border-sidebar-border'>
					<h2 className='text-sm font-semibold text-sidebar-foreground'>Tasks</h2>
				</div>
				<div className='flex-1 flex flex-col items-center justify-center gap-2 px-4'>
					<p className='text-xs text-red-400'>{error.message}</p>
					<button
						onClick={() => refetch()}
						className='text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground underline'
					>
						Retry
					</button>
				</div>
			</div>
		)
	}

	if (tasks.length === 0) {
		return (
			<div
				className={cn(
					'w-[210px] h-full bg-sidebar-background flex flex-col border-r border-sidebar-border',
					className
				)}
			>
				<div className='px-4 py-3 border-b border-sidebar-border'>
					<h2 className='text-sm font-semibold text-sidebar-foreground'>Tasks</h2>
				</div>
				<div className='flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center'>
					<CheckSquare className='w-8 h-8 text-sidebar-foreground/30' />
					<p className='text-xs text-sidebar-foreground/50'>No tasks yet</p>
					<p className='text-xs text-sidebar-foreground/40'>
						Use /task in the editor to create tasks
					</p>
				</div>
			</div>
		)
	}

	return (
		<div
			className={cn(
				'w-[210px] h-full bg-sidebar-background flex flex-col border-r border-sidebar-border',
				className
			)}
		>
			<div className='px-4 py-3 border-b border-sidebar-border flex items-center justify-between'>
				<h2 className='text-sm font-semibold text-sidebar-foreground'>Tasks</h2>
				<span className='text-xs text-sidebar-foreground/50'>{tasks.length}</span>
			</div>
			<div className='flex-1 overflow-y-auto py-2'>
				{Object.entries(tasksByNote).map(([noteId, noteTasks]) => {
					const isCurrentNote = noteId === activeNoteId
					const noteName = noteTasks[0]?.noteName || 'Unknown Note'

					return (
						<div key={noteId} className='mb-3'>
							<div
								className={cn(
									'flex items-center gap-1.5 px-3 py-1 text-xs',
									isCurrentNote
										? 'text-sidebar-accent-foreground font-medium'
										: 'text-sidebar-foreground/50'
								)}
							>
								<FileText className='w-3 h-3' />
								<span className='truncate'>{noteName}</span>
							</div>

							<div className='space-y-0.5'>
								{noteTasks.map((task) => (
									<button
										key={task.id}
										onClick={() => handleTaskClick(task)}
										className={cn(
											'w-full flex items-start gap-2 px-3 py-1.5 text-left',
											'hover:bg-sidebar-accent/50 transition-colors group',
											task.checked ? 'opacity-60' : ''
										)}
									>
										<div
											className='shrink-0 mt-0.5'
											onClick={(e) => handleToggleCheck(task, e)}
										>
											<Checkbox
												checked={!!task.checked}
												size='sm'
												variant='default'
												onChange={() => {}}
											/>
										</div>
										<span
											className={cn(
												'text-xs text-sidebar-foreground flex-1 min-w-0 truncate',
												task.checked &&
													'line-through text-sidebar-foreground/50'
											)}
										>
											{task.content || 'Untitled task'}
										</span>
									</button>
								))}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
