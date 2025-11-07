'use client'

import type { Task } from '@/api/db/schema'
import { useUpdateTask } from '@/modules/tasks/api/mutations/update'
import { 
	AlertCircle, 
	CheckCircle2, 
	Circle, 
	Clock, 
	MessageSquare, 
	Paperclip,
	Tag as TagIcon,
	Calendar,
	AlertTriangle
} from 'lucide-react'
import { useMemo } from 'react'

type TaskBoardViewProps = {
	tasks: Task[]
	onTaskClick: (task: Task) => void
}

const STATUS_COLUMNS = [
	{ id: 'todo', label: 'To Do', icon: Circle, color: 'text-muted-foreground' },
	{ id: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-foreground' },
	{ id: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'text-foreground' },
	{ id: 'done', label: 'Done', icon: CheckCircle2, color: 'text-muted-foreground' }
]

export function TaskBoardView({ tasks, onTaskClick }: TaskBoardViewProps) {
	const { updateTask } = useUpdateTask()

	const tasksByStatus = useMemo(() => {
		const groups: Record<string, Task[]> = {
			todo: [],
			in_progress: [],
			blocked: [],
			done: []
		}

		tasks.forEach(task => {
			const status = task.status || 'todo'
			if (groups[status]) {
				groups[status].push(task)
			}
		})

		return groups
	}, [tasks])

	const handleDragStart = (e: React.DragEvent, task: Task) => {
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('taskId', String(task.id))
	}

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
	}

	const handleDrop = async (e: React.DragEvent, newStatus: string) => {
		e.preventDefault()
		const taskId = e.dataTransfer.getData('taskId')
		if (taskId) {
			await updateTask(taskId, { status: newStatus as any })
		}
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			{STATUS_COLUMNS.map(column => {
				const Icon = column.icon
				const columnTasks = tasksByStatus[column.id] || []
				
				return (
					<div
						key={column.id}
						className="flex flex-col bg-background/30 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden"
						onDragOver={handleDragOver}
						onDrop={e => handleDrop(e, column.id)}
					>
						{/* Column Header */}
						<div className="px-4 py-3 border-b border-border/50 bg-muted/30">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Icon className={`w-4 h-4 ${column.color}`} />
									<h3 className="font-semibold text-sm text-foreground">
										{column.label}
									</h3>
								</div>
								<span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
									{columnTasks.length}
								</span>
							</div>
						</div>

						{/* Column Content */}
						<div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-300px)] scrollbar-thin">
							{columnTasks.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<Icon className={`w-8 h-8 ${column.color} opacity-30 mb-2`} />
									<p className="text-xs text-muted-foreground">No tasks</p>
								</div>
							) : (
								columnTasks.map(task => (
									<TaskCard
										key={task.id}
										task={task}
										onDragStart={handleDragStart}
										onClick={onTaskClick}
									/>
								))
							)}
						</div>
					</div>
				)
			})}
		</div>
	)
}

type TaskCardProps = {
	task: Task
	onDragStart: (e: React.DragEvent, task: Task) => void
	onClick: (task: Task) => void
}

function TaskCard({ task, onDragStart, onClick }: TaskCardProps) {
	const priorityColors = {
		urgent: 'border-l-foreground bg-muted/30',
		high: 'border-l-foreground/80 bg-muted/20',
		med: 'border-l-border bg-muted/10',
		low: 'border-l-border bg-background'
	}

	const priorityBadges = {
		urgent: { label: 'Urgent', color: 'bg-muted text-foreground border border-border' },
		high: { label: 'High', color: 'bg-muted text-foreground border border-border' },
		med: { label: 'Med', color: 'bg-muted/50 text-muted-foreground border border-border/50' },
		low: { label: 'Low', color: 'bg-muted/30 text-muted-foreground border border-border/30' }
	}

	const isOverdue = task.dueAt && task.dueAt < Date.now() && !task.completed
	const isDueToday = task.dueAt && new Date(task.dueAt).toDateString() === new Date().toDateString()
	
	const tags = task.tags ? (Array.isArray(task.tags) ? task.tags : task.tags.split(',').map(t => t.trim())) : []
	const commentCount = (task.comments?.length || 0)
	const subtaskCount = (task.subtasks?.length || 0)

	return (
		<div
			draggable
			onDragStart={e => onDragStart(e, task)}
			onClick={() => onClick(task)}
			className={`
				group relative
				bg-background rounded-lg border-l-4 border-y border-r border-border/50
				p-3 cursor-pointer
				transition-all duration-200
				hover:shadow-lg
				${priorityColors[task.priority]}
				${task.completed ? 'opacity-60' : ''}
			`}
		>
			{/* Priority Badge */}
			<div className="flex items-center justify-between mb-2">
				<span className={`
					text-[10px] font-semibold px-2 py-0.5 rounded-full
					${priorityBadges[task.priority].color}
				`}>
					{priorityBadges[task.priority].label}
				</span>
				
				{task.completed && (
					<CheckCircle2 className="w-4 h-4 text-muted-foreground" />
				)}
			</div>

			{/* Task Content */}
			<div 
				className={`text-sm font-medium mb-2 line-clamp-3 ${
					task.completed ? 'line-through text-muted-foreground' : 'text-foreground'
				}`}
				dangerouslySetInnerHTML={{ __html: task.content }}
			/>

			{/* Project Badge */}
			{task.project && (
				<div className="mb-2">
					<span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/50 font-medium">
						{task.project.title}
					</span>
				</div>
			)}

			{/* Tags */}
			{tags.length > 0 && (
				<div className="flex flex-wrap gap-1 mb-2">
					{tags.slice(0, 3).map((tag, idx) => (
						<span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
							{tag}
						</span>
					))}
					{tags.length > 3 && (
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
							+{tags.length - 3}
						</span>
					)}
				</div>
			)}

			{/* Due Date */}
			{task.dueAt && (
				<div className={`flex items-center gap-1 text-[11px] mb-2 ${
					isOverdue ? 'text-foreground font-semibold' : 
					isDueToday ? 'text-foreground font-medium' : 
					'text-muted-foreground'
				}`}>
					<Calendar className="w-3 h-3" />
					<span>{new Date(task.dueAt).toLocaleDateString()}</span>
					{isOverdue && <AlertCircle className="w-3 h-3" />}
				</div>
			)}

			{/* Reminder */}
			{task.reminderAt && (
				<div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-2">
					<Clock className="w-3 h-3" />
					<span>Reminder set</span>
				</div>
			)}

			{/* Recurrence */}
			{task.recurrence && (
				<div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-2">
					<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					<span>Recurring</span>
				</div>
			)}

			{/* Footer - Metadata */}
			<div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/30">
				<div className="flex items-center gap-3">
					{commentCount > 0 && (
						<div className="flex items-center gap-1">
							<MessageSquare className="w-3 h-3" />
							<span>{commentCount}</span>
						</div>
					)}
					{subtaskCount > 0 && (
						<div className="flex items-center gap-1">
							<CheckCircle2 className="w-3 h-3" />
							<span>{subtaskCount}</span>
						</div>
					)}
					{(task.dependsOn?.length || 0) > 0 && (
						<div className="flex items-center gap-1">
							<Paperclip className="w-3 h-3" />
							<span>{task.dependsOn?.length}</span>
						</div>
					)}
				</div>
				
				<div className="text-[10px]">
					{new Date(task.createdAt).toLocaleDateString()}
				</div>
			</div>
		</div>
	)
}
