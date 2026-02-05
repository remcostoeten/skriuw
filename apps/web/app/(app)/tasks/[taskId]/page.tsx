'use client'

import {
	useTaskByIdQuery,
	useUpdateTaskMutation,
	useDeleteTaskMutation
} from '@/features/tasks/hooks/use-tasks-query'
import { notify } from '@/lib/notify'
import { cn } from '@skriuw/shared'
import { Checkbox } from '@skriuw/ui/primitives/checkbox'
import { ArrowLeft, Calendar, CheckSquare, Clock, Trash2, X, ExternalLink } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function TaskDetailPage() {
	const router = useRouter()
	const params = useParams()
	const taskId = params.taskId as string

	const { data: task, isLoading, error } = useTaskByIdQuery(taskId)
	const updateTaskMutation = useUpdateTaskMutation()
	const deleteTaskMutation = useDeleteTaskMutation()

	const [description, setDescription] = useState('')
	const [dueDate, setDueDate] = useState<string>('')
	const [isDirty, setIsDirty] = useState(false)

	useEffect(() => {
		if (task && !isDirty) {
			setDescription(task.description || '')
			if (task.dueDate) {
				setDueDate(new Date(task.dueDate).toISOString().split('T')[0])
			}
		}
	}, [task, isDirty])

	function handleBack() {
		router.back()
	}

	function handleGoToNote() {
		if (task) {
			router.push(`/note/${task.noteId}?blockId=${task.blockId}`)
		}
	}

	function handleToggleCheck() {
		if (!task) return
		const newChecked = task.checked ? 0 : 1
		updateTaskMutation.mutate({ taskId, updates: { checked: newChecked } })
	}

	function handleDescriptionChange(value: string) {
		setDescription(value)
		setIsDirty(true)
	}

	function handleDescriptionBlur() {
		if (!task || description === (task.description || '')) {
			setIsDirty(false)
			return
		}
		updateTaskMutation.mutate(
			{ taskId, updates: { description: description || null } },
			{ onSettled: () => setIsDirty(false) }
		)
	}

	function handleDueDateChange(e: React.ChangeEvent<HTMLInputElement>) {
		const value = e.target.value
		setDueDate(value)

		if (value) {
			const timestamp = new Date(value).getTime()
			updateTaskMutation.mutate({ taskId, updates: { dueDate: timestamp } })
		} else {
			updateTaskMutation.mutate({ taskId, updates: { dueDate: null } })
		}
	}

	function handleClearDueDate() {
		setDueDate('')
		updateTaskMutation.mutate({ taskId, updates: { dueDate: null } })
	}

	function handleDelete() {
		if (!task) return
		if (!confirm('Are you sure you want to delete this task?')) return

		deleteTaskMutation.mutate(taskId, {
			onSuccess: () => {
				notify('Task deleted')
				router.push('/tasks')
			},
			onError: () => {
				notify('Failed to delete task')
			}
		})
	}

	if (isLoading) {
		return (
			<div className='flex-1 flex items-center justify-center'>
				<div className='text-muted-foreground'>Loading task...</div>
			</div>
		)
	}

	if (error || !task) {
		return (
			<div className='flex-1 flex flex-col items-center justify-center gap-4'>
				<div className='text-red-400'>{error?.message || 'Task not found'}</div>
				<button
					onClick={handleBack}
					className='text-sm text-muted-foreground hover:text-foreground underline'
				>
					Go back
				</button>
			</div>
		)
	}

	const isSaving = updateTaskMutation.isPending

	return (
		<div className='flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-8'>
			<div className='flex items-center gap-4 mb-8'>
				<button
					onClick={handleBack}
					className='p-2 rounded-lg hover:bg-muted/50 transition-colors'
					title='Go back'
				>
					<ArrowLeft className='w-5 h-5' />
				</button>
				{task.noteName && (
					<button
						onClick={handleGoToNote}
						className='flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors'
						title='Go to source note'
					>
						<span className='truncate max-w-[200px]'>{task.noteName}</span>
						<ExternalLink className='w-3.5 h-3.5' />
					</button>
				)}
				{isSaving && (
					<span className='text-xs text-muted-foreground ml-auto'>Saving...</span>
				)}
			</div>

			<div className='flex items-start gap-4 mb-8'>
				<div className='shrink-0 mt-1'>
					<Checkbox
						checked={!!task.checked}
						size='lg'
						variant='default'
						onChange={handleToggleCheck}
					/>
				</div>
				<h1
					className={cn(
						'text-2xl font-semibold flex-1',
						task.checked && 'line-through text-muted-foreground'
					)}
				>
					{task.content || 'Untitled task'}
				</h1>
			</div>

			<div className='space-y-6'>
				<div className='flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/50'>
					<Calendar className='w-5 h-5 text-muted-foreground' />
					<div className='flex-1'>
						<div className='text-sm font-medium'>Due Date</div>
						<input
							type='date'
							value={dueDate}
							onChange={handleDueDateChange}
							className={cn(
								'text-xs bg-transparent border-none p-0 mt-0.5',
								'focus:outline-none focus:ring-0',
								dueDate ? 'text-foreground' : 'text-muted-foreground'
							)}
						/>
					</div>
					{dueDate && (
						<button
							onClick={handleClearDueDate}
							className='p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground'
							title='Clear due date'
						>
							<X className='w-4 h-4' />
						</button>
					)}
				</div>

				<div className='space-y-2'>
					<label className='text-sm font-medium flex items-center gap-2'>
						<CheckSquare className='w-4 h-4 text-muted-foreground' />
						Description
					</label>
					<textarea
						value={description}
						onChange={(e) => handleDescriptionChange(e.target.value)}
						onBlur={handleDescriptionBlur}
						placeholder='Add a description, notes, or details about this task...'
						className={cn(
							'w-full min-h-[150px] p-4 rounded-lg resize-none',
							'bg-muted/30 border border-border/50',
							'text-sm text-foreground placeholder:text-muted-foreground',
							'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
						)}
					/>
				</div>

				<div className='space-y-2'>
					<label className='text-sm font-medium flex items-center gap-2'>
						<CheckSquare className='w-4 h-4 text-muted-foreground' />
						Subtasks
					</label>
					<div className='p-4 rounded-lg bg-muted/30 border border-border/50 text-center'>
						<p className='text-xs text-muted-foreground'>
							Subtasks are created as nested tasks within notes
						</p>
						<button
							onClick={handleGoToNote}
							className='mt-2 text-xs text-primary hover:underline'
						>
							Edit in note
						</button>
					</div>
				</div>

				<div className='pt-6 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground'>
					<div className='flex items-center gap-1'>
						<Clock className='w-3.5 h-3.5' />
						Created {new Date(task.createdAt).toLocaleDateString()}
					</div>
					<button
						onClick={handleDelete}
						className='flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors'
					>
						<Trash2 className='w-3.5 h-3.5' />
						Delete task
					</button>
				</div>
			</div>
		</div>
	)
}
